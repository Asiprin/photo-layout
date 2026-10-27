/**
 * 主界面：引导式流程
 * ① 导入素材 → ② 打印纸张（默认 A4 竖版）→ ③ 照片尺寸 → 自动排版 → ④ 导出
 */
import './error-report';
import './polyfills';
import {
  PHOTO_SIZE_PRESETS,
  CANVAS_SIZE_PRESETS,
  type PhotoSizePreset,
  type CanvasSizePreset,
} from './engine/sizes';
import {
  computeLayout,
  paginate,
  type Cell,
  type Direction,
  type LayoutConfig,
  type LayoutResult,
} from './engine/layout';
import { coverCrop } from './engine/crop';
import { decodeImageFile, setFocus, type PhotoItem } from './io/image';
import { renderPdfToItems } from './io/pdf';
import { buildPdf, downloadPdf, type FitMode, type CutStyle } from './io/export';
import JSZip from 'jszip';
import { renderPreviewPage } from './ui/preview';
import { initTheme } from './ui/theme';

// ---------- 工具 ----------
const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`元素不存在: ${sel}`);
  return el;
};
const num = (sel: string): number => Number(($<HTMLInputElement>(sel)).value) || 0;

// ---------- 状态 ----------
interface Settings {
  photoW: number;
  photoH: number;
  canvasW: number;
  canvasH: number;
  margin: number;
  gap: number;
  whiteBorder: number;
  direction: Direction;
  center: boolean;
  cutStyle: CutStyle;
  mode: 'fill' | 'sequence';
  copies: number;
  repeatN: number;
  fit: FitMode;
  photoLabel: string;
  canvasLabel: string;
}

const state = {
  items: [] as PhotoItem[],
  selectedId: null as string | null,
  /** 当前所在步骤（1-4，每步一屏） */
  step: 1,
  /** 走过的步骤（步骤条"已完成"判定用） */
  visited: new Set<number>([1]),
  /** 纸张预设 id（'custom' = 自定义） */
  canvasId: 'a4',
  /** 照片尺寸预设 id，'' = 未选择 */
  photoId: '',
  /** 纸张方向 */
  paperOrient: 'portrait' as 'portrait' | 'landscape',
  canvasTouched: false,
  /** 用户手动改过份数后不再自动同步 */
  copiesDirty: false,
  filesExpanded: false,
  /** 自定义照片尺寸已填完并进入过第四步 */
  photoCustomAdvanced: false,
  /** 更多设置（chip 选择态） */
  mode: 'sequence' as 'fill' | 'sequence',
  fit: 'cover' as FitMode,
  direction: 'fit' as Direction,
  cutStyle: 'dashed' as CutStyle,
  gridCenter: true,
};

// ---------- 选项 chips ----------
function makeChip(name: string, dim: string, id: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip';
  btn.dataset.id = id;
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = `<span class="chip-name"></span><span class="chip-dim"></span>`;
  (btn.querySelector('.chip-name') as HTMLElement).textContent = name;
  (btn.querySelector('.chip-dim') as HTMLElement).textContent = dim;
  btn.addEventListener('click', onClick);
  return btn;
}

/** 滑块平滑移动到选中项 */
function positionSlider(wrap: HTMLElement | null, active: HTMLElement | null): void {
  if (!wrap) return;
  const slider = wrap.querySelector<HTMLElement>('.row-slider, .seg-slider');
  if (!slider) return;
  if (!active) {
    slider.style.opacity = '0';
    return;
  }
  slider.style.opacity = '1';
  slider.style.width = `${active.offsetWidth}px`;
  slider.style.height = `${active.offsetHeight}px`;
  slider.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
}

function syncCustomVisibility(): void {
  $<HTMLDivElement>('#canvas-custom').classList.toggle('open', state.canvasId === 'custom');
  $<HTMLDivElement>('#photo-custom').classList.toggle('open', state.photoId === 'custom');
}

// ---------- 更多设置（chip 选项组） ----------
interface ChipOpt {
  value: string;
  name: string;
  dim: string;
}

