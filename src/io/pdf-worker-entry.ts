/**
 * pdf.js worker 入口：先打 polyfill（withResolvers / toHex），再启动 pdf.worker
 * （ES 模块按声明顺序执行，polyfill 必须在 pdf.worker 之前生效）
 */
import '../polyfills';
import './uint8-hex-polyfill';
import 'pdfjs-dist/build/pdf.worker.mjs';
