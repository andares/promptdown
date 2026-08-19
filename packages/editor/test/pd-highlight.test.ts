import { describe, expect, it } from "vitest";
import { highlightPd } from "../src/pd-highlight";
import { matchKeyValue, hasLiteralColon, splitInlineCode } from "../src/inline";

describe("inline.ts（行内代码/转义判定，与主包 lexer 语义一致）", () => {
	it("反引号配对切分", () => {
		expect(splitInlineCode("a `b` c")).toEqual([
			{ code: false, seg: "a " },
			{ code: true, seg: "`b`" },
			{ code: false, seg: " c" },
		]);
	});
	it("未闭合反引号当普通字符", () => {
		expect(splitInlineCode("`a: b")).toEqual([{ code: false, seg: "`a: b" }]);
	});
	it("行内代码内的 :- 不触发整行转义", () => {
		expect(hasLiteralColon("msg: 看 `x:- y`")).toBe(false);
		expect(hasLiteralColon("msg: x:- y")).toBe(true);
	});
	it("严格键值：a:b / a : b 不是键值", () => {
		expect(matchKeyValue("a:b")).toBeNull();
		expect(matchKeyValue("a : b")).toBeNull();
		expect(matchKeyValue("a: b")).toEqual({ key: "a", value: "b" });
	});
	it("键值右值中的冒号不参与", () => {
		expect(matchKeyValue("url: https://a.com:8443")).toEqual({
			key: "url",
			value: "https://a.com:8443",
		});
	});
});

describe("pd-highlight.ts", () => {
	it("键值行高亮（key + 冒号 + value）", () => {
		const html = highlightPd("name: value\n");
		expect(html).toContain('<span class="pd-key">name</span>');
		expect(html).toContain('<span class="pd-key-punct">:</span>');
		expect(html).toContain("value");
	});
	it("段标记高亮", () => {
		const html = highlightPd("//!pd 基础设定\n");
		expect(html).toContain('<span class="pd-section">//!pd</span>');
		expect(html).toContain("基础设定");
	});
	it("分隔线高亮", () => {
		expect(highlightPd("---\n")).toContain('<span class="pd-sep">---</span>');
	});
	it("引用上色（前后空格）", () => {
		const html = highlightPd("参考: :基础设定\n");
		expect(html).toContain('<span class="pd-ref">:基础设定</span>');
	});
	it("行内代码整体包 span", () => {
		const html = highlightPd("说明: 用 `a: b` 表示\n");
		expect(html).toContain('<span class="pd-inline-code">`a: b`</span>');
	});
	it("围栏内原样（不解析冒号/键值，仅转义）", () => {
		const html = highlightPd('```json\n{"a": 1}\n```\n');
		expect(html).toContain('<span class="pd-fence">```json</span>');
		expect(html).toContain("{&quot;a&quot;: 1}"); // 围栏内容转义但不标色
		expect(html).not.toContain("pd-key");
		expect(html).not.toContain("pd-inline-code");
	});
	it("序列项（- 内容）", () => {
		const html = highlightPd("- 第一项\n");
		expect(html).toContain('<span class="pd-item">-</span>');
	});
	it("-x（无空格）不是序列项，按文本渲染", () => {
		const html = highlightPd("-x\n");
		expect(html).not.toContain("pd-item");
	});
	it("-key: value（无空格）是裸键值不是 item-key", () => {
		const html = highlightPd("-key: value\n");
		expect(html).not.toContain("pd-item");
		expect(html).toContain('<span class="pd-key">-key</span>');
	});
	it("带缩进的裸键值保留缩进", () => {
		const html = highlightPd("  name: value\n");
		expect(html).toContain('  <span class="pd-key">name</span>');
	});
	it("覆盖层对齐：高亮 HTML 去标签后与原文逐字符一致（多空格/行尾空白）", () => {
		const cases = [
			"-  x\n",
			"-  多空格 内容\n",
			"name:  value\n",
			"name: value  \n",
			"  name:  value  \n",
			"- sub:  value\n",
			"text  内容\n",
		];
		for (const src of cases) {
			const html = highlightPd(src);
			const text = html.replace(/<[^>]+>/g, ""); // 去标签
			expect(text).toBe(src); // 与原文逐字符一致（含尾 \n）
		}
	});
	it("HTML 转义（< > &）", () => {
		const html = highlightPd("a < b & c\n");
		expect(html).toContain("a &lt; b &amp; c");
	});
});
