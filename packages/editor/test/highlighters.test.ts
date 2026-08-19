import { describe, expect, it } from "vitest";
import {
	highlightWithPrism,
	toPrismLang,
	type PrismLang,
} from "../src/highlighters";

describe("highlighters.ts（Prism 集成）", () => {
	it("toPrismLang 映射", () => {
		expect(toPrismLang("md")).toBe("markdown");
		expect(toPrismLang("xml")).toBe("markup");
		expect(toPrismLang("json")).toBe("json");
		expect(toPrismLang("yaml")).toBe("yaml");
		expect(toPrismLang("pd")).toBeNull();
	});

	it("json 高亮产出 token span", () => {
		const html = highlightWithPrism('{"a": "b"}', "json");
		expect(html).toContain('<span class="token property">');
		expect(html).toContain('<span class="token string">');
	});

	it("yaml 高亮产出 token span", () => {
		const html = highlightWithPrism("a: b\n", "yaml");
		expect(html).toContain('<span class="token key atrule">');
	});

	it("未知语法降级为纯转义（不报错）", () => {
		// highlightWithPrism 接受 PrismLang 联合类型，但运行时传入未知语法（Prism.languages 无此键）
		// → 走 escapeHtml 降级分支
		const html = highlightWithPrism("<a> & </a>", "nosuchlang" as PrismLang);
		expect(html).toContain("&lt;a&gt; &amp; &lt;/a&gt;");
	});
});
