/**
 * Uint8Array.prototype.toHex 兼容补丁
 *
 * pdf.js 计算 PDF 文件指纹后调用 bytes.toHex()。这个方法是 2025 年才进入
 * 浏览器的新 API（Uint8Array 十六进制转换提案，Chrome 135+ / Safari 26+），
 * pdf.js 没有自带降级实现，老版本 Chrome 会报
 * "hashOriginal.toHex is not a function"。
 *
 * 此补丁在主线程与 pdf.js worker 两侧都会加载（worker 才是指纹计算的地方）。
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

type MaybeToHex = { toHex?: () => string };

if (typeof (Uint8Array.prototype as unknown as MaybeToHex).toHex !== 'function') {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array): string {
      return bytesToHex(this);
    },
    configurable: true,
    writable: true,
    enumerable: false,
  });
}
