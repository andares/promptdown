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

	it("pd 产物自包含：无 bare import / require（依赖已内联，消费方无需安装）", () => {
		const esm = read("pd.js");
		// 顶层/动态 import 只允许相对路径或 node: 内建（实际构建应为零 import）
		for (const m of esm.matchAll(/import\s*(?:[\s{][^;]*?\sfrom\s*)?["']([^"']+)["']/g)) {
			expect(m[1].startsWith(".") || m[1].startsWith("node:")).toBe(true);
		}
		const cjs = read("pd.cjs");
		for (const m of cjs.matchAll(/require\(["']([^"']+)["']\)/g)) {
			expect(m[1].startsWith(".") || m[1].startsWith("node:")).toBe(true);
		}
	});

	it("全量 index.js 含 Prism（sanity：主入口语义未变）", () => {
		expect(read("index.js").toLowerCase()).toContain("prism");
	});
});