function buildChipGroup(id: string, opts: ChipOpt[], getValue: () => string, onPick: (v: string) => void): void {
  const wrap = $<HTMLDivElement>(`#${id}`);
  const row = wrap.querySelector<HTMLDivElement>('.choice-row');
  if (!row) return;
  row.innerHTML = '';
  for (const o of opts) {
    const btn = makeChip(o.name, o.dim, o.value, () => {
      onPick(o.value);
      syncSettingsGroups();
      renderFileStrip();
      renderAll();
    });
    row.appendChild(btn);
  }
  void getValue;
}

function syncChipGroup(id: string, value: string): void {
  const wrap = $<HTMLDivElement>(`#${id}`);
  const row = wrap.querySelector<HTMLDivElement>('.choice-row');
  if (!row) return;
  let active: HTMLElement | null = null;
  for (const chip of Array.from(row.querySelectorAll<HTMLButtonElement>('.chip'))) {
    const on = chip.dataset.id === value;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) active = chip;
  }
  positionSlider(wrap, active);
}

function syncSettingsGroups(): void {
  syncChipGroup('grp-mode', state.mode);
  syncChipGroup('grp-fit', state.fit);
  syncChipGroup('grp-direction', state.direction);
  syncChipGroup('grp-cut', state.cutStyle);
  syncChipGroup('grp-center', state.gridCenter ? 'center' : 'start');
  const fillMode = state.mode === 'fill';
  $<HTMLDivElement>('#fill-opts').hidden = !fillMode;
  $<HTMLDivElement>('#seq-opts').hidden = fillMode;
}

function initSettingsChips(): void {
  buildChipGroup(
    'grp-mode',
    [
      { value: 'sequence', name: '多图各排', dim: '每张各占一格' },
      { value: 'fill', name: '同图铺满', dim: '一张图复制多份' },
    ],
    () => state.mode,
    (v) => {
      state.mode = v as 'fill' | 'sequence';
    },
  );
  buildChipGroup(
    'grp-fit',
    [
      { value: 'cover', name: '居中裁剪', dim: '填满不留白' },
      { value: 'contain', name: '缩放留白', dim: '完整不裁剪' },
    ],
    () => state.fit,
    (v) => {
      state.fit = v as FitMode;
    },
  );
  buildChipGroup(
    'grp-direction',
    [
      { value: 'fit', name: '跟随图片', dim: '自动匹配方向' },
      { value: 'portrait', name: '竖放', dim: '照片竖排' },
      { value: 'landscape', name: '横放', dim: '照片横排' },
      { value: 'auto', name: '排得多优先', dim: '尽量挤满页' },
    ],
    () => state.direction,
    (v) => {
      state.direction = v as Direction;
    },
  );
  buildChipGroup(
    'grp-cut',
    [
      { value: 'dashed', name: '长虚线', dim: '虚线边框' },
      { value: 'corner', name: '四角标记', dim: '角线裁切' },
      { value: 'none', name: '关闭', dim: '不画裁切线' },
    ],
    () => state.cutStyle,
    (v) => {
      state.cutStyle = v as CutStyle;
    },
  );
  buildChipGroup(
    'grp-center',
    [
      { value: 'center', name: '居中', dim: '网格居中对齐' },
      { value: 'start', name: '靠上', dim: '贴顶排列' },
    ],
    () => (state.gridCenter ? 'center' : 'start'),
    (v) => {
      state.gridCenter = v === 'center';
    },
  );
  syncSettingsGroups();
}

/** 同步选中态 + 滑块位置（不重建 DOM，保证动画平滑） */
function syncChips(): void {
  const rows: Array<[string, string]> = [
    ['#canvas-chips', state.canvasId],
    ['#photo-chips', state.photoId],
  ];
  for (const [sel, current] of rows) {
    const box = $<HTMLDivElement>(sel);
    let active: HTMLElement | null = null;
    for (const chip of Array.from(box.querySelectorAll<HTMLButtonElement>('.chip'))) {
      const on = chip.dataset.id === current;
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on) active = chip;
    }
    positionSlider(box.parentElement, active);
  }

  const seg = $<HTMLDivElement>('#paper-orient');
  let segActive: HTMLElement | null = null;
  for (const btn of seg.querySelectorAll<HTMLButtonElement>('button')) {
    const on = (btn.dataset.orient === 'landscape') === (state.paperOrient === 'landscape');
    btn.classList.toggle('on', on);
    if (on) segActive = btn;
  }
  positionSlider(seg, segActive);
  syncCustomVisibility();
}

