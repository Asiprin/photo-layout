/**
 * 运行时 polyfill
 * pdfjs v6 使用了 Map.prototype.getOrInsert/Computed（ES 提案），
 * 部分浏览器（含较新的 Electron/Chromium 构建）尚未提供，这里补齐。
 */

/**
 * Iterator（Iterator Helpers 提案，Chrome 122+ / Safari 26+）
 * pdf.js 共享代码在模块求值期就访问 Iterator.prototype，
 * iOS 18.x 及更早的 Safari 报 "Can't find variable: Iterator"，
 * 整个界面初始化中断。这里按规范语义补齐：
 * Iterator.prototype 就是 %IteratorPrototype%（所有迭代器的共同原型）。
 */
type IteratorGlobal = { Iterator?: unknown };

if (typeof (globalThis as IteratorGlobal).Iterator === 'undefined') {
  // %IteratorPrototype%：生成器实例向上两级就是它
  const IteratorPrototype = Object.getPrototypeOf(
    Object.getPrototypeOf((function* () {})()),
  ) as Record<string | symbol, unknown>;

  const IteratorCtor = function Iterator(): never {
    throw new TypeError('Iterator is abstract');
  } as unknown as { prototype: unknown; from?: unknown };
  Object.defineProperty(IteratorCtor, 'prototype', {
    value: IteratorPrototype,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  // 常用迭代器助手（缺失才补，语义对齐提案）
  if (typeof IteratorPrototype.map !== 'function') {
    IteratorPrototype.map = function* <T, R>(this: IterableIterator<T>, fn: (v: T, i: number) => R) {
      let i = 0;
      for (const v of this) yield fn(v, i++);
    };
  }
  if (typeof IteratorPrototype.filter !== 'function') {
    IteratorPrototype.filter = function* <T>(this: IterableIterator<T>, fn: (v: T, i: number) => boolean) {
      let i = 0;
      for (const v of this) if (fn(v, i++)) yield v;
    };
  }
  if (typeof IteratorPrototype.take !== 'function') {
    IteratorPrototype.take = function* <T>(this: IterableIterator<T>, n: number) {
      if (n <= 0) return;
      let taken = 0;
      for (const v of this) {
        yield v;
        if (++taken >= n) return;
      }
    };
  }
  if (typeof IteratorPrototype.drop !== 'function') {
    IteratorPrototype.drop = function* <T>(this: IterableIterator<T>, n: number) {
      let skipped = 0;
      for (const v of this) {
        if (skipped++ < n) continue;
        yield v;
      }
    };
  }
  if (typeof IteratorPrototype.forEach !== 'function') {
    IteratorPrototype.forEach = function <T>(this: IterableIterator<T>, fn: (v: T, i: number) => void) {
      let i = 0;
      for (const v of this) fn(v, i++);
    };
  }
  if (typeof IteratorPrototype.toArray !== 'function') {
    IteratorPrototype.toArray = function <T>(this: IterableIterator<T>): T[] {
      return [...this];
    };
  }

  (IteratorCtor as unknown as Record<string, unknown>).from = (o: unknown) => {
    if (o == null) throw new TypeError('Iterator.from requires an object');
    const it = typeof (o as Iterator<unknown>).next === 'function'
      ? (o as IterableIterator<unknown>)
      : (o as Iterable<unknown>)[Symbol.iterator]();
    return (function* () {
      for (;;) {
        const r = it.next();
        if (r.done) return;
        yield r.value;
      }
    })();
  };

  (globalThis as IteratorGlobal).Iterator = IteratorCtor;
}

/**
 * Promise.withResolvers（ES2024，Chrome 119+ / Safari 17.4+）
 * pdf.js 重度使用，Safari 17.3 及更早（含多数存量 iPhone）会直接抛
 * "Promise.withResolvers is not a function"，整个界面初始化中断。
 */
type PromiseWithResolvers = {
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (v: T | PromiseLike<T>) => void;
    reject: (r?: unknown) => void;
  };
};

if (typeof (Promise as unknown as PromiseWithResolvers).withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    value<T>(): {
      promise: Promise<T>;
      resolve: (v: T | PromiseLike<T>) => void;
      reject: (r?: unknown) => void;
    } {
      let resolve!: (v: T | PromiseLike<T>) => void;
      let reject!: (r?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * ArrayBuffer.prototype.transfer / transferToFixedLength（Chrome 114+ / Safari 17+）
 * pdf.js 在 worker 里编译字体时调用 buffer.transferToFixedLength()，
 * Safari 16（iOS 16）直接 TypeError，渲染永久挂起。原语义会 detach 原缓冲区，
 * JS 层无法 detach，这里返回等长拷贝，对 pdf.js 的用法完全等效。
 */
type ArrayBufferTransfer = {
  transfer?: (this: ArrayBuffer) => ArrayBuffer;
  transferToFixedLength?: (this: ArrayBuffer, newByteLength?: number) => ArrayBuffer;
};

function copyBuffer(src: ArrayBuffer, newByteLength?: number): ArrayBuffer {
  const len = newByteLength ?? src.byteLength;
  const next = new ArrayBuffer(len);
  new Uint8Array(next).set(new Uint8Array(src, 0, Math.min(len, src.byteLength)));
  return next;
}

if (typeof (ArrayBuffer.prototype as ArrayBufferTransfer).transferToFixedLength !== 'function') {
  Object.defineProperty(ArrayBuffer.prototype, 'transferToFixedLength', {
    value(this: ArrayBuffer, newByteLength?: number): ArrayBuffer {
      return copyBuffer(this, newByteLength);
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
if (typeof (ArrayBuffer.prototype as ArrayBufferTransfer).transfer !== 'function') {
  Object.defineProperty(ArrayBuffer.prototype, 'transfer', {
    value(this: ArrayBuffer): ArrayBuffer {
      return copyBuffer(this);
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * Promise.try（ES2025，Chrome 135+ / Safari 26+）
 * pdf.js 的消息派发直接调用 Promise.try(fn, ...args)，
 * Safari 18 及更早报 "Promise.try is not a function"。
 */
type PromiseTry = { try?: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T> };

if (typeof (Promise as unknown as PromiseTry).try !== 'function') {
  Object.defineProperty(Promise, 'try', {
    value<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
      return new Promise<T>((resolve) => {
        resolve(fn(...args));
      });
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

/**
 * Set 集合方法（Chrome 122+ / Safari 17+）
 * pdf.js 处理 PDF 内部命名跳转目标时调用 Set.prototype.intersection，
 * iOS 16（Safari 16）报 "...intersection is not a function"。
 * 这里补齐提案中的全部方法（支持 Set 与 set-like 对象）。
 */
type SetLike<T> = { has(v: T): boolean; keys(): IterableIterator<T>; size: number };
type SetMethods = {
  intersection?: unknown;
  union?: unknown;
  difference?: unknown;
  symmetricDifference?: unknown;
  isSubsetOf?: unknown;
  isSupersetOf?: unknown;
  isDisjointFrom?: unknown;
};

function toKeyed(set: SetLike<unknown>): Map<unknown, unknown> {
  if (set instanceof Set) return new Map(Array.from(set, (v) => [v, v]));
  const m = new Map<unknown, unknown>();
  for (const k of set.keys()) if (!m.has(k)) m.set(k, k);
  return m;
}

const setProto = Set.prototype as unknown as Record<string | symbol, unknown> & SetMethods;

if (typeof setProto.intersection !== 'function') {
  setProto.intersection = function <T>(this: Set<T>, other: SetLike<T>): Set<T> {
    const o = toKeyed(other as SetLike<unknown>);
    const result = new Set<T>();
    for (const v of this) if (o.has(v)) result.add(v);
    return result;
  };
  setProto.union = function <T>(this: Set<T>, other: SetLike<T>): Set<T> {
    const result = new Set<T>(this);
    for (const k of (other as SetLike<unknown>).keys()) result.add(k as T);
    return result;
  };
  setProto.difference = function <T>(this: Set<T>, other: SetLike<T>): Set<T> {
    const o = toKeyed(other as SetLike<unknown>);
    const result = new Set<T>();
    for (const v of this) if (!o.has(v)) result.add(v);
    return result;
  };
  setProto.symmetricDifference = function <T>(this: Set<T>, other: SetLike<T>): Set<T> {
    const o = toKeyed(other as SetLike<unknown>);
    const result = new Set<T>(this);
    for (const k of o.keys()) {
      if (result.has(k as T)) result.delete(k as T);
      else result.add(k as T);
    }
    return result;
  };
  setProto.isSubsetOf = function <T>(this: Set<T>, other: SetLike<T>): boolean {
    const o = toKeyed(other as SetLike<unknown>);
    for (const v of this) if (!o.has(v)) return false;
    return true;
  };
  setProto.isSupersetOf = function <T>(this: Set<T>, other: SetLike<T>): boolean {
    for (const k of (other as SetLike<unknown>).keys()) if (!this.has(k as T)) return false;
    return true;
  };
  setProto.isDisjointFrom = function <T>(this: Set<T>, other: SetLike<T>): boolean {
    const o = toKeyed(other as SetLike<unknown>);
    for (const v of this) if (o.has(v)) return false;
    return true;
  };
}

const proto = Map.prototype as unknown as Record<string, unknown>;

if (typeof proto.getOrInsert !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsert', {
    value(this: Map<unknown, unknown>, key: unknown, value: unknown): unknown {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

if (typeof proto.getOrInsertComputed !== 'function') {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value(this: Map<unknown, unknown>, key: unknown, cb: (k: unknown) => unknown): unknown {
      if (this.has(key)) return this.get(key);
      const v = cb(key);
      this.set(key, v);
      return v;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
