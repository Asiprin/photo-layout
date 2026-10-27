/**
 * 物理尺寸体系：全部以毫米(mm)为基准单位
 * 打印精度的关键：生成的 PDF 页面尺寸 = 画布物理尺寸，照片 = 模板物理尺寸
 */

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;
export const MM_PER_PT = MM_PER_INCH / PT_PER_INCH; // 0.352777...

export const mmToPt = (mm: number): number => mm / MM_PER_PT;
export const ptToMm = (pt: number): number => pt * MM_PER_PT;
export const mmToPx = (mm: number, dpi: number): number => (mm / MM_PER_INCH) * dpi;
export const pxToMm = (px: number, dpi: number): number => (px / dpi) * MM_PER_INCH;

/** 照片尺寸模板（日常洗印/证件照标准） */
export interface PhotoSizePreset {
  id: string;
  name: string;
  /** mm */
  w: number;
  h: number;
  note?: string;
}

export const PHOTO_SIZE_PRESETS: PhotoSizePreset[] = [
  { id: 'x1c', name: '小1寸', w: 22, h: 32, note: '22×32mm' },
  { id: '1c', name: '1寸', w: 25, h: 35, note: '25×35mm' },
  { id: 'd1c', name: '大1寸', w: 33, h: 48, note: '33×48mm' },
  { id: 'x2c', name: '小2寸', w: 35, h: 45, note: '35×45mm' },
  { id: '2c', name: '2寸', w: 35, h: 49, note: '35×49mm' },
  { id: '5r', name: '5寸 (3R)', w: 89, h: 127, note: '89×127mm' },
  { id: '6r', name: '6寸 (4R)', w: 102, h: 152, note: '102×152mm' },
  { id: '7r', name: '7寸 (5R)', w: 127, h: 178, note: '127×178mm' },
  { id: 'work-card', name: '卡片', w: 85.6, h: 54, note: '85.6×54mm · ID-1 标准卡' },
];

/** 画布（纸张）尺寸 */
export interface CanvasSizePreset {
  id: string;
  name: string;
  /** mm */
  w: number;
  h: number;
  note?: string;
}

export const CANVAS_SIZE_PRESETS: CanvasSizePreset[] = [
  { id: 'a4', name: 'A4', w: 210, h: 297, note: '210×297mm · 日常打印' },
  { id: 'a3', name: 'A3', w: 297, h: 420, note: '297×420mm' },
  { id: 'letter', name: 'Letter', w: 215.9, h: 279.4, note: '215.9×279.4mm' },
];
