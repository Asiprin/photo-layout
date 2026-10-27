/**
 * 全局错误上报横幅
 *
 * 远程设备上如果界面初始化失败（白屏/空屏），用户看不到任何线索。
 * 这里用内联样式渲染一个红色错误卡片（不依赖主样式表，CSS 坏了也能显示），
 * 把真实报错直接摆到屏幕上。必须作为 main.ts 的第一个 import，
 * 保证 pdf.js 等依赖在加载期抛错时也能被捕获。
 */
function showDiag(message: string): void {
  if (document.getElementById('pl-diag')) return;
  const box = document.createElement('div');
  box.id = 'pl-diag';
  box.style.cssText = [
    'position:fixed',
    'left:10px',
    'right:10px',
    'top:10px',
    'z-index:2147483647',
    'background:#7f1d1d',
    'color:#fff',
    'padding:12px 14px',
    'border-radius:10px',
    'font:12px/1.6 ui-monospace,Menlo,monospace',
    'white-space:pre-wrap',
    'word-break:break-all',
    'max-height:70vh',
    'overflow:auto',
    'box-shadow:0 8px 30px rgba(0,0,0,.4)',
  ].join(';');
  const featureCheck = [
    'withResolvers=' + (typeof (Promise as unknown as Record<string, unknown>).withResolvers),
    'toHex=' + (typeof (Uint8Array.prototype as unknown as Record<string, unknown>).toHex),
    'Worker=' + typeof Worker,
  ].join(' ');
  box.textContent = `照片排版打印 · 初始化异常（请截图发给开发者）\n\n${message}\n\nUA: ${navigator.userAgent}\nAPI: ${featureCheck}`;
  document.body.appendChild(box);
}

window.addEventListener('error', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && target !== (window as unknown as HTMLElement) && target.tagName) {
    showDiag(`资源加载失败: <${target.tagName.toLowerCase()}> ${(target as HTMLScriptElement).src || ''}`);
    return;
  }
  showDiag(`${e.message}\n${(e.filename || '').split('/').pop()}:${e.lineno || 0}:${e.colno || 0}`);
});

window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string; stack?: string } | undefined;
  showDiag(`未处理的 Promise 拒绝: ${r?.message || String(e.reason)}\n${(r?.stack || '').split('\n').slice(0, 4).join('\n')}`);
});

(window as unknown as Record<string, unknown>).__showDiag = showDiag;

export {};
