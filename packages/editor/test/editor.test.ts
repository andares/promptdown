import { describe, expect, it, vi } from "vitest";
import { createPdEditor } from "../src/index";

/** jsdom 下挂载 headless 编辑器并返回实例 */
function mount(
	value = "",
	language: "pd" | "md" | "xml" | "json" | "yaml" = "pd",
) {
	const el = document.createElement("div");
	document.body.appendChild(el);
	const editor = createPdEditor(el, { value, language });
	return { el, editor };
}

describe("createPdEditor（headless API）", () => {
	it("挂载到容器并创建 textarea", () => {
		const { el, editor } = mount("name: value\n");
		expect(el.querySelector("textarea")).not.toBeNull();
		expect(editor.textarea).toBeInstanceOf(HTMLTextAreaElement);
		editor.destroy();
	});

	it("getValue / setValue 往返", () => {
		const { editor } = mount("name: value\n");
		expect(editor.getValue()).toBe("name: value\n");
		editor.setValue("//!pd 新段\nx: 1\n");
		expect(editor.getValue()).toBe("//!pd 新段\nx: 1\n");
		editor.destroy();
	});

	it("styles 应用到引擎根节点与覆盖层（不污染挂载点）", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "name: value\n",
			styles: {
				fontSize: "14px",
				lineHeight: "20px",
				padding: "12px",
			},
		});

		// 挂载点不被写入任何内联样式（低 UI：宿主布局归宿主）
		expect(el.style.fontSize).toBe("");
		expect(el.style.padding).toBe("");
		const root = editor.root;
		expect(root.style.fontSize).toBe("14px");
		expect(root.style.lineHeight).toBe("20px");
		// padding 应用到高亮层/输入层（而不是 root，否则绝对定位会被再偏移一次）
		expect(editor.textarea.style.padding).toBe("12px");
		expect(editor.pre.style.padding).toBe("12px");
		expect(root.style.padding).toBe("");
		editor.destroy();
	});

	it("setLanguage 切换后高亮输出对应语言（pd → json）", () => {
		const { el, editor } = mount("a: b\n", "pd");
		// pd 高亮：键名有 pd-key class
		expect(el.innerHTML).toContain("pd-key");
		editor.setLanguage("json");
		editor.setValue('{"a": "b"}\n');
		// json 高亮（Prism）：token 类而非 pd-key
		expect(el.innerHTML).not.toContain("pd-key");
		editor.destroy();
	});

	it("onValueChange 回调（输入触发）", () => {
		let called = 0;
		let last = "";
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "x: 1\n",
			onValueChange: (v) => {
				called++;
				last = v;
			},
		});
		// 模拟 textarea 输入
		const ta = editor.textarea;
		ta.value = "x: 1\ny: 2\n";
		ta.dispatchEvent(new Event("input", { bubbles: true }));
		expect(called).toBeGreaterThan(0);
		expect(last).toBe("x: 1\ny: 2\n");
		editor.destroy();
	});

	it("setValue 程序化设置不触发 onValueChange", () => {
		let called = 0;
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "x: 1\n",
			onValueChange: () => {
				called++;
			},
		});
		editor.setValue("y: 2\n");
		expect(called).toBe(0); // setValue 不触发回调
		expect(editor.getValue()).toBe("y: 2\n");
		editor.destroy();
	});

	it("destroy 移除挂载", () => {
		const { el, editor } = mount("x: 1\n");
		editor.destroy();
		expect(el.children.length).toBe(0);
	});
});

describe("中文输入法组合期渲染", () => {
	it("组合期 input 更新渲染层（pre 内容同步），且不触发 onValueChange", () => {
		let called = 0;
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "任务: \n",
			onValueChange: () => {
				called++;
			},
		});
		const ta = editor.textarea;
		const pre = el.querySelector("pre")!;
		// 模拟拼音组合：compositionstart → 输入拼音（选字前）→ compositionend
		ta.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
		ta.value = "任务: ni";
		ta.setSelectionRange(4, 6);
		// 组合期 input：真实浏览器事件带 isComposing=true（引擎会跳过提交，组件监听器接管渲染）
		const composingInput = new Event("input", { bubbles: true });
		Object.defineProperty(composingInput, "isComposing", { value: true });
		ta.dispatchEvent(composingInput);
		// 组合期：渲染层同步（pre 包含组合文本），回调不触发（中间态）
		expect(editor.getValue()).toBe("任务: ni");
		expect(pre.innerHTML).toContain("ni");
		expect(called).toBe(0);
		ta.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
		// 选字确认：正常输入事件 → 值更新 + 回调触发
		ta.value = "任务: 你";
		ta.setSelectionRange(4, 5);
		ta.dispatchEvent(new Event("input", { bubbles: true }));
		expect(editor.getValue()).toBe("任务: 你");
		expect(called).toBe(1);
		editor.destroy();
	});
});

