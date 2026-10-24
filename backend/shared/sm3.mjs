// 纯 JS SM3（GB/T 32905-2016）摘要实现，接口与 node:crypto 的 Hash 兼容（update/digest）。
//
// 背景：打包版桌面应用的后端跑在 Electron 内置 Node 上，其加密库为 BoringSSL，
// 不支持 sm3 摘要算法（crypto.createHash('sm3') 抛 "Digest method not supported"），
// 而官方视频接口的请求签名依赖 sm3。开发模式使用系统 Node（OpenSSL 3）无此问题，
// 因此该缺陷仅在打包后暴露，表现为播放页清晰度接口 502（UPSTREAM_UNAVAILABLE）。
// 本模块作为引擎 vm 沙箱内 crypto 的回退实现（见 shared/engine-crypto.mjs）。

const IV = [
  0x7380166f, 0x4914b2b9, 0x172442d7, 0xda8a0600,
  0xa96f30bc, 0x163138aa, 0xe38dee4d, 0xb0fb0e4e,
];

const BLOCK_SIZE = 64;
const DIGEST_SIZE = 32;

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
const P0 = (x) => (x ^ rotl(x, 9) ^ rotl(x, 17)) >>> 0;
const P1 = (x) => (x ^ rotl(x, 15) ^ rotl(x, 23)) >>> 0;
const T = (j) => (j < 16 ? 0x79cc4519 : 0x7a879d8a) >>> 0;
const FF = (x, y, z, j) => (j < 16 ? x ^ y ^ z : (x & y) | (x & z) | (y & z)) >>> 0;
const GG = (x, y, z, j) => (j < 16 ? x ^ y ^ z : (x & y) | (~x & z)) >>> 0;

function compress(state, block) {
  const W = new Array(68);
  for (let i = 0; i < 16; i += 1) W[i] = block.readUInt32BE(i * 4);
  for (let i = 16; i < 68; i += 1) {
    W[i] = (P1((W[i - 16] ^ W[i - 9] ^ rotl(W[i - 3], 15)) >>> 0) ^ rotl(W[i - 13], 7) ^ W[i - 6]) >>> 0;
  }
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];
  for (let j = 0; j < 64; j += 1) {
    const ss1 = rotl((rotl(a, 12) + e + rotl(T(j), j % 32)) >>> 0, 7);
    const ss2 = (ss1 ^ rotl(a, 12)) >>> 0;
    const tt1 = (FF(a, b, c, j) + d + ss2 + (W[j] ^ W[j + 4])) >>> 0;
    const tt2 = (GG(e, f, g, j) + h + ss1 + W[j]) >>> 0;
    d = c;
    c = rotl(b, 9);
    b = a;
    a = tt1;
    h = g;
    g = rotl(f, 19);
    f = e;
    e = P0(tt2);
  }
  state[0] = (state[0] ^ a) >>> 0;
  state[1] = (state[1] ^ b) >>> 0;
  state[2] = (state[2] ^ c) >>> 0;
  state[3] = (state[3] ^ d) >>> 0;
  state[4] = (state[4] ^ e) >>> 0;
  state[5] = (state[5] ^ f) >>> 0;
  state[6] = (state[6] ^ g) >>> 0;
  state[7] = (state[7] ^ h) >>> 0;
}

function toBuffer(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw new TypeError('sm3: unsupported input type');
}

export class Sm3Hash {
  constructor() {
    this.state = IV.slice();
    this._buffer = Buffer.alloc(BLOCK_SIZE);
    this._buffered = 0;
    this._total = 0;
  }

  update(data) {
    const input = toBuffer(data);
    this._total += input.length;
    let offset = 0;
    if (this._buffered > 0) {
      const take = Math.min(BLOCK_SIZE - this._buffered, input.length);
      input.copy(this._buffer, this._buffered, 0, take);
      this._buffered += take;
      offset = take;
      if (this._buffered === BLOCK_SIZE) {
        compress(this.state, this._buffer);
        this._buffered = 0;
      }
    }
    while (offset + BLOCK_SIZE <= input.length) {
      compress(this.state, input.subarray(offset, offset + BLOCK_SIZE));
      offset += BLOCK_SIZE;
    }
    if (offset < input.length) {
      input.copy(this._buffer, 0, offset);
      this._buffered = input.length - offset;
    }
    return this;
  }

  digest(encoding) {
    const state = this.state.slice();
    const bitLen = this._total * 8;
    const rest = this._buffered;
    const blocks = [];
    const last = Buffer.alloc(BLOCK_SIZE);
    if (rest > 0) this._buffer.copy(last, 0, 0, rest);
    last[rest] = 0x80;
    blocks.push(last);
    // 长度字段固定占用最后 8 字节；当 0x80 落点与长度字段重叠时需要补一个整块
    if (rest >= BLOCK_SIZE - 8) blocks.push(Buffer.alloc(BLOCK_SIZE));
    const finalBlock = blocks[blocks.length - 1];
    finalBlock.writeUInt32BE(Math.floor(bitLen / 0x100000000) >>> 0, 56);
    finalBlock.writeUInt32BE(bitLen >>> 0, 60);
    for (const block of blocks) compress(state, block);
    const out = Buffer.alloc(DIGEST_SIZE);
    for (let i = 0; i < 8; i += 1) out.writeUInt32BE(state[i] >>> 0, i * 4);
    return encoding ? out.toString(encoding) : out;
  }
}

export function createSm3Hash() {
  return new Sm3Hash();
}