function buildChips(): void {
  const canvasBox = $<HTMLDivElement>('#canvas-chips');
  canvasBox.innerHTML = '';
  for (const c of CANVAS_SIZE_PRESETS) {
    canvasBox.appendChild(
      makeChip(c.name, `${c.w} × ${c.h} mm`, c.id, () => {
        state.canvasId = c.id;
        state.canvasTouched = true;
        syncChips();
        renderAll();
      }),
    );
  }
  canvasBox.appendChild(
    makeChip('自定义', '输入宽高 mm', 'custom', () => {
      state.canvasId = 'custom';
      state.canvasTouched = true;
      if (num('#canvas-w') === 0) {
        $<HTMLInputElement>('#canvas-w').value = '210';
        $<HTMLInputElement>('#canvas-h').value = '297';
      }
      syncChips();
      renderAll();
    }),
  );

  const photoBox = $<HTMLDivElement>('#photo-chips');
  photoBox.innerHTML = '';
  for (const p of PHOTO_SIZE_PRESETS) {
    photoBox.appendChild(
      makeChip(p.name, `${p.w} × ${p.h} mm`, p.id, () => {
        state.photoId = p.id;
        state.photoCustomAdvanced = true;
        syncChips();
        renderAll();
      }),
    );
  }
  photoBox.appendChild(
    makeChip('自定义', '输入宽高 mm', 'custom', () => {
      state.photoId = 'custom';
      // 自定义尺寸：等用户填完宽高后再进入排版导出
      state.photoCustomAdvanced = false;
      syncChips();
      renderAll();
    }),
  );
  syncChips();
}

function readSettings(): Settings | null {
  const canvasPreset = CANVAS_SIZE_PRESETS.find((c) => c.id === state.canvasId) as
    | CanvasSizePreset
    | undefined;
  let cw = canvasPreset ? canvasPreset.w : num('#canvas-w');
  let ch = canvasPreset ? canvasPreset.h : num('#canvas-h');
  if (cw <= 0 || ch <= 0) return null;
  // 纸张方向归一：竖版 = 高 ≥ 宽
  const short = Math.min(cw, ch);
  const long = Math.max(cw, ch);
  if (state.paperOrient === 'landscape') {
    cw = long;
    ch = short;
  } else {
    cw = short;
    ch = long;
  }

  const photoPreset = PHOTO_SIZE_PRESETS.find((p) => p.id === state.photoId) as
    | PhotoSizePreset
    | undefined;
  const photoW = photoPreset ? photoPreset.w : num('#photo-w');
  const photoH = photoPreset ? photoPreset.h : num('#photo-h');
  if (!state.photoId || photoW <= 0 || photoH <= 0) return null;

  const mode = state.mode;
  const fit = state.fit;

  return {
    photoW,
    photoH,
    canvasW: cw,
    canvasH: ch,
    margin: num('#margin'),
    gap: num('#gap'),
    whiteBorder: num('#white-border'),
    direction: resolveDirection(),
    center: state.gridCenter,
    cutStyle: state.cutStyle,
    mode,
    copies: Math.max(1, num('#copies')),
    repeatN: Math.max(1, num('#repeat-n')),
    fit,
    photoLabel: photoPreset ? photoPreset.name : '自定义',
    canvasLabel: canvasPreset ? canvasPreset.name : `${cw}×${ch}mm`,
  };
}

/** 照片摆放方向：跟随图片（默认）/ 手动 / 排得多优先 */
function resolveDirection(): Direction {
  const v = state.direction;
  if (v === 'portrait' || v === 'landscape' || v === 'auto') return v;
  // 'fit'：竖图竖放、横图横放
  const ref = state.items.find((i) => i.id === state.selectedId) ?? state.items[0];
  if (!ref) return 'portrait';
  return ref.width > ref.height ? 'landscape' : 'portrait';
}

// ---------- 排版计算 ----------
interface Plan {
  layout: LayoutResult;
  placements: number[][];
  settings: Settings;
}

