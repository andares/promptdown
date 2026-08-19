import { describe, expect, it } from "vitest";
import { createPdEditor } from "../src/pd";

describe("pd-only 入口（@andares/pdeditor/pd）", () => {
	it("创建/取值/销毁与主入口行为一致", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, { value: "任务: 测试\n" });
		expect(editor.getValue()).toBe("任务: 测试\n");
		editor.setValue("改名: 值\n");
		expect(editor.getValue()).toBe("改名: 值\n");
		editor.destroy();
	});

	it("pd 语言高亮（自研 tokenizer，无 Prism 依赖）", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, { value: "任务: 完成\n" });
		const pre = el.querySelector("pre")!;
		expect(pre.innerHTML).not.toBe("");
		// 键值行应有 token 类（自研 tokenizer 的 key/value span）
		expect(pre.innerHTML).toContain("任务");
		editor.destroy();
	});

	it("setLanguage 切到非 pd 语言：纯文本渲染（无高亮但功能完好）", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, { value: "# heading\n" });
		editor.setLanguage("md");
		editor.setValue("# heading\n");
		const pre = el.querySelector("pre")!;
		// 纯文本回退：内容转义后原样，无 Prism token 类
		expect(pre.innerHTML).toContain("# heading");
		expect(pre.innerHTML).not.toContain('class="token');
		editor.destroy();
	});

	it("BYO highlight 覆盖内置（与主入口同）", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "x\n",
			highlight: (source, lang) => `<b>${lang}:${source.length}</b>`,
		});
		const pre = el.querySelector("pre")!;
		expect(pre.innerHTML).toContain("<b>pd:2</b>");
		editor.destroy();
	});
});
