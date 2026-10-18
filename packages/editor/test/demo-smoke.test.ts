// demo 接线冒烟：真实 demo 的 playground 部分（格式化 / 转换 / 语言 / 计数）。
// 防回归——demo 结构或按钮逻辑改动时此测试会失败，提示同步验证 demo 产物。
import { describe, expect, it } from "vitest";
import { mountDemo } from "../demo/app";
import type { PdEditorElement } from "../src/element";

function setup() {
	document.body.innerHTML = `
	<select id="lang">
		<option value="pd" selected>pd</option>
		<option value="json">json</option>
		<option value="md">md</option>
		<option value="yaml">yaml</option>
		<option value="xml">xml</option>
	</select>
	<button id="format"></button>
	<button id="transform"></button>
	<button id="copy"></button>
	<button id="clear"></button>
	<button id="undo"></button>
	<button id="redo"></button>
	<span id="count"></span>
	<span id="status"></span>
	<pd-editor id="main-editor"></pd-editor>
	`;
	mountDemo();
	const main = document.querySelector<PdEditorElement>("#main-editor")!;
	const status = document.querySelector<HTMLElement>("#status")!;
	const count = document.querySelector<HTMLElement>("#count")!;
	const lang = document.querySelector<HTMLSelectElement>("#lang")!;
	const button = (id: string) =>
		document.querySelector<HTMLButtonElement>(`#${id}`)!;
	return { main, status, count, lang, button };
}

describe("demo playground 冒烟", () => {
	it("格式化 + 单段 PD↔JSON + 多段报错 + 语言/计数", () => {
		const { main, status, count, lang, button } = setup();
		expect(main.editor).not.toBeNull();
		expect(count.textContent).toContain("字符");

		// 格式化：全角冒号 → 半角、冒号后空格
		main.value = "任务：实现防抖搜索框\n影像风格:真人实拍";
		button("format").click();
		expect(main.value).toContain("任务: 实现防抖搜索框");
		expect(main.value).toContain("影像风格: 真人实拍");
		expect(status.textContent).toBe("已格式化");

		// 单段 pd → json → pd 回环
		main.value = "角色: 资深工程师\n任务: 实现防抖搜索框";
		lang.value = "pd";
		lang.dispatchEvent(new Event("change"));
		button("transform").click();
		expect(status.textContent).toBe("已转换 JSON");
		expect(lang.value).toBe("json");
		expect(main.value).toContain('"任务": "实现防抖搜索框"');
		button("transform").click();
		expect(status.textContent).toBe("已转换 PD");
		expect(lang.value).toBe("pd");

		// 多段 pd：转换报错列出段名
		main.value = "//!pd 基础设定\na: 1\n//!pd 主任务\nb: 2";
		button("transform").click();
		expect(status.textContent).toContain("2 个 pd 段");
		expect(status.textContent).toContain("基础设定");

		// 非 pd 语言：格式化给出提示
		lang.value = "md";
		lang.dispatchEvent(new Event("change"));
		button("format").click();
		expect(status.textContent).toContain("只支持 pd");

		// 计数随输入更新
		main.value = "a: 1\nb: 2";
		main.dispatchEvent(
			new CustomEvent("pd-input", { detail: { value: main.value } }),
		);
		expect(count.textContent).toContain("2 行");
	});
});
