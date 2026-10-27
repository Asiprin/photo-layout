/**
 * 打印就绪 PDF 生成（pdf-lib）
 * 精度保证：页面 = 画布物理尺寸(mm→pt)，照片 = 模板物理尺寸，矢量裁切线
 */
import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import { mmToPt, mmToPx } from '../engine/sizes';
import { coverCrop, containRect } from '../engine/crop';
import { cutMarksForCell, cornerCutsForCell, type Cell } from '../engine/layout';

export type CutStyle = 'dashed' | 'corner' | 'none';
import { orientedSource, needsRotation, type PhotoItem } from './image';

export type FitMode = 'cover' | 'contain';

export interface ExportOptions {
  /** 画布物理尺寸 mm */
  pageW: number;
  pageH: number;
  /** 每页格子坐标（mm，页面左上原点） */
  pages: Cell[][];
  /** 与 pages 对齐：每格对应的 items 序号 */
  placements: number[][];
  items: PhotoItem[];
  fit: FitMode;
  /** 照片白边 mm（含在模板尺寸内，即实际内容缩小） */
  whiteBorder: number;
  cutStyle: CutStyle;
  gap: number;
  margin: number;
  /** 输出像素密度 */
  dpi?: number;
  title?: string;
}

/** 位图光栅化：裁剪 + 缩放到目标像素 → JPEG */
function rasterize(
  item: { source: CanvasImageSource },
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetWmm: number,
  targetHmm: number,
  dpi: number,
): { canvas: HTMLCanvasElement } {
  let tw = Math.round(mmToPx(targetWmm, dpi));
  let th = Math.round(mmToPx(targetHmm, dpi));
  // 不放大超过源分辨率
  const k = Math.min(1, sw / tw, sh / th);
  tw = Math.max(1, Math.round(tw * k));
  th = Math.max(1, Math.round(th * k));
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('无法创建画布（设备画布内存不足）。请关闭其他网页标签后重试');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(item.source, sx, sy, sw, sh, 0, 0, tw, th);
  return { canvas };
}

async function canvasToJpg(canvas: HTMLCanvasElement, quality = 0.92): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG 编码失败'))), 'image/jpeg', quality);
  });
  return blob.arrayBuffer();
}

export async function buildPdf(opts: ExportOptions): Promise<Uint8Array> {
  const { pageW, pageH, pages, placements, items, fit, whiteBorder, cutStyle, gap, margin } = opts;
  const dpi = opts.dpi ?? 300;

  const pdf = await PDFDocument.create();
  pdf.setTitle(opts.title ?? 'photo-layout');
  pdf.setProducer('photo-layout');

  // 相同裁剪参数只编码/嵌入一次（同图铺满时大幅加速）
  const cache = new Map<string, PDFImage>();

  for (let p = 0; p < pages.length; p++) {
    const page = pdf.addPage([mmToPt(pageW), mmToPt(pageH)]);
    const cells = pages[p];
    const pl = placements[p] ?? [];

    for (let i = 0; i < cells.length; i++) {
      const item = items[pl[i]];
      if (!item) continue;
      const cell = cells[i];

      // 摆放朝向与照片朝向不一致时，照片随框旋转 90°
      const rotated = needsRotation(item, cell.w, cell.h);
      const src = orientedSource(item, rotated);

      // 白边包含在模板尺寸内
      const border = Math.min(whiteBorder, cell.w / 2 - 0.5, cell.h / 2 - 0.5);
      const cx = cell.x + border;
      const cy = cell.y + border;
      const cw = cell.w - border * 2;
      const ch = cell.h - border * 2;

      let dx = cx;
      let dy = cy;
      let dw = cw;
      let dh = ch;
      let cropX = 0;
      let cropY = 0;
      let cropW = src.width;
      let cropH = src.height;

      if (fit === 'cover') {
        const crop = coverCrop(src.width, src.height, cw, ch, src.focusX, src.focusY);
        cropX = crop.x;
        cropY = crop.y;
        cropW = crop.w;
        cropH = crop.h;
      } else {
        const r = containRect(src.width, src.height, cw, ch);
        dx = cx + r.x;
        dy = cy + r.y;
        dw = r.w;
        dh = r.h;
      }

      const key = `${item.id}|${rotated ? 'r' : 'n'}|${fit}|${cw.toFixed(3)}|${ch.toFixed(3)}|${cropX.toFixed(1)}|${cropY.toFixed(1)}|${dw.toFixed(3)}|${dh.toFixed(3)}`;
      let img = cache.get(key);
      if (!img) {
        const { canvas } = rasterize(src, cropX, cropY, cropW, cropH, dw, dh, dpi);
        img = await pdf.embedJpg(await canvasToJpg(canvas));
        // 位图已嵌入 PDF，立即清零归还画布显存（iOS 画布内存有限）
        canvas.width = 0;
        canvas.height = 0;
        cache.set(key, img);
      }
      page.drawImage(img, {
        x: mmToPt(dx),
        y: mmToPt(pageH - dy - dh),
        width: mmToPt(dw),
        height: mmToPt(dh),
      });

      if (cutStyle === 'dashed') {
        for (const s of cutMarksForCell(cell)) {
          page.drawLine({
            start: { x: mmToPt(s.x1), y: mmToPt(pageH - s.y1) },
            end: { x: mmToPt(s.x2), y: mmToPt(pageH - s.y2) },
            thickness: mmToPt(0.2),
            color: rgb(0, 0, 0),
            dashArray: [mmToPt(2.5), mmToPt(1.5)],
          });
        }
      } else if (cutStyle === 'corner') {
        for (const s of cornerCutsForCell(cell, pageW, pageH, gap, margin)) {
          page.drawLine({
            start: { x: mmToPt(s.x1), y: mmToPt(pageH - s.y1) },
            end: { x: mmToPt(s.x2), y: mmToPt(pageH - s.y2) },
            thickness: mmToPt(0.2),
            color: rgb(0, 0, 0),
          });
        }
      }
    }
  }

  return pdf.save();
}

/** 触发浏览器下载 */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
