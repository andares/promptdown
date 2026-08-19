import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// 库模式构建：ESM（index.js）+ CJS（index.cjs）+ d.ts（tsc 单独输出）
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