describe("history 撤销 / 重做", () => {
	it("撤回到初始内容时光标回到首次变更点（不定到末尾）", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			// 用户把光标放在 "he" 后（位置 2）开始编辑，插入 x
			const editor = createPdEditor(el, { value: "hello\n" });
			const ta = editor.textarea;
			ta.value = "hexllo\n";
			ta.setSelectionRange(3, 3);
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			vi.advanceTimersByTime(1000); // 落栈：初始快照光标补记为公共前缀 2
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("hello\n");
			// 光标在首次变更点 2，而不是末尾 6
			expect(ta.selectionStart).toBe(2);
			expect(ta.selectionEnd).toBe(2);
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("Ctrl+Z 撤销、Ctrl+Shift+Z 重做（5 步记忆，光标随快照恢复）", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			const editor = createPdEditor(el, { value: "a\n" });
			const ta = editor.textarea;
			// 模拟用户输入两步（每步后隔 1s，防抖已落栈）
			const input = (v: string) => {
				ta.value = v;
				ta.setSelectionRange(v.length, v.length);
				ta.dispatchEvent(new Event("input", { bubbles: true }));
				vi.advanceTimersByTime(1000);
			};
			input("ab\n");
			input("abc\n");
			expect(editor.getValue()).toBe("abc\n");
			// Ctrl+Z 撤销一步，光标回到 "ab\n" 快照位置（末尾）
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("ab\n");
			expect(ta.selectionStart).toBe("ab\n".length);
			// 再撤销一步：退到初始值，光标在首次变更点 1（'a' 后输入 'b' 前），
			// 而非旧的默认末尾 2（修复：初始快照光标惰性推导）
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("a\n");
			expect(ta.selectionStart).toBe(1);
			// 撤到底后继续 Ctrl+Z：无操作（初始快照恒在栈底）
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("a\n");
			// Ctrl+Shift+Z 重做一步，光标随快照恢复
			ta.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "z",
					ctrlKey: true,
					shiftKey: true,
					cancelable: true,
				}),
			);
			expect(editor.getValue()).toBe("ab\n");
			expect(ta.selectionStart).toBe("ab\n".length);
			// Ctrl+Y 也支持重做
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "y", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("abc\n");
			// 撤销到底 → 重做到底 → 再重做：无操作
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "y", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("abc\n");
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("连续输入防抖合并为一步（1s 内逐字输入，Ctrl+Z 一步回到输入前）", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			const editor = createPdEditor(el, { value: "a\n" });
			const ta = editor.textarea;
			const input = (v: string) => {
				ta.value = v;
				ta.setSelectionRange(v.length, v.length);
				ta.dispatchEvent(new Event("input", { bubbles: true }));
			};
			// 逐字连续输入（未到 1s 防抖窗口，均为同一保存节点）
			input("ab\n");
			input("abc\n");
			input("abcd\n");
			expect(editor.getValue()).toBe("abcd\n");
			// 防抖窗口内直接撤销：待存输入不落栈（中间态不占步数），一步回到输入前
			ta.dispatchEvent(
				new KeyboardEvent("keydown", { key: "z", ctrlKey: true, cancelable: true }),
			);
			expect(editor.getValue()).toBe("a\n");
			// 防抖定时器已被 cancel，不会延迟压栈污染后续状态
			vi.advanceTimersByTime(2000);
			expect(editor.getValue()).toBe("a\n");
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("5 步上限：超过后挤掉最旧记忆，但仍可退回初始值", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			const editor = createPdEditor(el, { value: "0\n" });
			const ta = editor.textarea;
			const input = (v: string) => {
				ta.value = v;
				ta.setSelectionRange(v.length, v.length);
				ta.dispatchEvent(new Event("input", { bubbles: true }));
				vi.advanceTimersByTime(1000);
			};
			// 6 次落栈输入：栈上限 = 初始 + 5 步，最早一步（"1\n"）被挤掉
			for (const v of ["1\n", "2\n", "3\n", "4\n", "5\n", "6\n"]) input(v);
			expect(editor.getValue()).toBe("6\n");
			const ctrlz = () =>
				ta.dispatchEvent(
					new KeyboardEvent("keydown", {
						key: "z",
						ctrlKey: true,
						cancelable: true,
					}),
				);
			ctrlz();
			expect(editor.getValue()).toBe("5\n");
			ctrlz();
			expect(editor.getValue()).toBe("4\n");
			ctrlz();
			expect(editor.getValue()).toBe("3\n");
			ctrlz();
			expect(editor.getValue()).toBe("2\n");
			// 第 5 步：退到初始值（"1\n" 被挤掉，但初始恒在）
			ctrlz();
			expect(editor.getValue()).toBe("0\n");
			// 超出记忆步数：无操作
			ctrlz();
			expect(editor.getValue()).toBe("0\n");
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("重做不被误认作输入（不新增历史节点），新输入使重做失效", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			const editor = createPdEditor(el, { value: "a\n" });
			const ta = editor.textarea;
			const input = (v: string) => {
				ta.value = v;
				ta.setSelectionRange(v.length, v.length);
				ta.dispatchEvent(new Event("input", { bubbles: true }));
				vi.advanceTimersByTime(1000);
			};
			const ctrl = (key: string, shift = false) =>
				ta.dispatchEvent(
					new KeyboardEvent("keydown", {
						key,
						ctrlKey: true,
						shiftKey: shift,
						cancelable: true,
					}),
				);
			input("ab\n");
			input("abc\n");
			// 撤销两次到初始，重做两次回最新：若重做被误认作输入，栈会多出冗余节点，
			// 下面的撤销链就会错位
			ctrl("z");
			ctrl("z");
			ctrl("z"); // 撤到底：无操作
			expect(editor.getValue()).toBe("a\n");
			ctrl("z", true);
			expect(editor.getValue()).toBe("ab\n");
			ctrl("y");
			expect(editor.getValue()).toBe("abc\n");
			ctrl("y"); // 重做到底：无操作（重做未污染撤销栈）
			expect(editor.getValue()).toBe("abc\n");
			// 撤销一次后新输入：重做失效
			ctrl("z");
			expect(editor.getValue()).toBe("ab\n");
			ta.value = "abx\n";
			ta.setSelectionRange(4, 4);
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			vi.advanceTimersByTime(1000);
			ctrl("y"); // 重做栈已清空：无操作
			expect(editor.getValue()).toBe("abx\n");
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("低 UI / 可嵌入契约", () => {
	it("setValue 重置历史：程序化回填后撤销不跳回旧输入", () => {
		vi.useFakeTimers();
		try {
			const el = document.createElement("div");
			document.body.appendChild(el);
			const editor = createPdEditor(el, { value: "hello" });
			const ta = editor.textarea;
			ta.value = "helloabc";
			ta.dispatchEvent(new Event("input", { bubbles: true }));
			vi.advanceTimersByTime(1000);
			editor.setValue("PROGRAMMATIC");
			const event = new KeyboardEvent("keydown", {
				key: "z",
				ctrlKey: true,
				cancelable: true,
			});
			ta.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			expect(editor.getValue()).toBe("PROGRAMMATIC");
			editor.destroy();
		} finally {
			vi.useRealTimers();
		}
	});

	it("撤销栈为空也吃掉 Ctrl+Z（不落到浏览器原生撤销）", () => {
		const { editor } = mount("hello");
		const event = new KeyboardEvent("keydown", {
			key: "z",
			ctrlKey: true,
			cancelable: true,
		});
		editor.textarea.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(editor.getValue()).toBe("hello");
		editor.destroy();
	});

	it("CRLF 归一化：getValue 与 textarea.value 一致", () => {
		const { editor } = mount("");
		editor.setValue("a: 1\r\nb: 2");
		expect(editor.getValue()).toBe("a: 1\nb: 2");
		expect(editor.textarea.value).toBe("a: 1\nb: 2");
		editor.destroy();
	});

	it("placeholder 覆盖层 + aria-placeholder；有值时隐藏", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "",
			placeholder: "请输入提示词",
		});
		const ph = el.querySelector<HTMLElement>(".pd-placeholder")!;
		expect(ph.textContent).toBe("请输入提示词");
		expect(ph.style.display).toBe("block");
		expect(editor.textarea.getAttribute("aria-placeholder")).toBe("请输入提示词");
		editor.setValue("x");
		expect(ph.style.display).toBe("none");
		editor.destroy();
	});

	it("覆盖层/占位符 aria-hidden（读屏只读到 textarea）", () => {
		const { el, editor } = mount("a: 1");
		expect(el.querySelector("pre")!.getAttribute("aria-hidden")).toBe("true");
		expect(
			el.querySelector(".pd-placeholder")!.getAttribute("aria-hidden"),
		).toBe("true");
		editor.destroy();
	});

	it("readOnly / disabled / maxLength / spellcheck 选项", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "123456",
			readOnly: true,
			maxLength: 4,
			spellcheck: true,
		});
		expect(editor.textarea.readOnly).toBe(true);
		expect(editor.textarea.getAttribute("aria-readonly")).toBe("true");
		expect(editor.textarea.maxLength).toBe(4);
		expect(editor.textarea.spellcheck).toBe(true);
		editor.setValue("123456");
		expect(editor.getValue()).toBe("1234");
		editor.destroy();
	});

	it("insertText / getSelection / setSelection", () => {
		let last = "";
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "hello",
			onValueChange: (v) => {
				last = v;
			},
		});
		editor.setSelection(0, 0);
		editor.insertText("X");
		expect(editor.getValue()).toBe("Xhello");
		expect(editor.getSelection()).toEqual({ start: 1, end: 1 });
		expect(last).toBe("Xhello");
		editor.setSelection(999, 999);
		expect(editor.getSelection()).toEqual({ start: 6, end: 6 });
		editor.destroy();
	});

	it("Tab 行为可配：indent 吃掉 Tab；focus 交给浏览器", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const indent = createPdEditor(el, { value: "a", tabBehavior: "indent" });
		indent.setSelection(0, 0);
		const tab1 = new KeyboardEvent("keydown", {
			key: "Tab",
			cancelable: true,
		});
		indent.textarea.dispatchEvent(tab1);
		expect(tab1.defaultPrevented).toBe(true);
		expect(indent.getValue()).toBe("  a");
		indent.destroy();

		const el2 = document.createElement("div");
		document.body.appendChild(el2);
		const focus = createPdEditor(el2, { value: "a", tabBehavior: "focus" });
		const tab2 = new KeyboardEvent("keydown", {
			key: "Tab",
			cancelable: true,
		});
		focus.textarea.dispatchEvent(tab2);
		expect(tab2.defaultPrevented).toBe(false);
		expect(focus.getValue()).toBe("a");
		focus.destroy();
	});

	it("highlightThreshold：超阈值降级纯文本（仍与原文一致）", () => {
		const el = document.createElement("div");
		document.body.appendChild(el);
		const editor = createPdEditor(el, {
			value: "任务: x",
			highlightThreshold: 1,
		});
		const pre = el.querySelector("pre")!;
		expect(pre.textContent).toBe("任务: x");
		expect(pre.innerHTML).not.toContain("pd-key");
		editor.destroy();
	});

	it("运行时 update：行号层开关 + 语言切换", () => {
		const { el, editor } = mount("a: 1\nb: 2", "pd");
		editor.update({ lineNumbers: true });
		expect(el.querySelector(".pd-lines")).not.toBeNull();
		expect(el.querySelectorAll(".pd-ln").length).toBe(2);
		editor.update({ lineNumbers: false });
		expect(el.querySelector(".pd-lines")).toBeNull();
		editor.update({ language: "json" });
		editor.setValue('{"a": 1}');
		expect(el.querySelector("pre")!.innerHTML).not.toContain("pd-key");
		editor.destroy();
	});

	it("destroy 只移除引擎根节点，不动挂载点的其它子节点", () => {
		const el = document.createElement("div");
		const keep = document.createElement("span");
		keep.textContent = "keep";
		el.appendChild(keep);
		document.body.appendChild(el);
		const editor = createPdEditor(el, { value: "a: 1" });
		editor.destroy();
		expect(el.contains(keep)).toBe(true);
		expect(el.querySelector(".pd-root")).toBeNull();
	});
});
