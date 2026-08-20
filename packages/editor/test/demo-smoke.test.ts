// demo 按钮接线冒烟（DOM 事件 → 主包函数 → setValue 回写 / status 提示）：
// 防回归——demo 页结构或按钮逻辑改动时此测试会失败，提示同步验证 demo 产物。
import { describe, expect, it } from "vitest";

describe("demo 按钮冒烟", () => {
	it("多段报错 + 单段来回转换 + 语言切换 + fmt 非 pd 提示", async () => {
		// demo/main.ts 是脚本（顶层查 DOM + 绑监听器）——先建 DOM 再 import（仅一次）
		document.body.innerHTML = `
		<select id="lang">
			<option value="pd" selected>pd</option>
			<option value="md">md</option>
			<option value="xml">xml</option>
			<option value="json">json</option>
			<option value="yaml">yaml</option>
		</select>
		<button id="fmt">格式化（pd）</button>
		<button id="transform">转换 JSON ↔ PD</button>
		<span id="status"></span>
		<div id="editor"></div>
	`;
		await import("../demo/main");
		const win = window as unknown as { pdEditor: { getValue: () => string; setValue: (v: string) => void } };
		const s = document.querySelector<HTMLSpanElement>("#status")!;
		const fmt = document.querySelector<HTMLButtonElement>("#fmt")!;
		const transform = document.querySelector<HTMLButtonElement>("#transform")!;
		const langSel = document.querySelector<HTMLSelectElement>("#lang")!;

		// 多段 pd → 报错列段名
		transform.click();
		expect(s.textContent).toContain("2 个 pd 段");
		expect(s.textContent).toContain("基础设定");

		// 单段 pd → json
		win.pdEditor.setValue("角色: 资深工程师\n任务: 实现防抖搜索框");
		transform.click();
		expect(s.textContent).toContain("已转换 JSON");
		const json = win.pdEditor.getValue();
		expect(json).toContain('"任务": "实现防抖搜索框"');
		expect(langSel.value).toBe("json");

		// json → pd（回环）
		transform.click();
		expect(s.textContent).toContain("已转换 PD");
		expect(win.pdEditor.getValue()).toContain("任务: 实现防抖搜索框");
		expect(langSel.value).toBe("pd");

		// 再来回一次：结果与原 json 一致（键值对文本完整回环）
		transform.click();
		expect(win.pdEditor.getValue()).toBe(json);

		// fmt：非 pd 语言提示
		langSel.value = "md";
		langSel.dispatchEvent(new Event("change"));
		fmt.click();
		expect(s.textContent).toContain("仅 pd 语法支持格式化");

		// fmt：pd 语言真正格式化（全角冒号 → 半角、冒号后空格）
		langSel.value = "pd";
		langSel.dispatchEvent(new Event("change"));
		win.pdEditor.setValue("任务：实现防抖搜索框\n影像风格:真人实拍");
		fmt.click();
		expect(win.pdEditor.getValue()).toContain("任务: 实现防抖搜索框");
		expect(win.pdEditor.getValue()).toContain("影像风格: 真人实拍");

		// md/xml/yaml 语言点转换 → 提示不支持
		langSel.value = "xml";
		langSel.dispatchEvent(new Event("change"));
		transform.click();
		expect(s.textContent).toContain("仅 pd / json 语法支持相互转换");
	});
});
