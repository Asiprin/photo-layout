/**
 * 深浅色主题：默认跟随系统，手动切换后记住选择
 */

type Theme = 'dark' | 'light';

const KEY = 'pl-theme';

export function currentTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme) || 'light';
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(KEY, t);
}

export function initTheme(): void {
  // 首屏主题已由 index.html 内联脚本设定，这里只绑定切换按钮
  const btn = document.querySelector<HTMLButtonElement>('#theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
}
