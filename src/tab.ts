/**
 * Tab 键行为的纯逻辑（不依赖 vscode API，可单测）。
 *
 * 规则：当前行行首是 `-`（可选缩进 + 序列标记，`-` 后可带可不带空白，如裸 `-`）时，
 * 按 Tab 应把整行向右缩进一个 tab —— 快速调整 `-` 嵌套层级（pd 的缩进即父子关系），
 * 而不是在光标处插入 tab 字符。
 * 缩进的同时把 `-` 后的空白规范化为单个半角空格（裸 `-` → `- `，`-   x` → `- x`）。
 */

/** 序列项行：行首（允许空白）+ `-` + 可选空白（零空白即裸 `-` 也命中） */
const LIST_ITEM_RE = /^[\s]*-\s*/;

/** 一行是否为序列项行（`-` 开头） */
export function isListItemLine(line: string): boolean {
	return LIST_ITEM_RE.test(line);
}

/** 序列项行中 `-` 后空白段的信息（供缩进时精确替换） */
export interface ListItemWsRun {
	/** `-` 所在列 */
	dash: number;
	/** 空白段起点（`-` 后一列） */
	start: number;
	/** 空白段终点（含）；与 start 相等表示无空白（裸 `-`） */
	end: number;
	/** 需要把 [start, end) 替换为单个半角空格 */
	normalize: boolean;
}

/**
 * 解析序列项行的 `-` 后空白段；非序列项行返回 null。
 * normalize=true 的情况：裸 `-`（补空格）、`-` 后空白串不是单个半角空格（`-   x`、`- \t x` 收拢为单空格）。
 * normalize=false 的情况：已是 `- x`，或 `-` 后直接跟非空白内容（`-foo`、`---`）。
 */
export function listItemWsRun(line: string): ListItemWsRun | null {
	const m = /^([\s]*)-([\s]*)(.*)$/.exec(line);
	if (!m) return null;
	const dash = (m[1] ?? "").length;
	const ws = m[2] ?? "";
	const rest = m[3] ?? "";
	const start = dash + 1;
	const end = start + ws.length;
	let normalize: boolean;
	if (ws.length === 1 && ws === " ") {
		normalize = false; // 已是单个半角空格
	} else if (ws.length === 0 && rest !== "") {
		normalize = false; // `-` 后直接跟非空白内容（`-foo`、`---`）
	} else {
		normalize = true; // 裸 `-` 或空白串非单空格
	}
	return { dash, start, end, normalize };
}

/** 默认 Tab 行为的插入单位：insertSpaces 时 size 个空格，否则制表符 */
export function tabUnit(insertSpaces: boolean, size: number): string {
	return insertSpaces ? " ".repeat(size) : "\t";
}