function buildPlan(): Plan | null {
  const s = readSettings();
  if (!s || state.items.length === 0) return null;
  const cfg: LayoutConfig = {
    canvasW: s.canvasW,
    canvasH: s.canvasH,
    photoW: s.photoW,
    photoH: s.photoH,
    margin: s.margin,
    gap: s.gap,
    direction: s.direction,
    center: s.center,
  };

  let seq: number[];
  if (s.mode === 'fill') {
    // 份数未手动调过时，默认铺满 1 页
    if (!state.copiesDirty) {
      const probe = computeLayout(cfg, 0);
      if (probe.perPage > 0) $<HTMLInputElement>('#copies').value = String(probe.perPage);
      s.copies = Math.max(1, num('#copies'));
    }
    let idx = state.items.findIndex((i) => i.id === state.selectedId);
    if (idx < 0) idx = 0;
    seq = Array.from({ length: s.copies }, () => idx);
  } else {
    seq = [];
    state.items.forEach((_, i) => {
      for (let k = 0; k < s.repeatN; k++) seq.push(i);
    });
  }

  const layout = computeLayout(cfg, seq.length);
  const placements = paginate(seq, layout.perPage);
  return { layout, placements, settings: s };
}

// ---------- 引导状态 ----------
/** 切换到指定步骤（每个板块一屏） */
function goToStep(step: number): void {
  state.step = Math.min(4, Math.max(1, step));
  state.visited.add(state.step);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}

function updateWizard(plan: Plan | null): void {
  const hasItems = state.items.length > 0;
  const s = plan?.settings ?? null;

  // 当前屏
  document.querySelectorAll<HTMLElement>('.step-card').forEach((el, i) => {
    el.classList.toggle('current', i + 1 === state.step);
  });

  $<HTMLElement>('#step-2').classList.toggle('locked', !hasItems);
  $<HTMLElement>('#step-3').classList.toggle('locked', !hasItems);
  $<HTMLElement>('#step-4').classList.toggle('locked', !plan);

  // 上/下一步按钮可用性（照片尺寸有效才能进排版页）
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.step-nav [data-nav]')) {
    if (btn.dataset.nav === 'next') {
      const canNext = state.step === 1 ? hasItems : state.step === 3 ? !!plan : true;
      btn.disabled = !canNext;
    } else {
      btn.disabled = state.step === 1;
    }
  }

  // 步骤条：高亮 = 当前屏；已走过且前置条件满足 = 已完成
  const reqDone = [hasItems, true, !!state.photoId, !!plan];
  document.querySelectorAll<HTMLElement>('.stepper-item').forEach((el, i) => {
    const n = i + 1;
    el.classList.remove('done', 'active');
    if (n === state.step) el.classList.add('active');
    else if (state.visited.has(n) && reqDone[i]) el.classList.add('done');
    const allowed = n === 1 || (n <= 3 ? hasItems : !!plan);
    el.classList.toggle('clickable', allowed);
    el.onclick = allowed
      ? () => {
          goToStep(n);
        }
      : null;
  });

  // 滑块在隐藏时尺寸为 0，切屏后重新对位
  syncChips();
  syncSettingsGroups();

  // 状态徽标
  $<HTMLElement>('#state-1').textContent = hasItems ? `${state.items.length} 张素材` : '待导入';
  $<HTMLElement>('#state-2').textContent =
    (s ? s.canvasLabel : state.canvasId === 'custom' ? '自定义' : state.canvasId.toUpperCase()) +
    ` ${state.paperOrient === 'landscape' ? '横版' : '竖版'}`;
  $<HTMLElement>('#state-3').textContent = s ? s.photoLabel : '未选择';
  $<HTMLElement>('#state-4').textContent = plan && plan.layout.fits
    ? `每页 ${plan.layout.perPage} 张 · 共 ${plan.layout.pages.length} 页`
    : '待排版';
}

// ---------- 预览渲染 ----------
const previewPages = $<HTMLDivElement>('#preview-pages');
const summaryEl = $<HTMLDivElement>('#summary');
const exportBtn = $<HTMLButtonElement>('#btn-export');
const printBtn = $<HTMLButtonElement>('#btn-print');

function setExportEnabled(on: boolean): void {
  exportBtn.disabled = !on;
  printBtn.disabled = !on;
}

