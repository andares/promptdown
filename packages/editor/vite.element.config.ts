import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// `<pd-editor>` 元素入口：自包含（core + pd tokenizer + 元素层），
// 只 external 共享语义包。默认不含 Prism（需要 md/json/yaml 时由宿主注入 highlight）。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/element.ts"),
			name: "PdEditorElement",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "element.js" : "element.cjs"),
		},
		sourcemap: false,
		emptyOutDir: false,
		rollupOptions: {
			external: ["@andares/pdfoundation"],
		},
	},
});
