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

const builtExtras =
	existsSync(resolve(dist, "element.js")) &&
	existsSync(resolve(dist, "element-auto.js")) &&
	existsSync(resolve(dist, "react.js"));

describe.skipIf(!builtExtras)("element / react 产物守卫", () => {
	const bareImports = (code: string) => {
		const out: string[] = [];
		for (const m of code.matchAll(
			/import\s*(?:[\s{][^;]*?\sfrom\s*)?["']([^"']+)["']/g,
		)) out.push(m[1]);
		for (const m of code.matchAll(/require\(["']([^"']+)["']\)/g))
			out.push(m[1]);
		return [
			...new Set(out.filter((s) => !s.startsWith(".") && !s.startsWith("node:"))),
		].sort();
	};

	it("element 入口：不含 Prism，仅 foundation external", () => {
		const esm = read("element.js");
		expect(esm.toLowerCase()).not.toContain("prism");
		expect(bareImports(esm)).toEqual(["@andares/pdfoundation"]);
		expect(bareImports(read("element.cjs"))).toEqual([
			"@andares/pdfoundation",
		]);
	});

	it("element/auto：包含 customElements 注册且同样自包含", () => {
		const esm = read("element-auto.js");
		expect(esm).toContain("customElements");
		expect(esm.toLowerCase()).not.toContain("prism");
		expect(bareImports(esm)).toEqual(["@andares/pdfoundation"]);
	});

	it("react 入口：react + foundation external，不含 Prism", () => {
		const esm = read("react.js");
		expect(bareImports(esm).sort()).toEqual([
			"@andares/pdfoundation",
			"react",
		]);
		expect(esm.toLowerCase()).not.toContain("prism");
		expect(bareImports(read("react.cjs")).sort()).toEqual([
			"@andares/pdfoundation",
			"react",
		]);
	});

	it("类型出口：element / react 的 d.ts 可解析", () => {
		expect(readFileSync(resolve(dist, "element.d.ts"), "utf8")).toContain(
			"definePdEditor",
		);
		expect(readFileSync(resolve(dist, "react.d.ts"), "utf8")).toContain(
			'from "react"',
		);
	});
});
