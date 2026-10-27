/**
 * 图片解码：文件 → PhotoItem
 */
import { clamp } from '../engine/crop';

export interface PhotoItem {
  id: string;
  name: string;
  /** 位图源（ImageBitmap / HTMLCanvasElement / HTMLImageElement） */
  source: CanvasImageSource;
  /** 像素尺寸 */
  width: number;
  height: number;
  /** 裁剪焦点 0..1（cover 模式可拖动调整） */
  focusX: number;
  focusY: number;
  /** 来源类型（展示用） */
  kind: 'image' | 'pdf-page';
  /** 旋转 90° 后的位图缓存（横竖摆放与照片朝向不一致时使用） */
  rotated?: HTMLCanvasElement;
}

let idSeq = 0;
const nextId = () => `item-${++idSeq}`;

/** 直接由位图源构造 PhotoItem（PDF 渲染/示例图生成也走这里） */
export function createPhotoItem(
  source: CanvasImageSource,
  width: number,
  height: number,
  name: string,
  kind: PhotoItem['kind'] = 'image',
): PhotoItem {
  return {
    id: nextId(),
    name,
    source,
    width,
    height,
    focusX: 0.5,
    focusY: 0.5,
    kind,
  };
}

export async function decodeImageFile(file: File): Promise<PhotoItem> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  try {
    const bmp = await createImageBitmap(file);
    source = bmp;
    width = bmp.width;
    height = bmp.height;
  } catch {
    // createImageBitmap 不支持的格式（如 Safari 下的 HEIC）回退到 <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return {
    id: nextId(),
    name: file.name,
    source,
    width,
    height,
    focusX: 0.5,
    focusY: 0.5,
    kind: 'image',
  };
}

/**
 * 摆放方向与照片朝向不一致时，照片随框旋转 90°（顺时针）。
 * 返回可直接用于绘制/裁剪计算的图像与焦点（焦点坐标随旋转映射）。
 */
export function orientedSource(
  item: PhotoItem,
  rotate: boolean,
): { source: CanvasImageSource; width: number; height: number; focusX: number; focusY: number } {
  if (!rotate) return item;
  if (!item.rotated) {
    const canvas = document.createElement('canvas');
    canvas.width = item.height;
    canvas.height = item.width;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(item.height, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(item.source, 0, 0);
    item.rotated = canvas;
  }
  // 顺时针 90°：原焦点 (u,v) → (1-v, u)
  return {
    source: item.rotated,
    width: item.height,
    height: item.width,
    focusX: 1 - item.focusY,
    focusY: item.focusX,
  };
}

/** 摆放框与照片朝向是否不一致（需要随框旋转） */
export function needsRotation(
  item: { width: number; height: number },
  cellW: number,
  cellH: number,
): boolean {
  return cellW > cellH !== item.width > item.height;
}

export function setFocus(item: PhotoItem, fx: number, fy: number): void {
  item.focusX = clamp(fx, 0, 1);
  item.focusY = clamp(fy, 0, 1);
}