function setBusy(v: boolean): void {
  exportBtn.disabled = v;
  printBtn.disabled = v;
}

let currentPlan: Plan | null = null;

function renderAll(): void {
  currentPlan = buildPlan();
  updateWizard(currentPlan);
  // iOS 画布内存有限：先把旧预览画布显式清零再移除，立即释放显存
  previewPages.querySelectorAll('canvas').forEach((c) => {
    c.width = 0;
    c.height = 0;
  });
  previewPages.innerHTML = '';

  if (!currentPlan) {
    previewPages.innerHTML =
      '<div class="empty">选择照片尺寸后，排版预览会显示在这里</div>';
    summaryEl.innerHTML = '<span class="placeholder">选择照片尺寸后自动排版</span>';
    setExportEnabled(false);
    return;
  }

  const { layout, placements, settings: s } = currentPlan;

  if (!layout.fits) {
    summaryEl.innerHTML = '<span class="placeholder">照片尺寸超过纸张，请缩小照片尺寸或换大纸张</span>';
    setExportEnabled(false);
    return;
  }

  const totalPages = layout.pages.length;
  const frameLandscape = layout.cellW > layout.cellH;
  summaryEl.innerHTML =
    `<b>${s.photoLabel}</b><span class="dot">·</span>${layout.cellW}×${layout.cellH}mm${frameLandscape ? '（横放）' : ''}` +
    `<span class="dot">·</span>每页 <b>${layout.perPage}</b> 张<span class="dot">·</span>共 <b>${totalPages}</b> 页` +
    `<span class="dot">·</span>${s.canvasLabel} ${state.paperOrient === 'landscape' ? '横版' : '竖版'}` +
    (s.mode === 'fill' ? `<span class="dot">·</span>共 ${s.copies} 份` : '');

  layout.pages.forEach((cells, pi) => {
    const wrap = document.createElement('div');
    wrap.className = 'page-wrap';
    const label = document.createElement('div');
    label.className = 'page-label';
    label.textContent = `第 ${pi + 1} / ${totalPages} 页 · 本页 ${cells.length} 张`;
    const canvas = document.createElement('canvas');
    renderPreviewPage(canvas, layout.pageW, layout.pageH, cells, placements[pi] ?? [], state.items, {
      fit: s.fit,
      whiteBorder: s.whiteBorder,
      cutStyle: s.cutStyle,
      gap: s.gap,
      margin: s.margin,
      perPage: layout.perPage,
      dpr: window.devicePixelRatio || 1,
    });
    if (s.fit === 'cover') {
      canvas.classList.add('crop-mode');
      enableCropDrag(canvas, pi);
    }
    wrap.appendChild(label);
    wrap.appendChild(canvas);
    previewPages.appendChild(wrap);
  });

  setExportEnabled(true);
}

// ---------- 拖动调整裁剪（cover 模式） ----------
function enableCropDrag(canvas: HTMLCanvasElement, pageIndex: number): void {
  canvas.addEventListener('pointerdown', (e) => {
    const plan = currentPlan;
    if (!plan) return;
    const { layout, placements, settings: s } = plan;
    const cells: Cell[] = layout.pages[pageIndex] ?? [];
    const rect = canvas.getBoundingClientRect();
    const mmX = ((e.clientX - rect.left) / rect.width) * layout.pageW;
    const mmY = ((e.clientY - rect.top) / rect.height) * layout.pageH;

    const cellIdx = cells.findIndex(
      (c) => mmX >= c.x && mmX <= c.x + c.w && mmY >= c.y && mmY <= c.y + c.h,
    );
    if (cellIdx < 0) return;
    const item = state.items[(placements[pageIndex] ?? [])[cellIdx]];
    if (!item) return;

    const cell = cells[cellIdx];
    const border = Math.min(s.whiteBorder, cell.w / 2 - 0.5, cell.h / 2 - 0.5);
    const cw = cell.w - border * 2;
    const ch = cell.h - border * 2;
    const crop = coverCrop(item.width, item.height, cw, ch, item.focusX, item.focusY);
    const rangeX = (item.width - crop.w) * (cw / crop.w);
    const rangeY = (item.height - crop.h) * (ch / crop.h);
    const start = { x: e.clientX, y: e.clientY, fx: item.focusX, fy: item.focusY };

    canvas.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent): void => {
      const dxMm = ((ev.clientX - start.x) / rect.width) * layout.pageW;
      const dyMm = ((ev.clientY - start.y) / rect.height) * layout.pageH;
      setFocus(
        item,
        rangeX > 0 ? start.fx - dxMm / rangeX : start.fx,
        rangeY > 0 ? start.fy - dyMm / rangeY : start.fy,
      );
      renderPreviewPage(canvas, layout.pageW, layout.pageH, cells, placements[pageIndex] ?? [], state.items, {
        fit: s.fit,
        whiteBorder: s.whiteBorder,
        cutStyle: s.cutStyle,
        gap: s.gap,
        margin: s.margin,
        perPage: layout.perPage,
        dpr: window.devicePixelRatio || 1,
      });
    };
    const onUp = (): void => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
  });
}

