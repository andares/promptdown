import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// 副作用自动注册入口：import "@andares/pdeditor/element/auto"。
// 单独打包（内联 element 层），保证消费方不需要再调 definePdEditor。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/element-auto.ts"),
			name: "PdEditorElementAuto",
			formats: ["es", "cjs"],
			fileName: (format) =>
				format === "es" ? "element-auto.js" : "element-auto.cjs",
		},
		sourcemap: false,
		emptyOutDir: false,
		rollupOptions: {
			external: ["@andares/pdfoundation"],
		},
	},
});
