import { beforeEach, describe, expect, it, vi } from "vitest";
import { definePdEditor, type PdEditorElement } from "../src/element";

const Ctor = definePdEditor("pd-editor-test");
if (!Ctor) throw new Error("definePdEditor 在 jsdom 下应返回构造器");

function mount(tag = "pd-editor-test"): PdEditorElement {
	const el = new Ctor();
	document.body.appendChild(el);
	return el;
}

describe("<pd-editor> 自定义元素", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("定义幂等；挂载到 shadow root（root/textarea/高亮层）", () => {
		expect(definePdEditor("pd-editor-test")).toBe(Ctor);
		const el = mount();
		expect(el.shadowRoot).not.toBeNull();
		expect(el.shadowRoot!.querySelector(".pd-root")).not.toBeNull();
		expect(el.shadowRoot!.querySelector("textarea")).not.toBeNull();
		expect(el.shadowRoot!.querySelector("pre.pd-highlight")).not.toBeNull();
		expect(el.editor).not.toBeNull();
		expect(el.textarea).toBeInstanceOf(HTMLTextAreaElement);
	});

	it("value 属性/属性反射 + 程序化 setValue", () => {
		const el = mount();
		el.value = "任务: 测试";
		expect(el.getValue()).toBe("任务: 测试");
		el.setAttribute("value", "改名: 值");
		expect(el.value).toBe("改名: 值");
		el.setValue("再改: 一次");
		expect(el.editor!.getValue()).toBe("再改: 一次");
	});

	it("language / placeholder / line-numbers / readonly / disabled / maxlength", () => {
		const el = mount();
		el.language = "json";
		el.placeholder = "请输入";
		el.lineNumbers = true;
		el.readOnly = true;
		el.maxLength = 5;
		el.value = "123456789";
		expect(el.language).toBe("json");
		expect(el.placeholder).toBe("请输入");
		expect(el.lineNumbers).toBe(true);
		expect(el.readOnly).toBe(true);
		expect(el.maxLength).toBe(5);
		expect(el.value).toBe("12345");
		expect(el.shadowRoot!.querySelector(".pd-lines")).not.toBeNull();
		expect(el.shadowRoot!.querySelector(".pd-placeholder")!.textContent).toBe(
			"请输入",
		);
		expect(el.textarea!.readOnly).toBe(true);
		expect(el.textarea!.maxLength).toBe(5);
		el.disabled = true;
		expect(el.textarea!.disabled).toBe(true);
	});

	it("事件：pd-input / pd-change / pd-focus / pd-blur", () => {
		const el = mount();
		const seen: string[] = [];
		let inputValue = "";
		el.addEventListener("pd-input", (e) => {
			seen.push("input");
			inputValue = (e as CustomEvent<{ value: string }>).detail.value;
		});
		el.addEventListener("pd-change", () => seen.push("change"));
		el.addEventListener("pd-focus", () => seen.push("focus"));
		el.addEventListener("pd-blur", () => seen.push("blur"));

		const ta = el.textarea!;
		ta.focus();
		ta.value = "a: 1";
		ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
		ta.blur();
		expect(inputValue).toBe("a: 1");
		expect(seen).toEqual(["focus", "input", "change", "blur"]);
	});

	it("aria-label 转发到内部 textarea；覆盖层 aria-hidden", () => {
		const el = document.createElement("pd-editor-test") as PdEditorElement;
		el.setAttribute("aria-label", "提示词输入");
		document.body.appendChild(el);
		expect(el.textarea!.getAttribute("aria-label")).toBe("提示词输入");
		expect(el.shadowRoot!.querySelector("pre")!.getAttribute("aria-hidden")).toBe(
			"true",
		);
		expect(
			el.shadowRoot!.querySelector(".pd-placeholder")!.getAttribute("aria-hidden"),
		).toBe("true");
	});

	it("shadow=false：light DOM + 一次性注入 scoped 样式", () => {
		const el = document.createElement("pd-editor-test") as PdEditorElement;
		el.setAttribute("shadow", "false");
		el.value = "a: 1";
		document.body.appendChild(el);
		expect(el.shadowRoot).toBeNull();
		expect(el.querySelector(".pd-root")).not.toBeNull();
		expect(
			document.head.querySelector("style[data-pd-editor]"),
		).not.toBeNull();
	});

	it("升级前写入的 property 不丢失（框架在定义前赋值）", async () => {
		const tag = "pd-editor-upgrade-test";
		const el = document.createElement(tag) as PdEditorElement;
		// 自定义元素未定义时，这里会创建 own property（shadow 掉原型 accessor）
		el.value = "up: 1";
		document.body.appendChild(el);
		definePdEditor(tag);
		await Promise.resolve();
		expect(el.value).toBe("up: 1");
		expect(el.editor).not.toBeNull();
	});

	it("undo / redo / insertText / selection 方法透传", () => {
		vi.useFakeTimers();
		try {
			const el = mount();
			el.value = "hello";
			el.setSelection(0, 0);
			el.insertText("X");
			expect(el.value).toBe("Xhello");
			expect(el.getSelection()).toEqual({ start: 1, end: 1 });
			vi.advanceTimersByTime(1100);
			el.undo();
			expect(el.value).toBe("hello");
			el.redo();
			expect(el.value).toBe("Xhello");
		} finally {
			vi.useRealTimers();
		}
	});

	it("inputmode / enterkeyhint 转发到内部 textarea", () => {
		const el = mount();
		el.setAttribute("inputmode", "text");
		el.setAttribute("enterkeyhint", "send");
		expect(el.textarea!.getAttribute("inputmode")).toBe("text");
		expect(el.textarea!.getAttribute("enterkeyhint")).toBe("send");
	});

	it("formResetCallback 回到初始值", () => {
		const el = document.createElement("pd-editor-test") as PdEditorElement;
		el.value = "initial"; // 连接前的初始值 → 作为 form reset 默认值
		document.body.appendChild(el);
		el.value = "changed";
		el.formResetCallback();
		expect(el.value).toBe("initial");
	});

	it("断开连接销毁、重连恢复值与编辑器", () => {
		const el = mount();
		el.value = "keep: me";
		el.remove();
		expect(el.editor).toBeNull();
		document.body.appendChild(el);
		expect(el.editor).not.toBeNull();
		expect(el.value).toBe("keep: me");
	});
});
