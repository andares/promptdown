import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { PdEditor, type PdEditorElement } from "../src/react";

// React 18.3+ 的 act 需要这个全局标记
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

function renderEditor(props: Record<string, unknown> = {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const mount = async (p: Record<string, unknown>) => {
		await act(async () => {
			root.render(createElement(PdEditor, p));
		});
	};
	return { container, root, mount, initial: mount(props) };
}

describe("React 包装", () => {
	it("defaultValue 初始化 + onValueChange 事件桥接", async () => {
		const seen: string[] = [];
		const { container, root, initial } = renderEditor({
			defaultValue: "任务: 测试",
			onValueChange: (v: string) => seen.push(v),
		});
		await initial;
		const el = container.querySelector("pd-editor") as PdEditorElement;
		expect(el).not.toBeNull();
		expect(el.value).toBe("任务: 测试");
		await act(async () => {
			const ta = el.textarea!;
			ta.value = "任务: 改";
			ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});
		expect(seen).toEqual(["任务: 改"]);
		await act(async () => root.unmount());
	});

	it("受控 value：外部更新回写；同值不打断输入", async () => {
		const { container, root, mount, initial } = renderEditor({
			value: "a: 1",
		});
		await initial;
		const el = container.querySelector("pd-editor") as PdEditorElement;
		expect(el.value).toBe("a: 1");
		// 用户输入 → 宿主不更新 value prop 时不回写
		await act(async () => {
			const ta = el.textarea!;
			ta.value = "a: 1 typed";
			ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
		});
		expect(el.value).toBe("a: 1 typed");
		// 宿主更新 value → 回写
		await mount({ value: "b: 2" });
		expect(el.value).toBe("b: 2");
		await act(async () => root.unmount());
	});

	it("属性映射：language / placeholder / lineNumbers / readOnly", async () => {
		const { container, root, initial } = renderEditor({
			language: "json",
			placeholder: "请输入",
			lineNumbers: true,
			readOnly: true,
		});
		await initial;
		const el = container.querySelector("pd-editor") as PdEditorElement;
		expect(el.language).toBe("json");
		expect(el.placeholder).toBe("请输入");
		expect(el.lineNumbers).toBe(true);
		expect(el.readOnly).toBe(true);
		expect(el.textarea!.readOnly).toBe(true);
		await act(async () => root.unmount());
	});
});
