/**
 * 排版引擎（纯函数，无 DOM 依赖）
 * 输入：画布/照片尺寸/边距/间距/方向/份数 → 输出：每页网格与格子坐标（mm）
 */

export type Direction = 'auto' | 'portrait' | 'landscape';

export interface LayoutConfig {
  /** 画布（纸张）尺寸 mm */
  canvasW: number;
  canvasH: number;
  /** 照片模板尺寸 mm（按竖版定义，w<h 允许任意） */
  photoW: number;
  photoH: number;
  /** 页边距 mm */
  margin: number;
  /** 照片间距 mm */
  gap: number;
  /** 摆放方向：auto=取排得更多的一种 */
  direction: Direction;
  /** 网格整体在页面内居中 */
  center: boolean;
}

export interface Cell {
  /** 左上角坐标 mm（页面坐标系，y 自上而下） */
  x: number;
  y: number;
  /** 实际尺寸 mm（含方向旋转） */
  w: number;
  h: number;
  col: number;
  row: number;
}

export interface LayoutResult {
  pageW: number;
  pageH: number;
  /** 页面上每张照片的实际尺寸 mm */
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  perPage: number;
  orientation: 'portrait' | 'landscape';
  /** 每页的格子（最后一页可能不满） */
  pages: Cell[][];
  /** false = 一张都放不下 */
  fits: boolean;
}

/** 单个方向下的网格容量 */
export function gridCapacity(
  canvasW: number,
  canvasH: number,
  cellW: number,
  cellH: number,
  margin: number,
  gap: number,
): { cols: number; rows: number } {
  const availW = canvasW - margin * 2;
  const availH = canvasH - margin * 2;
  if (availW <= 0 || availH <= 0 || cellW <= 0 || cellH <= 0) return { cols: 0, rows: 0 };
  const cols = Math.floor((availW + gap) / (cellW + gap));
  const rows = Math.floor((availH + gap) / (cellH + gap));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

/**
 * 计算排版：返回格子坐标与分页
 * @param cellCount 需要排版的照片总格数（含重复份数）
 */
export function computeLayout(config: LayoutConfig, cellCount: number): LayoutResult {
  const { canvasW, canvasH, photoW, photoH, margin, gap, center } = config;

  // 方向语义按真实朝向归一：竖放 = 高≥宽，横放 = 宽≥高
  // （与模板定义顺序无关，避免"宽>高"的模板横竖颠倒）
  const portraitW = Math.min(photoW, photoH);
  const portraitH = Math.max(photoW, photoH);
  const p = gridCapacity(canvasW, canvasH, portraitW, portraitH, margin, gap);
  const l = gridCapacity(canvasW, canvasH, portraitH, portraitW, margin, gap);

  let orientation: 'portrait' | 'landscape';
  if (config.direction === 'portrait') orientation = 'portrait';
  else if (config.direction === 'landscape') orientation = 'landscape';
  else orientation = l.cols * l.rows > p.cols * p.rows ? 'landscape' : 'portrait';

  const cellW = orientation === 'portrait' ? portraitW : portraitH;
  const cellH = orientation === 'portrait' ? portraitH : portraitW;
  const { cols, rows } = orientation === 'portrait' ? p : l;
  const perPage = cols * rows;

  const pages: Cell[][] = [];
  if (perPage > 0 && cellCount > 0) {
    const pageCount = Math.ceil(cellCount / perPage);
    // 网格整体尺寸（居中用）
    const blockW = cols * cellW + (cols - 1) * gap;
    const blockH = rows * cellH + (rows - 1) * gap;
    const startX = center ? (canvasW - blockW) / 2 : margin;
    const startY = center ? (canvasH - blockH) / 2 : margin;

    let placed = 0;
    for (let pg = 0; pg < pageCount; pg++) {
      const cells: Cell[] = [];
      const n = Math.min(perPage, cellCount - placed);
      for (let i = 0; i < n; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        cells.push({
          x: startX + col * (cellW + gap),
          y: startY + row * (cellH + gap),
          w: cellW,
          h: cellH,
          col,
          row,
        });
        placed++;
      }
      pages.push(cells);
    }
  }

  return {
    pageW: canvasW,
    pageH: canvasH,
    cellW,
    cellH,
    cols,
    rows,
    perPage,
    orientation,
    pages,
    fits: perPage > 0,
  };
}

/**
 * 裁切线：每格四角向外伸出的短线（页面坐标 mm）
 * 空间不足（gap 和 margin 都很小）时自动缩短或省略
 */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 裁切线：照片四边的长线段（虚线样式由渲染层负责）
 * 相邻照片的边线会成对出现在间距里，即标准的"沿虚线裁切"导引
 */
export function cutMarksForCell(cell: Cell): Segment[] {
  const { x, y, w, h } = cell;
  return [
    { x1: x, y1: y, x2: x + w, y2: y },
    { x1: x, y1: y + h, x2: x + w, y2: y + h },
    { x1: x, y1: y, x2: x, y2: y + h },
    { x1: x + w, y1: y, x2: x + w, y2: y + h },
  ];
}

/** 裁切线：四角 L 形短线 */
export function cornerCutsForCell(
  cell: Cell,
  pageW: number,
  pageH: number,
  gap: number,
  margin: number,
  markLen = 3,
): Segment[] {
  const space = Math.max(gap / 2, Math.min(margin, gap > 0 ? gap / 2 : margin));
  const len = Math.min(markLen, space);
  if (len < 0.4) return [];
  const inset = 0.4; // 距角点的小豁口 mm
  const segs: Segment[] = [];
  const corners = [
    { x: cell.x, y: cell.y, dx: -1, dy: -1 },
    { x: cell.x + cell.w, y: cell.y, dx: 1, dy: -1 },
    { x: cell.x, y: cell.y + cell.h, dx: -1, dy: 1 },
    { x: cell.x + cell.w, y: cell.y + cell.h, dx: 1, dy: 1 },
  ];
  for (const c of corners) {
    const hx1 = c.x + c.dx * inset;
    const hx2 = c.x + c.dx * len;
    if (hx1 >= 0 && hx2 <= pageW) segs.push({ x1: hx1, y1: c.y, x2: hx2, y2: c.y });
    const vy1 = c.y + c.dy * inset;
    const vy2 = c.y + c.dy * len;
    if (vy1 >= 0 && vy2 <= pageH) segs.push({ x1: c.x, y1: vy1, x2: c.x, y2: vy2 });
  }
  return segs;
}

/** 把条目列表按每页容量分页 */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage <= 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) out.push(items.slice(i, i + perPage));
  return out;
}
