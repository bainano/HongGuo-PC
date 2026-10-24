// 为引擎 vm 沙箱提供 crypto 对象：
// 优先使用 node:crypto 原生算法；对当前运行时加密库不支持的算法
// （Electron 内置 Node 的 BoringSSL 不支持 sm3）回退到纯 JS 实现。
import crypto from 'node:crypto';
import { createSm3Hash } from './sm3.mjs';

const JS_FALLBACKS = new Map([['sm3', createSm3Hash]]);

export function createEngineCrypto() {
  const nativeCreateHash = crypto.createHash.bind(crypto);
  const engineCrypto = Object.create(crypto);
  engineCrypto.createHash = (algorithm) => {
    try {
      return nativeCreateHash(algorithm);
    } catch (error) {
      const factory = JS_FALLBACKS.get(String(algorithm).toLowerCase());
      if (factory) return factory();
      throw error;
    }
  };
  return engineCrypto;
}
