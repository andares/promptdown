import { resolve } from "node:path";
import { defineConfig } from "vite";

// pdfoundation 库构建：ESM + CJS 双格式（index.js / index.cjs），d.ts 由 tsc 输出。
// 零运行时依赖 → 无需 external；sideEffects:false 保证消费方 bundler 可树摇。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			name: "PdFoundation",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
		},
		sourcemap: true,
		emptyOutDir: true,
	},
});
