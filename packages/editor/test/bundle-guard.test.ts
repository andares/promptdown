import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 产物守卫：dist 构建后才跑断言（未构建时 skip——tsc/vitest 单独跑不依赖 dist）。
 * 保证双入口的裁剪承诺不被回退：pd 产物绝不含 Prism、两产物均自包含（无 bare import）。
 */
const dist = resolve(__dirname, "../dist");
const read = (f: string) => readFileSync(resolve(dist, f), "utf8");
const built = existsSync(resolve(dist, "pd.js")) && existsSync(resolve(dist, "index.js"));

describe.skipIf(!built)("dist 产物守卫", () => {
	it("pd.js / pd.cjs 不含 Prism（精简入口的裁剪承诺）", () => {
		expect(read("pd.js").toLowerCase()).not.toContain("prism");
		expect(read("pd.cjs").toLowerCase()).not.toContain("prism");
	});

	it("pd 产物：语义包 external（仅 @andares/pdfoundation 一个 bare import，其余自包含）", () => {
		const esm = read("pd.js");
		// 顶层/动态 import 只允许相对路径、node: 内建，或语义包 @andares/pdfoundation（re-export，由消费方按 peer 提供）
		for (const m of esm.matchAll(/import\s*(?:[\s{][^;]*?\sfrom\s*)?["']([^"']+)["']/g)) {
			expect(
				m[1].startsWith(".") ||
					m[1].startsWith("node:") ||
					m[1] === "@andares/pdfoundation",
			).toBe(true);
		}
		const cjs = read("pd.cjs");
		for (const m of cjs.matchAll(/require\(["']([^"']+)["']\)/g)) {
			expect(
				m[1].startsWith(".") ||
					m[1].startsWith("node:") ||
					m[1] === "@andares/pdfoundation",
			).toBe(true);
		}
	});

	it("pd 产物 re-export 语义（format/jsonToPdText/pdToJsonText 来自 external 包）", () => {
		const esm = read("pd.js").toLowerCase();
		expect(esm).toContain("@andares/pdfoundation"); // 必须有语义 bare import（防未来意外内联成副本）
		const dts = readFileSync(resolve(dist, "pd.d.ts"), "utf8");
		expect(dts).toContain('from "@andares/pdfoundation"');
	});

	it("全量 index.js 含 Prism（sanity：主入口语义未变）", () => {
		expect(read("index.js").toLowerCase()).toContain("prism");
	});
});
