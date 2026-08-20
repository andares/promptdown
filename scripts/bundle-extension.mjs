#!/usr/bin/env node
/**
 * VSCode 扩展自包含打包：esbuild 把 src/extension.ts bundle 成单文件 dist/extension.js。
 *
 * 为什么必须 bundle：语义已抽到 @andares/pdfoundation，dist/extension.js 若直接
 * require 外部包，VSIX 装到用户机器上没有 node_modules → 扩展激活失败。
 * vsce package --no-dependencies（pnpm + symlink 布局下的既定姿势）不含依赖，
 * 因此扩展入口必须在构建期自包含；仅 external "vscode"（宿主提供）。
 *
 * 前置：packages/pdfoundation 需先 build（bundle 解析其 dist/index.cjs）——
 * 主包 build 脚本已按「foundation build → tsc → 本脚本」顺序串联。
 */
import { build } from "esbuild";

await build({
	entryPoints: ["src/extension.ts"],
	outfile: "dist/extension.js",
	bundle: true,
	platform: "node",
	target: "node18",
	format: "cjs",
	external: ["vscode"],
	logLevel: "info",
});
