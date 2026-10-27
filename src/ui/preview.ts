/**
 * 预览渲染：把一页排版结果画到 canvas（屏显缩放，与导出共用同一套几何计算）
 */
import { coverCrop, containRect } from '../engine/crop';
import { cutMarksForCell, cornerCutsForCell, type Cell } from '../engine/layout';
import { orientedSource, needsRotation } from '../io/image';
import type { CutStyle } from '../io/export';
import type { PhotoItem } from '../io/image';
import type { FitMode } from '../io/export';

export interface PreviewOptions {
  fit: FitMode;
  whiteBorder: number;
  cutStyle: CutStyle;
  gap: number;
  margin: number;
  /** 该页的格子数（含空位虚框） */
  perPage: number;
  dpr: number;
}

const PX_PER_MM = 96 / 25.4; // CSS 显示密度

/** 预览画布像素预算：iOS 对画布总内存有硬限制，超出后新画布会拿不到 2D 上下文 */
const MAX_PREVIEW_PIXELS = 2_200_000;

export function renderPreviewPage(
  canvas: HTMLCanvasElement,
  pageW: number,
  pageH: number,
  cells: Cell[],
  placements: number[],
  items: PhotoItem[],
  opts: PreviewOptions,
): void {
  // 预览只是看效果，够清晰即可：dpr 最多取 2，且总像素不超过预算
  let scale = PX_PER_MM * Math.min(opts.dpr, 2);
  const rawPixels = pageW * scale * pageH * scale;
  if (rawPixels > MAX_PREVIEW_PIXELS) {
    scale = Math.sqrt(MAX_PREVIEW_PIXELS / (pageW * pageH));
  }
  canvas.width = Math.round(pageW * scale);
  canvas.height = Math.round(pageH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // 画布内存不足时不阻塞流程
  const S = (mm: number) => mm * scale;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 空位虚框（还剩多少个坑）
  const template = cells[0];
  if (template && cells.length < opts.perPage) {
    ctx.save();
    ctx.strokeStyle = '#e2e2e2';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (let i = cells.length; i < opts.perPage; i++) {
      // 按网格推算空位坐标
      const col = i % Math.max(1, Math.round((pageW - opts.margin * 2 + opts.gap) / (template.w + opts.gap)) || 1);
      const row = Math.floor(i / Math.max(1, Math.round((pageW - opts.margin * 2 + opts.gap) / (template.w + opts.gap)) || 1));
      const x = template.x + col * (template.w + opts.gap);
      const y = template.y + row * (template.h + opts.gap);
      if (y + template.h > pageH) break;
      ctx.strokeRect(S(x), S(y), S(template.w), S(template.h));
    }
    ctx.restore();
  }

  for (let i = 0; i < cells.length; i++) {
    const item = items[placements[i]];
    const cell = cells[i];
    if (!item) continue;

    // 摆放朝向与照片朝向不一致时，照片随框旋转 90°
    const img = orientedSource(item, needsRotation(item, cell.w, cell.h));

    const border = Math.min(opts.whiteBorder, cell.w / 2 - 0.5, cell.h / 2 - 0.5);
    const cx = cell.x + border;
    const cy = cell.y + border;
    const cw = cell.w - border * 2;
    const ch = cell.h - border * 2;

    if (opts.fit === 'cover') {
      const crop = coverCrop(img.width, img.height, cw, ch, img.focusX, img.focusY);
      ctx.drawImage(img.source, crop.x, crop.y, crop.w, crop.h, S(cx), S(cy), S(cw), S(ch));
    } else {
      const r = containRect(img.width, img.height, cw, ch);
      ctx.drawImage(img.source, 0, 0, img.width, img.height, S(cx + r.x), S(cy + r.y), S(r.w), S(r.h));
    }

    // 裁切线（预览用灰线）：长虚线 / 四角标记
    if (opts.cutStyle !== 'none') {
      ctx.save();
      ctx.strokeStyle = '#999';
      ctx.lineWidth = Math.max(1, S(0.2));
      if (opts.cutStyle === 'dashed') ctx.setLineDash([S(2.5), S(1.5)]);
      const segs =
        opts.cutStyle === 'dashed'
          ? cutMarksForCell(cell)
          : cornerCutsForCell(cell, pageW, pageH, opts.gap, opts.margin);
      for (const s of segs) {
        ctx.beginPath();
        ctx.moveTo(S(s.x1), S(s.y1));
        ctx.lineTo(S(s.x2), S(s.y2));
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
