#!/usr/bin/env node
/**
 * 构建单文件 demo：`demo-dist/index.html` —— 双击即可打开（file:// 可用）。
 *
 * 为什么不用 vite：
 * - Chromium 会以 CORS 拒绝 file:// 下的 ES module 脚本；vite 默认输出 <script type="module">；
 * - 单文件（HTML + CSS + 内联 IIFE）没有相对资源/端口/服务器依赖，适合当“引用示例”分发。
 *
 * 开发迭代仍用 `pnpm dev`（vite 直接跑 demo/index.html + ./main.ts 热更新）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML_IN = join(ROOT, "demo/index.html");
const OUT_DIR = join(ROOT, "demo-dist");
const OUT_HTML = join(OUT_DIR, "index.html");

let html = readFileSync(HTML_IN, "utf8");
const moduleTag = /<script\s+type="module"\s+src="\.\/main\.ts"><\/script>/;
if (!moduleTag.test(html)) {
	console.error("demo/index.html 缺少 <script type=\"module\" src=\"./main.ts\">");
	process.exit(1);
}
html = html.replace(moduleTag, "");

const result = await build({
	entryPoints: [join(ROOT, "demo/main.ts")],
	bundle: true,
	write: false,
	format: "iife",
	target: "es2020",
	minify: true,
	legalComments: "none",
	logLevel: "silent",
	define: { "process.env.NODE_ENV": '"production"' },
});
const output = result.outputFiles?.[0];
if (!output) {
	console.error("esbuild 未产出 bundle");
	process.exit(1);
}
// 内联脚本里不能出现 </script（字符串字面量也需转义）
const js = output.text.replace(/<\/script/gi, "<\\/script");

const banner = "<!-- 由 scripts/build-demo.mjs 生成：单文件 demo（file:// 双击可用） -->\n";
const standalone = banner + html.replace("</body>", `<script>${js}</script>\n</body>`);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_HTML, standalone);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
	`demo-dist/index.html  ${kb(Buffer.byteLength(standalone))}（内联 JS ${kb(Buffer.byteLength(js))}）`,
);
