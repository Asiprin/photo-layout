import { describe, it, expect } from 'vitest';
import { coverCrop, containRect } from '../src/engine/crop';

describe('coverCrop（居中裁剪填满）', () => {
  it('源图更宽 → 裁左右', () => {
    const r = coverCrop(4000, 3000, 35, 49); // 4:3 → 5:7
    expect(r.h).toBe(3000);
    expect(r.w).toBeCloseTo(3000 * (35 / 49), 6);
    expect(r.x).toBeCloseTo((4000 - r.w) / 2, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('源图更高 → 裁上下', () => {
    const r = coverCrop(3000, 4000, 152, 102); // 竖图打横版目标
    expect(r.w).toBe(3000);
    expect(r.h).toBeCloseTo(3000 / (152 / 102), 6);
  });

  it('比例一致 → 不裁', () => {
    const r = coverCrop(350, 490, 35, 49);
    expect(r).toEqual({ x: 0, y: 0, w: 350, h: 490 });
  });

  it('焦点移动改变裁剪位置，且被夹紧在源图内', () => {
    const r = coverCrop(4000, 3000, 35, 49, 1, 1);
    expect(r.x + r.w).toBeCloseTo(4000, 6);
    const r2 = coverCrop(4000, 3000, 35, 49, -5, 2);
    expect(r2.x).toBeCloseTo(0, 6);
  });
});

describe('containRect（缩放留白）', () => {
  it('方图放入竖框 → 两侧留白', () => {
    const r = containRect(3000, 3000, 35, 49);
    expect(r.w).toBeCloseTo(35, 6);
    expect(r.h).toBeCloseTo(35, 6);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(7, 6);
  });

  it('横图放入竖框 → 上下留白', () => {
    const r = containRect(152, 102, 102, 152);
    expect(r.w).toBeCloseTo(102, 6);
    expect(r.h).toBeCloseTo(102 * (102 / 152), 6);
  });
});
