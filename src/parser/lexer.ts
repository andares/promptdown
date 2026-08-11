import type { LineKind, PLine } from "./types";

/**
 * `:-` / `：-` 是整行键值转义：只要出现，整行都不含键值。
 * 否则仅行内第一个半角冒号可作分隔符；其右侧不再识别键值。
 * 冒号后为行尾或空格+内容；无空格写法可先由 formatter 修正。
 */
export function hasLiteralColon(s: string): boolean {
	return s.includes(":-") || s.includes("：-");
}

export function matchKeyValue(
	s: string,
): { key: string; value: string | undefined } | null {
	if (hasLiteralColon(s)) return null;
	const separator = s.indexOf(":");
	if (separator === -1) return null;

	const key = s.slice(0, separator);
	const value = s.slice(separator + 1);
	if (!/^[^\s:][^:]*$/.test(key)) return null;
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

export type { LineKind };
