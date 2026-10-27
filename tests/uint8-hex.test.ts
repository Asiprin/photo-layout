import { describe, it, expect } from 'vitest';
import { bytesToHex } from '../src/io/uint8-hex-polyfill';

describe('Uint8Array.toHex 兼容补丁', () => {
  it('bytesToHex 输出与原生 toHex 语义一致（小写、无前缀）', () => {
    expect(bytesToHex(new Uint8Array([0x0a, 0xbc, 0xff, 0x00]))).toBe('0abcff00');
    expect(bytesToHex(new Uint8Array([]))).toBe('');
  });

  it('模块加载后 toHex 一定可用（原生或补丁）', () => {
    const arr = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const withToHex = arr as Uint8Array & { toHex(): string };
    expect(typeof withToHex.toHex).toBe('function');
    expect(withToHex.toHex()).toBe('deadbeef');
  });
});
