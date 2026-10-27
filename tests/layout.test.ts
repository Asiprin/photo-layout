import { describe, it, expect } from 'vitest';
import { mmToPt, ptToMm, mmToPx, pxToMm } from '../src/engine/sizes';
import {
  computeLayout,
  gridCapacity,
  paginate,
  cutMarksForCell,
  type LayoutConfig,
} from '../src/engine/layout';

const a4 = { canvasW: 210, canvasH: 297 };
const base: LayoutConfig = {
  ...a4,
  photoW: 35,
  photoH: 49,
  margin: 5,
  gap: 2,
  direction: 'auto',
  center: true,
};

describe('单位换算', () => {
  it('mm/pt 互转精确', () => {
    expect(mmToPt(210)).toBeCloseTo(595.276, 2);
    expect(mmToPt(297)).toBeCloseTo(841.89, 2);
    expect(ptToMm(mmToPt(123.4))).toBeCloseTo(123.4, 6);
    expect(pxToMm(mmToPx(50, 300), 300)).toBeCloseTo(50, 6);
  });
});

describe('网格容量', () => {
  it('A4 + 2寸(35×49)：竖放 5×5=25，横放 3×7=21', () => {
    expect(gridCapacity(210, 297, 35, 49, 5, 2)).toEqual({ cols: 5, rows: 5 });
    expect(gridCapacity(210, 297, 49, 35, 5, 2)).toEqual({ cols: 3, rows: 7 });
  });

  it('A4 + 6寸(102×152)：横放 1×2，正好 2 张', () => {
    expect(gridCapacity(210, 297, 152, 102, 5, 2)).toEqual({ cols: 1, rows: 2 });
    expect(gridCapacity(210, 297, 102, 152, 5, 2)).toEqual({ cols: 1, rows: 1 });
  });

  it('照片比画布大 → 0×0', () => {
    expect(gridCapacity(210, 297, 300, 400, 0, 0)).toEqual({ cols: 0, rows: 0 });
  });
});

describe('computeLayout', () => {
  it('auto 方向选容量大的：6寸 → 横放 2 张', () => {
    const r = computeLayout({ ...base, photoW: 102, photoH: 152 }, 2);
    expect(r.orientation).toBe('landscape');
    expect(r.perPage).toBe(2);
    expect(r.cellW).toBe(152);
    expect(r.cellH).toBe(102);
    expect(r.pages.length).toBe(1);
    expect(r.pages[0].length).toBe(2);
    // 两张都排在页面内
    for (const c of r.pages[0]) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(210);
      expect(c.y + c.h).toBeLessThanOrEqual(297);
    }
  });

  it('2寸 × 8 份 → 1 页（容量 25）', () => {
    const r = computeLayout(base, 8);
    expect(r.perPage).toBe(25);
    expect(r.pages.length).toBe(1);
    expect(r.pages[0]).toHaveLength(8);
  });

  it('1寸 50 份 → 1 页放 49+1，分 2 页', () => {
    const r = computeLayout({ ...base, photoW: 25, photoH: 35 }, 50);
    expect(r.perPage).toBe(50); // 横放 5×10=50 大于竖放 7×7=49
    expect(r.orientation).toBe('landscape');
    const r2 = computeLayout({ ...base, photoW: 25, photoH: 35, direction: 'portrait' }, 50);
    expect(r2.perPage).toBe(49);
    expect(r2.pages.map((p) => p.length)).toEqual([49, 1]);
  });

  it('居中：网格块起点 = (页面-块尺寸)/2', () => {
    const r = computeLayout({ ...base, photoW: 35, photoH: 49, direction: 'portrait' }, 1);
    // 块宽 = 5×35+4×2 = 183 → x=(210-183)/2=13.5（首格）
    expect(r.pages[0][0].x).toBeCloseTo(13.5, 6);
    // 块高 = 5×49+4×2 = 253 → y=(297-253)/2=22
    expect(r.pages[0][0].y).toBeCloseTo(22, 6);
  });

  it('不居中：从 margin 起排', () => {
    const r = computeLayout({ ...base, direction: 'portrait', center: false }, 1);
    expect(r.pages[0][0].x).toBeCloseTo(5, 6);
    expect(r.pages[0][0].y).toBeCloseTo(5, 6);
  });

  it('margin=0 gap=0：满铺 A4 放 2寸 6×6=36', () => {
    const r = computeLayout({ ...base, margin: 0, gap: 0, direction: 'portrait' }, 100);
    expect(r.perPage).toBe(36); // 6×35=210, 6×49=294
    expect(r.pages.map((p) => p.length)).toEqual([36, 36, 28]);
  });

  it('放不下时 fits=false 且不产页', () => {
    const r = computeLayout({ ...base, photoW: 300, photoH: 400 }, 4);
    expect(r.fits).toBe(false);
    expect(r.pages).toHaveLength(0);
  });

  it('0 份 → 无页', () => {
    const r = computeLayout(base, 0);
    expect(r.pages).toHaveLength(0);
  });
});

describe('裁切线', () => {
  it('每格 4 条长线（四边），不出血到页面外', () => {
    const r = computeLayout({ ...base, direction: 'portrait', center: false }, 1);
    const cell = r.pages[0][0];
    const segs = cutMarksForCell(cell);
    expect(segs.length).toBe(4);
    for (const s of segs) {
      expect(Math.min(s.x1, s.x2)).toBeGreaterThanOrEqual(0);
      expect(Math.max(s.x1, s.x2)).toBeLessThanOrEqual(210);
      expect(Math.min(s.y1, s.y2)).toBeGreaterThanOrEqual(0);
      expect(Math.max(s.y1, s.y2)).toBeLessThanOrEqual(297);
    }
  });

  it('线段覆盖格子的四条边', () => {
    const cell = { x: 10, y: 20, w: 35, h: 49, col: 0, row: 0 };
    const segs = cutMarksForCell(cell);
    expect(segs).toContainEqual({ x1: 10, y1: 20, x2: 45, y2: 20 });
    expect(segs).toContainEqual({ x1: 10, y1: 69, x2: 45, y2: 69 });
    expect(segs).toContainEqual({ x1: 10, y1: 20, x2: 10, y2: 69 });
    expect(segs).toContainEqual({ x1: 45, y1: 20, x2: 45, y2: 69 });
  });
});

describe('paginate', () => {
  it('按容量分页', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(paginate([], 3)).toEqual([]);
    expect(paginate([1], 0)).toEqual([]);
  });
});

describe('方向语义（宽>高模板不反转）', () => {
  const card = { canvasW: 210, canvasH: 297, photoW: 85.6, photoH: 54, margin: 5, gap: 2, center: false };

  it('卡片模板 + 竖放 = 54×85.6', () => {
    const r = computeLayout({ ...card, direction: 'portrait' }, 1);
    expect(r.cellW).toBeCloseTo(54);
    expect(r.cellH).toBeCloseTo(85.6);
  });

  it('卡片模板 + 横放 = 85.6×54', () => {
    const r = computeLayout({ ...card, direction: 'landscape' }, 1);
    expect(r.cellW).toBeCloseTo(85.6);
    expect(r.cellH).toBeCloseTo(54);
  });

  it('排得多优先：横放 2列×5行=10 > 竖放 3列×3行=9，取横放', () => {
    const r = computeLayout({ ...card, direction: 'auto' }, 1);
    expect(r.cellW).toBeCloseTo(85.6);
    expect(r.cellH).toBeCloseTo(54);
    expect(r.perPage).toBe(10);
  });
});
