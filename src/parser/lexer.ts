import type { LineKind, PLine } from "./types";

/**
 * 键值判定：冒号前无空格（区分引用 ` :name `），冒号后为行尾或空格+内容。
 * `name1:` / `name1: some` / `kill: me` → 键值；`no man` / `a:b` → null
 */
export function matchKeyValue(
	s: string,
): { key: string; value: string | undefined } | null {
	const m = s.match(/^([^\s:][^:]*):(?:\s+(.*))?$/);
	if (!m) return null;
	return { key: m[1] as string, value: m[2] !== undefined ? m[2] : undefined };
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
