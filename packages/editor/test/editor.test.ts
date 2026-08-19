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

	it("styles 从根节点统一传给 Yace", () => {
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

		expect(el.style.fontSize).toBe("14px");
		expect(el.style.lineHeight).toBe("20px");
		expect(el.style.padding).toBe("12px");
		expect(editor.textarea.style.fontSize).toBe("inherit");
		expect(editor.textarea.style.lineHeight).toBe("inherit");
		expect(editor.textarea.style.padding).toBe("inherit");
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
		// 组合期 input：真实浏览器事件带 isComposing=true（Yace 会跳过，组件监听器接管）
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