// ---------- 素材列表（收起式） ----------
const ICON_IMG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
const ICON_PDF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>';
const ICON_DEL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

function drawThumb(canvas: HTMLCanvasElement, item: PhotoItem, size: number): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(size / item.width, size / item.height);
  const w = item.width * scale;
  const h = item.height * scale;
  ctx.drawImage(item.source, (size - w) / 2, (size - h) / 2, w, h);
}

function removeItem(id: string): void {
  state.items = state.items.filter((i) => i.id !== id);
  if (state.selectedId === id) state.selectedId = state.items[0]?.id ?? null;
  renderFileStrip();
  renderAll();
}

function renderFileStrip(): void {
  const strip = $<HTMLDivElement>('#file-strip');
  const thumbStrip = $<HTMLDivElement>('#thumb-strip');
  const fileGrid = $<HTMLDivElement>('#file-grid');

  strip.hidden = state.items.length === 0;
  if (state.items.length === 0) return;

  $<HTMLSpanElement>('#file-count').textContent = `${state.items.length} 张素材`;
  $<HTMLButtonElement>('#btn-toggle-files').textContent = state.filesExpanded ? '收起详情' : '展开详情';
  fileGrid.hidden = !state.filesExpanded;

  // 横向缩略图条
  thumbStrip.innerHTML = '';
  for (const item of state.items) {
    const box = document.createElement('div');
    box.className = 'thumb-item' + (item.id === state.selectedId ? ' selected' : '');
    box.title = item.name;
    const canvas = document.createElement('canvas');
    drawThumb(canvas, item, 56 * (window.devicePixelRatio || 1));
    box.appendChild(canvas);

    const del = document.createElement('button');
    del.className = 'thumb-del';
    del.textContent = '✕';
    del.title = '删除';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(item.id);
    });
    box.appendChild(del);

    const sel = document.createElement('span');
    sel.className = 'thumb-sel';
    sel.textContent = '✓';
    box.appendChild(sel);

    box.addEventListener('click', () => {
      state.selectedId = item.id;
      renderFileStrip();
      renderAll();
    });
    thumbStrip.appendChild(box);
  }

  // 详情列表
  fileGrid.innerHTML = '';
  for (const item of state.items) {
    const row = document.createElement('div');
    row.className = 'file-row' + (item.id === state.selectedId ? ' selected' : '');
    row.innerHTML = `<div class="fr-icon">${item.kind === 'pdf-page' ? ICON_PDF : ICON_IMG}</div>
      <div class="fr-meta"><div class="fr-name"></div><div class="fr-dim"></div></div>
      <button class="fr-del" title="删除">${ICON_DEL}</button>`;
    (row.querySelector('.fr-name') as HTMLElement).textContent = item.name;
    (row.querySelector('.fr-dim') as HTMLElement).textContent =
      `${item.width}×${item.height}px${item.kind === 'pdf-page' ? ' · PDF 页' : ''}`;
    row.addEventListener('click', () => {
      state.selectedId = item.id;
      renderFileStrip();
      renderAll();
    });
    (row.querySelector('.fr-del') as HTMLElement).addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(item.id);
    });
    fileGrid.appendChild(row);
  }

  // 铺满模式下多图时提示可点选
  $<HTMLButtonElement>('#btn-select-hint').hidden = !(state.mode === 'fill' && state.items.length > 1);
  // 含 PDF 页时才能"导出所有图片"
  $<HTMLButtonElement>('#btn-export-zip').hidden = !state.items.some((i) => i.kind === 'pdf-page');
}

