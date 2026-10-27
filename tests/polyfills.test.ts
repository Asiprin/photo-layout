import { describe, it, expect } from 'vitest';
import '../src/polyfills';

describe('Promise.try 补丁', () => {
  it('正常返回值被包装为 Promise', async () => {
    await expect((Promise as any).try(() => 42)).resolves.toBe(42);
    await expect((Promise as any).try((a: number, b: number) => a + b, 1, 2)).resolves.toBe(3);
  });

  it('抛错变成 rejected', async () => {
    await expect(
      (Promise as any).try(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});

describe('Set 集合方法补丁', () => {
  it('intersection', () => {
    expect([...(new Set([1, 2, 3]) as any).intersection(new Set([2, 3, 4]))]).toEqual([2, 3]);
  });

  it('union / difference / symmetricDifference', () => {
    expect([...(new Set([1, 2]) as any).union(new Set([2, 3]))].sort()).toEqual([1, 2, 3]);
    expect([...(new Set([1, 2, 3]) as any).difference(new Set([3]))]).toEqual([1, 2]);
    expect([...(new Set([1, 2]) as any).symmetricDifference(new Set([2, 3]))].sort()).toEqual([1, 3]);
  });

  it('isSubsetOf / isSupersetOf / isDisjointFrom', () => {
    expect((new Set([1, 2]) as any).isSubsetOf(new Set([1, 2, 3]))).toBe(true);
    expect((new Set([1, 2, 3]) as any).isSupersetOf(new Set([2]))).toBe(true);
    expect((new Set([1]) as any).isDisjointFrom(new Set([2]))).toBe(true);
    expect((new Set([1]) as any).isDisjointFrom(new Set([1, 2]))).toBe(false);
  });
});

describe('ArrayBuffer.transfer 补丁', () => {
  it('transferToFixedLength 支持截断长度', () => {
    const cut = (new Uint8Array([1, 2, 3, 4]).buffer as any).transferToFixedLength(2);
    expect(cut.byteLength).toBe(2);
    expect([...new Uint8Array(cut)]).toEqual([1, 2]);
    const full = (new Uint8Array([1, 2, 3, 4]).buffer as any).transfer();
    expect(full.byteLength).toBe(4);
    expect([...new Uint8Array(full)]).toEqual([1, 2, 3, 4]);
  });
});
