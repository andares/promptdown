import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// React 包装入口（react 作为 optional peerDependency，不内联）。
export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/react.ts"),
			name: "PdEditorReact",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "react.js" : "react.cjs"),
		},
		sourcemap: false,
		emptyOutDir: false,
		rollupOptions: {
			external: ["@andares/pdfoundation", "react"],
		},
	},
});
