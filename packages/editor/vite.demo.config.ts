import { defineConfig } from "vite";

/**
 * demo 预构建配置：把 demo 页构建成纯静态产物（可直接 file:// 或 firefox.localhost 打开，
 * 无需 vite dev server）。
 *
 * - root = demo/（index.html 在 demo 下）
 * - base = "./"（相对路径——file:// 打开时资源引用必须是相对路径）
 * - outDir = ../demo-dist（产物：index.html + assets/*.js，bundle 了 yace/prismjs/pd 源码）
 */
export default defineConfig({
 root: "demo",
 base: "./",
 build: {
  outDir: "../demo-dist",
  emptyOutDir: true,
 },
});
