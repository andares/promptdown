/**
 * 行内代码（`...`）与 `:-` 整行转义判定的轻量实现。
 * 语义与主包 @andares/promptdown 的 src/parser/lexer.ts 一致，但零依赖（组件自包含）：
 * - 反引号配对（markdown 风格整体字串），不支持换行——未闭合按普通字符
 * - 行内代码段内冒号/`:-` 不参与键值/转义判定
 * - `:-` / `：-`（代码段外）使整行不是键值
 */

export interface InlineSeg {
	code: boolean; // true = 行内代码段（整体字串）
	seg: string;
}

/** 按反引号配对切分；未闭合段当普通字符（code:false） */
export function splitInlineCode(text: string): InlineSeg[] {
	const parts: InlineSeg[] = [];
	let cur = "";
	let inCode = false;
	for (const ch of text) {
		if (ch === "`") {
			if (inCode) {
				parts.push({ code: true, seg: cur + "`" });
				cur = "";
				inCode = false;
			} else {
				if (cur) parts.push({ code: false, seg: cur });
				cur = "`";
				inCode = true;
			}
		} else {
			cur += ch;
		}
	}
	if (cur) parts.push({ code: false, seg: cur }); // 未闭合 → 普通字符
	return parts;
}

/** 整行是否含 `:-` / `：-`（行内代码段外）→ 整行不是键值 */
export function hasLiteralColon(s: string): boolean {
	for (const { code, seg } of splitInlineCode(s)) {
		if (code) continue;
		if (seg.includes(":-") || seg.includes("：-")) return true;
	}
	return false;
}

/**
 * 代码段外第一个半角冒号的位置（-1 = 无）。
 * 供高亮层定位原始文本中的冒号位置（精确 slice，保证覆盖层对齐）。
 */
export function findKeyValueSeparator(s: string): number {
	let pos = 0;
	for (const { code, seg } of splitInlineCode(s)) {
		if (!code) {
			const idx = seg.indexOf(":");
			if (idx !== -1) return pos + idx;
		}
		pos += seg.length;
	}
	return -1;
}

/** 严格键值判定（与 lexer 一致）：键名不以空白结尾、冒号后跟空白或行尾、只认第一个半角冒号 */
export function matchKeyValue(
	s: string,
): { key: string; value: string | undefined } | null {
	if (hasLiteralColon(s)) return null;
	const separator = findKeyValueSeparator(s);
	if (separator <= 0) return null;
	const key = s.slice(0, separator);
	const valueSource = s.slice(separator + 1);
	// 键名不以空白结尾（`a : b` 不是键值）；冒号后为行尾或空白+内容（`a:b` 不是键值）
	if (/\s$/.test(key)) return null;
	if (valueSource !== "" && !/^\s/.test(valueSource)) return null;
	const value = valueSource.trim();
	return { key: key.trim(), value: value === "" ? undefined : value };
}
