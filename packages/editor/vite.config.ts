import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// 库模式构建：全量入口（index.js/index.cjs，含 Prism）。双入口体系：
// 本配置先跑（emptyOutDir:true 清空 dist），vite.pd.config.ts 后跑追加 pd-only 产物；
// d.ts 由 tsc --emitDeclarationOnly 按模块输出（index/pd/core/... 各自一份）。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "PdEditor",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
		},
		sourcemap: true,
		emptyOutDir: true,
	},
	test: {
		environment: "jsdom",
		include: ["test/**/*.test.ts"],
	},
});