// ---------- 上传 ----------
const progress = $<HTMLDivElement>('#progress');
const progressBar = $<HTMLDivElement>('#progress-bar');
const progressText = $<HTMLSpanElement>('#progress-text');

async function addFiles(files: FileList | File[]): Promise<void> {
  const list = Array.from(files);
  if (list.length === 0) return;
  progress.hidden = false;
  progressBar.style.width = '5%';
  progressText.textContent = '处理中…';
  try {
    for (const file of list) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const items = await renderPdfToItems(file, 300, (p) => {
          progressBar.style.width = `${Math.round((p.done / p.total) * 100)}%`;
          progressText.textContent = `PDF 渲染 ${p.done}/${p.total} 页`;
        });
        state.items.push(...items);
      } else if (file.type.startsWith('image/')) {
        state.items.push(await decodeImageFile(file));
      }
    }
  } catch (err) {
    alert(`处理失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    progress.hidden = true;
  }
  if (!state.selectedId && state.items.length > 0) state.selectedId = state.items[0].id;
  renderFileStrip();
  renderAll();
  // 不自动跳页，由用户点「下一步」切换
}

function initUpload(): void {
  const dropzone = $<HTMLDivElement>('#dropzone');
  const input = $<HTMLInputElement>('#file-input');
  input.addEventListener('change', () => {
    if (input.files) void addFiles(input.files);
    input.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer?.files) void addFiles(e.dataTransfer.files);
  });
}

// ---------- 导出 / 打印 ----------
async function buildPlanPdf(): Promise<Uint8Array | null> {
  const plan = currentPlan;
  if (!plan || !plan.layout.fits) return null;
  const { layout, placements, settings: s } = plan;
  return buildPdf({
    pageW: layout.pageW,
    pageH: layout.pageH,
    pages: layout.pages,
    placements,
    items: state.items,
    fit: s.fit,
    whiteBorder: s.whiteBorder,
    cutStyle: s.cutStyle,
    gap: s.gap,
    margin: s.margin,
    dpi: 300,
    title: `照片排版 ${s.photoLabel} ×${layout.perPage}/页`,
  });
}

async function onExport(): Promise<void> {
  const plan = currentPlan;
  if (!plan || !plan.layout.fits) return;
  const s = plan.settings;
  setBusy(true);
  try {
    const bytes = await buildPlanPdf();
    if (bytes) {
      downloadPdf(bytes, `照片排版_${s.photoLabel}_${s.canvasLabel}_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
  } catch (err) {
    alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
}

/** 直接唤起系统打印（内部生成打印就绪 PDF，尺寸精确） */
async function onPrint(): Promise<void> {
  const plan = currentPlan;
  if (!plan || !plan.layout.fits) return;
  setBusy(true);
  try {
    const bytes = await buildPlanPdf();
    if (!bytes) return;
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        // 个别浏览器不允许内嵌打印：打开新标签页由用户手动打印
        window.open(url, '_blank');
      }
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
    };
  } catch (err) {
    alert(`打印失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    setBusy(false);
  }
}

// ---------- 导出所有图片（仅 PDF 导入时显示入口） ----------
async function onExportZip(): Promise<void> {
  const btn = $<HTMLButtonElement>('#btn-export-zip');
  const origLabel = btn.textContent ?? '导出所有图片';
  btn.disabled = true;
  btn.textContent = '打包中…';
  try {
    const zip = new JSZip();
    const folder = zip.folder('images') ?? zip;
    for (let i = 0; i < state.items.length; i++) {
      const item = state.items[i];
      const canvas = document.createElement('canvas');
      canvas.width = item.width;
      canvas.height = item.height;
      canvas.getContext('2d')!.drawImage(item.source, 0, 0);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
      if (blob) {
        const base = item.name.replace(/\.[^.]+$/, '') || `image-${i + 1}`;
        folder.file(`${String(i + 1).padStart(2, '0')}-${base}.jpg`, blob);
      }
    }
    const out = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out);
    a.download = `图片导出_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    alert(`导出失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }
}

// ---------- 事件绑定 ----------
function bindEvents(): void {
  const recompute = (): void => renderAll();

  for (const sel of ['#canvas-w', '#canvas-h', '#repeat-n', '#margin', '#gap', '#white-border']) {
    $(sel).addEventListener('input', recompute);
    $(sel).addEventListener('change', recompute);
  }
  // 份数手动修改后停止"自动铺满 1 页"同步
  $<HTMLInputElement>('#copies').addEventListener('input', () => {
    state.copiesDirty = true;
    recompute();
  });

  // 自定义照片尺寸：填完宽高即生效（不自动跳页）
  for (const sel of ['#photo-w', '#photo-h']) {
    $(sel).addEventListener('input', () => {
      if (state.photoId === 'custom' && !state.photoCustomAdvanced && num('#photo-w') > 0 && num('#photo-h') > 0) {
        state.photoCustomAdvanced = true;
        renderAll();
      }
    });
  }

  // 纸张方向
  for (const btn of $<HTMLDivElement>('#paper-orient').querySelectorAll<HTMLButtonElement>('button')) {
    btn.addEventListener('click', () => {
      state.paperOrient = btn.dataset.orient === 'landscape' ? 'landscape' : 'portrait';
      state.canvasTouched = true;
      syncChips();
      renderAll();
    });
  }

  // 窗口尺寸变化时重新对位滑块
  window.addEventListener('resize', () => {
    syncChips();
    syncSettingsGroups();
  });

  $<HTMLButtonElement>('#btn-fill-page').addEventListener('click', () => {
    const plan = buildPlan();
    if (plan && plan.layout.fits) {
      state.copiesDirty = true;
      $<HTMLInputElement>('#copies').value = String(plan.layout.perPage);
      renderAll();
    }
  });

  // 素材列表
  $<HTMLButtonElement>('#btn-toggle-files').addEventListener('click', () => {
    state.filesExpanded = !state.filesExpanded;
    renderFileStrip();
  });
  $<HTMLButtonElement>('#btn-clear-files').addEventListener('click', () => {
    state.items = [];
    state.selectedId = null;
    renderFileStrip();
    renderAll();
  });
  $<HTMLButtonElement>('#btn-select-hint').addEventListener('click', () => {
    state.filesExpanded = true;
    renderFileStrip();
    $<HTMLDivElement>('#thumb-strip').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  exportBtn.addEventListener('click', () => void onExport());
  printBtn.addEventListener('click', () => void onPrint());
  $<HTMLButtonElement>('#btn-export-zip').addEventListener('click', () => void onExportZip());
  $<HTMLButtonElement>('#btn-reselect').addEventListener('click', () => goToStep(3));

  // 上/下一步（以按钮所在板块为基准，避免状态漂移）
  const stepCards = Array.from(document.querySelectorAll<HTMLElement>('.step-card'));
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.step-nav [data-nav]')) {
    btn.addEventListener('click', () => {
      const idx = stepCards.indexOf(btn.closest<HTMLElement>('.step-card') ?? stepCards[0]);
      const base = idx >= 0 ? idx + 1 : state.step;
      goToStep(base + (btn.dataset.nav === 'next' ? 1 : -1));
    });
  }
}

// ---------- 启动 ----------
const showDiag = (window as unknown as Record<string, (m: string) => void>).__showDiag;

try {
  initTheme();
  initUpload();
  bindEvents();
  buildChips();
  initSettingsChips();
  renderFileStrip();
  renderAll();

  // 自检：界面必须可见。能区分"初始化没跑"和"样式被浏览器拒绝"两类空屏
  const current = document.querySelector<HTMLElement>('.step-card.current');
  if (!current) {
    showDiag('界面未初始化：.step-card.current 未被设置（初始化逻辑没有跑完）');
  } else if (getComputedStyle(current).display === 'none') {
    showDiag('样式异常：步骤卡被 CSS 隐藏（浏览器可能拒绝解析了样式表）');
  }
} catch (err) {
  showDiag(`启动异常: ${err instanceof Error ? `${err.message}\n${(err.stack || '').split('\n').slice(0, 4).join('\n')}` : String(err)}`);
}
