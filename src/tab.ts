/**
 * Tab 键行为的纯逻辑（不依赖 vscode API，可单测）。
 *
 * 规则：当前行行首是 `- `（可选缩进 + 序列标记，pd 的序列项行）时，
 * 按 Tab 应把整行向右缩进一个 tab —— 快速调整 `- ` 嵌套层级（pd 的缩进即父子关系），
 * 而不是在光标处插入 tab 字符。
 */

/** 序列项行：行首（允许空白）+ `- `（破折号后必须跟空白，防 `-foo` 误判） */
const LIST_ITEM_RE = /^[\s]*-\s/;

/** 一行是否为序列项行（`- ` 开头） */
export function isListItemLine(line: string): boolean {
	return LIST_ITEM_RE.test(line);
}

/** 默认 Tab 行为的插入单位：insertSpaces 时 size 个空格，否则制表符 */
export function tabUnit(insertSpaces: boolean, size: number): string {
	return insertSpaces ? " ".repeat(size) : "\t";
}
