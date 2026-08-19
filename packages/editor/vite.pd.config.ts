import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// pd-only 精简入口（@andares/pdeditor/pd）：不含 Prism 的自包含产物。
// 与 vite.config.ts（全量入口）串联执行：后者 emptyOutDir:true 先清空，
// 本配置 emptyOutDir:false 只追加 pd.js / pd.cjs，不覆盖 index 系列。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/pd.ts"),
			name: "PdEditorPd",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "pd.js" : "pd.cjs"),
		},
		sourcemap: true,
		emptyOutDir: false,
	},
});
