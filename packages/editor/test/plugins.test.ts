import { describe, expect, it } from "vitest";
import { pdListItem, pdTab } from "../src/plugins";

/** 构造 keydown 事件 */
function keyEvent(combo: string): KeyboardEvent {
	const parts = combo.split("+");
	const key = parts[parts.length - 1] ?? "";
	return new KeyboardEvent("keydown", {
		key,
		shiftKey: parts.includes("shift"),
		ctrlKey: parts.includes("ctrl"),
		altKey: parts.includes("alt"),
		metaKey: parts.includes("meta"),
		cancelable: true,
	});
}

interface Props {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

function props(value: string, pos: number): Props {
	return { value, selectionStart: pos, selectionEnd: pos };
}

describe("pdListItem（回车续行补 `- `）", () => {
	it("序列项行回车 → 新行继承缩进并补 `- `", () => {
		const plugin = pdListItem();
		const r = plugin(props("- 第一项", 5), keyEvent("enter"));
		const out = r as Props;
		expect(out.value).toBe("- 第一项\n- ");
		expect(out.selectionStart).toBe(8); // \n + "- " = 3 字符
	});

	it("嵌套序列项行回车 → 保留缩进并补 `- `，光标停在新行 `- ` 末尾", () => {
		const plugin = pdListItem();
		const r = plugin(props("  - 子项", 6), keyEvent("enter"));
		const out = r as Props;
		expect(out.value).toBe("  - 子项\n  - ");
		expect(out.selectionStart).toBe(11); // 6 + \n(1) + 缩进(2) + "- "(2)
	});

	it("非序列项行回车 → 保留缩进（preserveIndent 合并行为）", () => {
		const plugin = pdListItem();
		const r = plugin(props("  普通文本", 6), keyEvent("enter"));
		const out = r as Props;
		expect(out.value).toBe("  普通文本\n  ");
		expect(out.selectionStart).toBe(9);
	});

	it("`-x`（无空格）不是列表项 → 只保留缩进（不补 `- `）", () => {
		const plugin = pdListItem();
		const r = plugin(props("-x", 2), keyEvent("enter"));
		const out = r as Props;
		expect(out.value).toBe("-x\n");
		expect(out.selectionStart).toBe(3);
	});
});

describe("pdTab（序列项行 Tab 整行缩进 / Shift+Tab 缩出）", () => {
	it("`- ` 行 Tab → 整行右缩进一个单位", () => {
		const plugin = pdTab("  ");
		const r = plugin(props("- 第一项", 2), keyEvent("tab"));
		const out = r as Props;
		expect(out.value).toBe("  - 第一项");
		expect(out.selectionStart).toBe(4);
	});

	it("缩进行 Shift+Tab → 整行左缩出一个单位，光标跟随", () => {
		const plugin = pdTab("  ");
		const r = plugin(props("  - 第一项", 5), keyEvent("shift+tab"));
		const out = r as Props;
		expect(out.value).toBe("- 第一项");
		expect(out.selectionStart).toBe(3); // 光标相对内容位置保持：5-2=3
	});

	it("光标在缩进区内 Shift+Tab → 推到行首", () => {
		const plugin = pdTab("  ");
		const r = plugin(props("  - 第一项", 1), keyEvent("shift+tab"));
		const out = r as Props;
		expect(out.value).toBe("- 第一项");
		expect(out.selectionStart).toBe(0);
	});

	it("多行选区全部是序列项行 → 整体缩进", () => {
		const plugin = pdTab("  ");
		const value = "- 甲\n- 乙\n";
		const r = plugin(
			{ value, selectionStart: 0, selectionEnd: value.length },
			keyEvent("tab"),
		);
		const out = r as Props;
		expect(out.value).toBe("  - 甲\n  - 乙\n");
	});

	it("非序列项行 Tab → 插入缩进单位（Yace 默认行为）", () => {
		const plugin = pdTab("  ");
		const r = plugin(props("name: value", 5), keyEvent("tab"));
		const out = r as Props;
		expect(out.value).toBe("name:   value"); // 原空格 + 2 缩进 = 3 空格
	});

	it("`-` 后无空格的行（-x）不是列表项 → 插入缩进单位", () => {
		const plugin = pdTab("  ");
		const r = plugin(props("-x", 1), keyEvent("tab"));
		const out = r as Props;
		expect(out.value).toBe("-  x");
	});
});
