import { sharedResource, upstreamRequestSignal } from '../server/provider.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

let instanceSequence = 0;
const processTag = randomUUID();
const MiB = 1024 * 1024;
const cancelled = signal => { if (signal?.aborted) throw signal.reason || new Error('Video request cancelled'); };

/** Bounded ciphertext cache. No URL, key, plaintext or media data is persisted. */
export class VideoCache {
  constructor({ load, enabled = true, maxBytes = 128 * MiB, fullMaxBytes = 30 * MiB,
    chunkSize = MiB, l1Bytes = 4 * MiB, seconds = 5, ttlMs = 300000, now = Date.now, concurrency = 4 } = {}) {
    if (typeof load !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < chunkSize || chunkSize < 1) throw Error('Invalid video cache configuration');
    Object.assign(this, { load, enabled, maxBytes, fullMaxBytes, chunkSize, l1Bytes, seconds, ttlMs, now, concurrency });
    this.prefix = `video-cache:${processTag}:${++instanceSequence}:`; this.identities = new WeakMap(); this.nextId = 0;
    this.chunks = new Map(); this.queue = []; this.active = 0; this.background = 0; this.closed = false;
    this.shutdown = new AbortController(); this.usedBytes = 0;
    this.metrics = { peakBytes: 0, hits: 0, misses: 0, fetchedBytes: 0, evictions: 0, peakActive: 0 };
  }
  identity(stream, total) {
    let meta = this.identities.get(stream);
    if (!meta) { meta = { id: ++this.nextId, total, fetchedBytes: 0 }; this.identities.set(stream, meta); }
    if (meta.total !== total) throw Error('媒体 Range 总长度不符');
    return meta;
  }
  remove(key) { const entry = this.chunks.get(key); if (entry) { this.usedBytes -= entry.data.length; this.chunks.delete(key); } }
  etag(stream, prepared) { return `"${this.prefix}${this.identity(stream, prepared.total).id}:${prepared.total}"`; }
  get(key) {
    const entry = this.chunks.get(key); if (!entry) return null;
    if (this.now() - entry.time >= this.ttlMs) { this.remove(key); return null; }
    this.chunks.delete(key); this.chunks.set(key, entry); return entry.data;
  }
  put(key, bytes) {
    if (this.closed || bytes.length > this.maxBytes) return;
    this.remove(key);
    while (this.usedBytes + bytes.length > this.maxBytes || this.chunks.size >= 2048) { this.remove(this.chunks.keys().next().value); this.metrics.evictions++; }
    // Own precisely the validated slice: a 200 fallback may otherwise retain a whole file's backing buffer.
    const data = Buffer.from(bytes); this.chunks.set(key, { data, time: this.now() }); this.usedBytes += data.length;
    this.metrics.peakBytes = Math.max(this.metrics.peakBytes, this.usedBytes);
  }
  schedule(work, key, foreground, signal) {
    cancelled(signal);
    return new Promise((resolve, reject) => {
      const ticket = { work: AsyncLocalStorage.bind(work), key, foreground, resolve, reject, signal };
      ticket.abort = () => { const index = this.queue.indexOf(ticket); if (index >= 0) this.queue.splice(index, 1); reject(signal.reason); };
      signal.addEventListener('abort', ticket.abort, { once: true }); this.queue.push(ticket); this.pump();
    });
  }
  pump() {
    while (!this.closed && this.active < this.concurrency && this.queue.length) {
      let index = this.queue.findIndex(ticket => ticket.foreground);
      if (index < 0) { if (this.background >= Math.max(1, this.concurrency - 2)) return; index = 0; }
      const ticket = this.queue.splice(index, 1)[0]; ticket.signal.removeEventListener('abort', ticket.abort);
      if (ticket.signal.aborted) { ticket.reject(ticket.signal.reason); continue; }
      this.active++; if (!ticket.foreground) this.background++;
      this.metrics.peakActive = Math.max(this.metrics.peakActive, this.active);
      Promise.resolve().then(ticket.work).then(ticket.resolve, ticket.reject).finally(() => {
        this.active--; if (!ticket.foreground) this.background--; this.pump();
      });
    }
  }
  async chunk(stream, prepared, index, signal, foreground) {
    cancelled(signal); if (this.closed) throw Error('Video cache closed');
    const meta = this.identity(stream, prepared.total), key = this.prefix + meta.id + ':' + index;
    const cached = this.get(key);
    if (cached) { this.metrics.hits++; return cached; }
    this.metrics.misses++;
    if (foreground) {
      for (const ticket of this.queue) if (ticket.key === key) ticket.foreground = true;
      this.pump();
    }
    return sharedResource(key, () => {
      const combined = AbortSignal.any([upstreamRequestSignal(), this.shutdown.signal]);
      return this.schedule(async () => {
        cancelled(combined);
        const start = index * this.chunkSize, end = Math.min(prepared.total - 1, start + this.chunkSize - 1);
        const result = await this.load(stream, start, end, combined);
        cancelled(combined);
        if (result.total !== prepared.total) throw Error('媒体 Range 总长度不符');
        if (!Buffer.isBuffer(result.data) || result.data.length !== end - start + 1) throw Error('媒体 Range 长度异常');
        this.metrics.fetchedBytes += result.data.length; meta.fetchedBytes += result.data.length;
        this.put(key, result.data); return result.data;
      }, key, foreground, combined);
    }, { signal });
  }
  async read(stream, prepared, start, end, signal) {
    cancelled(signal);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= prepared.total) throw Error('媒体 Range 偏移不符');
    if (!this.enabled) return this.load(stream, start, end, signal);
    // O1 already owns this 256KiB header block. Do not turn a short startup
    // Range into an unnecessary 1MiB transfer just to populate a cache grid.
    if (start === 0 && end < (stream.firstRange?.data?.length || 0)) {
      const result = await this.load(stream, start, end, signal);
      if (result.total !== prepared.total || result.data.length !== end - start + 1) throw Error('媒体 Range 长度异常');
      this.metrics.hits++; return result;
    }
    const pieces = [];
    for (let index = Math.floor(start / this.chunkSize); index <= Math.floor(end / this.chunkSize); index++) {
      const data = await this.chunk(stream, prepared, index, signal, true), base = index * this.chunkSize;
      pieces.push(data.subarray(Math.max(0, start - base), Math.min(data.length, end - base + 1)));
    }
    return { data: Buffer.concat(pieces), total: prepared.total };
  }
  async warm(stream, prepared, { level = 'l1', bitrate = 0, signal } = {}) {
    cancelled(signal);
    if (!this.enabled) return { enabled: false, requestedLevel: level, cachedBytes: 0 };
    const meta = this.identity(stream, prepared.total), before = meta.fetchedBytes;
    const full = level === 'l2' && prepared.total <= Math.min(this.fullMaxBytes, this.maxBytes / 2);
    const estimate = bitrate > 0 ? Math.ceil(bitrate * this.seconds / 8) : this.l1Bytes;
    const prefix = Math.min(Math.max(this.chunkSize, Math.floor(this.maxBytes / 4)), 16 * MiB);
    const targetBytes = full ? prepared.total : Math.min(prepared.total, prefix, (prepared.header?.length || 0) + estimate);
    for (let index = 0; index < Math.ceil(targetBytes / this.chunkSize); index++) await this.chunk(stream, prepared, index, signal, false);
    let cachedBytes = 0;
    for (let index = 0; index < Math.ceil(prepared.total / this.chunkSize); index++) {
      const data = this.get(this.prefix + meta.id + ':' + index); if (!data) break; cachedBytes += data.length;
    }
    return { enabled: true, requestedLevel: level, effectiveLevel: full ? 'l2' : 'l1', downgraded: level === 'l2' && !full,
      targetBytes, cachedBytes, complete: cachedBytes === prepared.total, networkBytesDelta: meta.fetchedBytes - before };
  }
  snapshot() {
    for (const [key, entry] of this.chunks) if (this.now() - entry.time >= this.ttlMs) this.remove(key);
    const memory = process.memoryUsage();
    return { enabled: this.enabled, maxBytes: this.maxBytes, usedBytes: this.usedBytes, chunks: this.chunks.size,
      active: this.active, queued: this.queue.length, ...this.metrics,
      processMemory: { rssBytes: memory.rss, externalBytes: memory.external, heapUsedBytes: memory.heapUsed } };
  }
  close() { this.closed = true; this.shutdown.abort(); for (const ticket of [...this.queue]) ticket.abort(); this.chunks.clear(); this.usedBytes = 0; }
}
