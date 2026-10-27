/**
 * 裁剪/适配计算（纯函数）
 * cover（居中裁剪填满）与 contain（缩放留白）两种适配策略
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * cover：裁剪源图以填满目标框（保持比例，裁掉溢出部分）
 * @param focusX/focusY 裁剪焦点 0..1（0.5=居中；拖动预览可调整）
 * @returns 源图像素坐标系下的裁剪矩形
 */
export function coverCrop(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  focusX = 0.5,
  focusY = 0.5,
): Rect {
  const targetAspect = targetW / targetH;
  const srcAspect = srcW / srcH;
  let w: number;
  let h: number;
  if (srcAspect > targetAspect) {
    h = srcH;
    w = srcH * targetAspect;
  } else {
    w = srcW;
    h = srcW / targetAspect;
  }
  return {
    x: (srcW - w) * clamp(focusX, 0, 1),
    y: (srcH - h) * clamp(focusY, 0, 1),
    w,
    h,
  };
}

/**
 * contain：整图缩放置入目标框（留白）
 * @returns 目标框坐标系（mm）内的放置矩形，居中
 */
export function containRect(srcW: number, srcH: number, targetW: number, targetH: number): Rect {
  const s = Math.min(targetW / srcW, targetH / srcH);
  const w = srcW * s;
  const h = srcH * s;
  return { x: (targetW - w) / 2, y: (targetH - h) / 2, w, h };
}
