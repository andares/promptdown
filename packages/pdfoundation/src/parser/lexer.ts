import type { PLine } from "./types";

/**
 * 行内代码切分（markdown 风格整体理解）：`` `...` `` 单 backtick 配对。
 * 返回交替的普通段 / 代码段；**不支持换行**——未闭合 backtick 跨行即失效，
 * 未闭合部分当普通字符（code=false）。lexer/format/expand/jsonToPd 共用。
 */
export function splitInlineCode(
	text: string,
): { code: boolean; seg: string }[] {
	const parts: { code: boolean; seg: string }[] = [];
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
	if (cur) parts.push({ code: false, seg: cur }); // 未闭合 → 普通字符（不支持跨行，行尾即失效）
	return parts;
}

/**
 * `:-` / `：-` 是整行键值转义：只要出现（行内代码段外），整行都不含键值。
 * 否则仅行内第一个半角冒号（代码段外）可作分隔符；其右侧不再识别键值。
 * 严格键值判定（转换非格式化，不兼容不规范写法）：
 * 键名首字符非空白/冒号、不含冒号、不以空白结尾（`a : b` 不是键值）；
 * 冒号后为行尾或空白+内容；`a:b` 无空格写法不是键值（可先由 formatter 修正）。
 */
export function hasLiteralColon(s: string): boolean {
	for (const { code, seg } of splitInlineCode(s)) {
		if (code) continue; // 行内代码内的 :- 不参与整行转义判定
		if (seg.includes(":-") || seg.includes("：-")) return true;
	}
	return false;
}

/** 单行键值判定（lexLine 与 jsonToPd 复用）；行内代码段内的冒号不参与 */
export function matchKeyValue(
	s: string,
): { key: string; value: string | undefined } | null {
	if (hasLiteralColon(s)) return null;
	let separator = -1;
	let pos = 0;
	for (const { code, seg } of splitInlineCode(s)) {
		if (!code) {
			const idx = seg.indexOf(":");
			if (idx !== -1) {
				separator = pos + idx;
				break;
			}
		}
		pos += seg.length;
	}
	if (separator === -1) return null;

	const key = s.slice(0, separator);
	const value = s.slice(separator + 1);
	if (!/^[^\s:][^:]*$/.test(key) || /\s$/.test(key)) return null;
	if (value !== "" && !/^\s+/.test(value)) return null;

	return { key, value: value === "" ? undefined : value.trimStart() };
}

/** 单行分类 */
export function lexLine(raw: string, lineNo: number): PLine {
	const indent = raw.length - raw.trimStart().length;
	const text = raw.trim();
	if (text === "") return { kind: "blank", indent, text, raw, lineNo };
	if (text === "---") return { kind: "separator", indent, text, raw, lineNo };
	if (text.startsWith("//!pd"))
		return { kind: "section", indent, text, raw, lineNo };

	// 带 - 行
	if (text === "-" || text.startsWith("- ")) {
		const rest = text.slice(1).trim();
		if (rest === "") return { kind: "item", indent, text: "", raw, lineNo };
		const kv = matchKeyValue(rest);
		if (kv)
			return {
				kind: "item-key",
				indent,
				text: rest,
				raw,
				lineNo,
				key: kv.key,
				value: kv.value,
			};
		return { kind: "item", indent, text: rest, raw, lineNo };
	}

	// 裸键值
	const kv = matchKeyValue(text);
	if (kv)
		return {
			kind: "key",
			indent,
			text,
			raw,
			lineNo,
			key: kv.key,
			value: kv.value,
		};
	return { kind: "text", indent, text, raw, lineNo };
}

/** 全文分词（行数组） */
export function lex(text: string): PLine[] {
	const lines: PLine[] = [];
	text.split(/\r?\n/).forEach((raw, i) => lines.push(lexLine(raw, i + 1)));
	return lines;
}
