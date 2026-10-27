/**
 * PDF → 图片：pdf.js 按 300dpi 渲染每页为位图
 */
import '../polyfills';
import * as pdfjsLib from 'pdfjs-dist';
import PdfWorker from './pdf-worker-entry?worker';
import './uint8-hex-polyfill';
import { createPhotoItem, type PhotoItem } from './image';

// 自建 worker 入口（带 toHex 补丁），老浏览器兼容
pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export const RENDER_DPI = 300;
/**
 * 单页渲染上限（iOS Safari 画布硬限制为 4096×4096 ≈ 1670 万像素，
 * 超限的画布会变成"废画布"，渲染静默挂住；桌面浏览器上限宽松所以测不出来）
 */
const MAX_PIXELS = 10_000_000;
const MAX_DIM = 4096;

export interface RenderProgress {
  done: number;
  total: number;
}

/** 打开 PDF 字节流（自检/复检用）。pdfjs 会 detach 传入的 buffer，内部做拷贝保证可重复打开 */
export async function openPdfDocument(data: ArrayBuffer | Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  const copy = data instanceof Uint8Array ? new Uint8Array(data) : data.slice(0);
  return pdfjsLib.getDocument({ data: copy }).promise;
}

export async function renderPdfToItems(
  file: File,
  dpi = RENDER_DPI,
  onProgress?: (p: RenderProgress) => void,
): Promise<PhotoItem[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const items: PhotoItem[] = [];
  const total = doc.numPages;

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    let scale = dpi / 72;
    let vp = page.getViewport({ scale });
    // 按面积/边长双上限收缩，保证在 iOS 画布限制内
    const shrink = Math.min(
      vp.width * vp.height > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (vp.width * vp.height)) : 1,
      Math.max(vp.width, vp.height) > MAX_DIM ? MAX_DIM / Math.max(vp.width, vp.height) : 1,
    );
    if (shrink < 1) {
      scale *= shrink;
      vp = page.getViewport({ scale });
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`无法创建画布（${canvas.width}×${canvas.height}，设备画布内存不足）`);
    }
    // 渲染看门狗：个别设备/个别 PDF 会静默挂住，超时给出可诊断的错误而不是无限转圈
    const task = page.render({ canvas, viewport: vp, background: '#ffffff' });
    let timer = 0;
    await Promise.race([
      task.promise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          task.cancel();
          reject(new Error(`第${i}页渲染超时（${canvas.width}×${canvas.height}px），设备可能内存不足`));
        }, 20_000);
      }),
    ]);
    window.clearTimeout(timer);

    items.push(
      createPhotoItem(canvas, canvas.width, canvas.height, `${file.name} · 第${i}页`, 'pdf-page'),
    );
    onProgress?.({ done: i, total });
  }
  await doc.cleanup();
  return items;
}
