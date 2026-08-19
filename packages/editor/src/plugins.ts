import type { Plugin } from "yace";

/**
 * pd 语义编辑插件（Yace 插件接口，keydown 时返回新的 props）。
 * 与主包 VSCode 扩展的编辑行为对齐：续行补 `- `、序列项行 Tab 整行缩进/Shift+Tab 缩出。
 *
 * 注意：Yace 插件管线是 reduce（所有插件依次执行、后者覆盖前者），
 * 同一按键只应由一个插件处理——enter 全部由 pdListItem 处理（含非序列行缩进保留），
 * 不要再叠加 Yace 的 preserveIndent。
 */

function isKey(event: Event, combo: string): boolean {
	const e = event as KeyboardEvent;
	const key = e.key.toLowerCase();
	const parts = combo.split("+");
	const mods = parts.slice(0, -1);
	const k = parts[parts.length - 1];
	if (key !== k) return false;
	if (mods.includes("shift") !== e.shiftKey) return false;
	if (mods.includes("ctrl") !== e.ctrlKey) return false;
	if (mods.includes("alt") !== e.altKey) return false;
	if (mods.includes("meta") !== e.metaKey) return false;
	return true;
}

/** 光标绝对位置 → 行号 + 行内列 */
function lineCol(value: string, pos: number): { line: number; col: number } {
	const before = value.slice(0, pos);
	const lines = before.split("\n");
	return { line: lines.length - 1, col: lines[lines.length - 1]?.length ?? 0 };
}

/** 行号 + 行内列 → 绝对位置（按给定行数组） */
function posFromLineCol(lines: string[], line: number, col: number): number {
	let pos = 0;
	for (let i = 0; i < line; i++) pos += (lines[i]?.length ?? 0) + 1;
	return pos + col;
}

/**
 * 回车续行：
 * - 序列项行（`- ` 或 `-`，允许缩进）→ 新行 = 缩进 + `- `（自动续列表）
 * - 其他行 → 新行保留行首缩进（Yace preserveIndent 行为，合并于此避免插件管线双重处理）
 * `-x` / `---`（`-` 后无空白）不是列表项，只保留缩进。
 */
export function pdListItem(): Plugin {
	return (props, event) => {
		if (event.type !== "keydown" || !isKey(event, "enter")) return;
		const { value, selectionStart, selectionEnd } = props;
		const line = value.slice(0, selectionStart).split("\n").pop() ?? "";
		const indent = /^\s*/.exec(line)?.[0] ?? "";
		event.preventDefault();
		const isListItem = /^(\s*)-(?=\s|$)/.test(line);
		const insert = `\n${indent}${isListItem ? "- " : ""}`;
		return {
			value: value.slice(0, selectionStart) + insert + value.slice(selectionEnd),
			selectionStart: selectionStart + insert.length,
			selectionEnd: selectionStart + insert.length,
		};
	};
}

/** 光标所在行是否是序列项行（`- ` 开头或裸 `-`，允许缩进） */
function isListItemLine(line: string): boolean {
	return /^(\s*)-(?=\s|$)/.test(line);
}

/** 该行行首可去掉的缩进长度（indentUnit 或单个 tab；无则 0） */
function dedentLen(line: string, indentUnit: string): number {
	if (line.startsWith(indentUnit)) return indentUnit.length;
	if (line.startsWith("\t")) return 1;
	return 0;
}

/**
 * Tab 键：
 * - 序列项行（`- ` 开头，允许缩进）→ Tab 整行右缩进一个单位；Shift+Tab 整行左缩出一个单位
 * - 多行选区 → 全部行整体操作（空行跳过）
 * - 非序列项行 → 回退默认：插入缩进单位（无选区时）/ 整体加缩进（有选区时）
 * 光标位置用 lineCol 精确重算（退缩进后光标在缩进区内 → 推到行首，否则保持相对位置）。
 */
export function pdTab(indentUnit: string): Plugin {
	return (props, event) => {
		if (event.type !== "keydown") return;
		const { value, selectionStart, selectionEnd } = props;
		const lines = value.split("\n");
		const startLine = value.slice(0, selectionStart).split("\n").length - 1;
		const endLine = value.slice(0, selectionEnd).split("\n").length - 1;
		const selStartLC = lineCol(value, selectionStart);
		const selEndLC = lineCol(value, selectionEnd);

		// Shift+Tab：缩出（光标行或选区全部行行首去一个缩进单位）
		if (isKey(event, "shift+tab")) {
			event.preventDefault();
			const afterLines = lines.map((l, i) =>
				i >= startLine && i <= endLine ? l.slice(dedentLen(l, indentUnit)) : l,
			);
			const after = afterLines.join("\n");
			if (after === value) return;
			// 光标/选区末尾：所在行被去缩进 → 列减去缩进长度（缩进区内 → 0）
			const adjust = (lc: { line: number; col: number }) => {
				const d = dedentLen(lines[lc.line] ?? "", indentUnit);
				return { line: lc.line, col: Math.max(0, lc.col - d) };
			};
			const s = adjust(selStartLC);
			const e2 = adjust(selEndLC);
			return {
				value: after,
				selectionStart: posFromLineCol(afterLines, s.line, s.col),
				selectionEnd: posFromLineCol(afterLines, e2.line, e2.col),
			};
		}

		// Tab
		if (isKey(event, "tab")) {
			event.preventDefault();
			const targetLines = lines
				.map((l, i) => ({ l, i }))
				.filter(({ i }) => i >= startLine && i <= endLine);
			const allListItems =
				targetLines.length > 0 && targetLines.every(({ l }) => isListItemLine(l));
			if (allListItems || selectionStart !== selectionEnd) {
				// 序列项行整行缩进，或任意多行选区整体加缩进（空行跳过）
				const afterLines = lines.map((l, i) =>
					i >= startLine && i <= endLine && l !== "" ? indentUnit + l : l,
				);
				const after = afterLines.join("\n");
				// 光标/选区末尾：被缩进行的行内位置右移缩进长度（内容整体右移，空行不动）
				const shiftCol = (lc: { line: number; col: number }) => {
					const l = lines[lc.line] ?? "";
					const inSel = lc.line >= startLine && lc.line <= endLine;
					return {
						line: lc.line,
						col: inSel && l !== "" ? lc.col + indentUnit.length : lc.col,
					};
				};
				const s = shiftCol(selStartLC);
				const e2 = shiftCol(selEndLC);
				return {
					value: after,
					selectionStart: posFromLineCol(afterLines, s.line, s.col),
					selectionEnd: posFromLineCol(afterLines, e2.line, e2.col),
				};
			}
			// 非序列项行、无选区：插入缩进单位
			const pos = selectionStart + indentUnit.length;
			return {
				value:
					value.slice(0, selectionStart) + indentUnit + value.slice(selectionEnd),
				selectionStart: pos,
				selectionEnd: pos,
			};
		}
	};
}
