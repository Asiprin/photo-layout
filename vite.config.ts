import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // safari16：让 esbuild 把 static {} 等 16.4+ 语法降级（iOS 16.0-16.3 兼容）
    target: ['safari16', 'chrome111'],
    chunkSizeWarningLimit: 2000,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
