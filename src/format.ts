import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";

/**
 * 键值识别（仅用于格式化）：
 * - 半角冒号：与 lexer 语义一致，键名可含空格（`name1 : some` 也是键值）
 * - 全角冒号：键名紧贴冒号（`name1：some`）；`no ：a1`（空格+引用形态）不是键值
 */
function matchKeyValueFlex(
	s: string,
): { key: string; value: string | undefined } | null {
	const mHalf = s.match(/^([^\s:][^:]*):(?:\s*(.*))?$/);
	if (mHalf) {
		return {
			key: (mHalf[1] as string).trim(),
			value: mHalf[2] !== undefined ? (mHalf[2] as string).trim() : undefined,
		};
	}
	const mFull = s.match(/^([^\s：:]+)：(?:\s*(.*))?$/);
	if (mFull) {
		return {
			key: mFull[1] as string,
			value: mFull[2] !== undefined ? (mFull[2] as string).trim() : undefined,
		};
	}
	return null;
}

/** 引用规范化：全角冒号 → 半角；前后空格各压成恰好一个（行首/行尾边界除外） */
function normalizeRefs(s: string): string {
	return s
		.replace(
			/(?:^|(\s+))([：:])([A-Za-z0-9_-]+)(?=$|\s)/g,
			(_m, sp: string | undefined, _c: string, name: string) =>
				`${sp ? " " : ""}:${name}`,
		)
		.replace(/(:[A-Za-z0-9_-]+) {2,}(?=\S)/g, "$1 ");
}

/** 单行格式化 */
function formatLine(raw: string): string {
	const line = raw.replace(/[ \t]+$/, ""); // 行尾空白
	const indent = line.length - line.trimStart().length;
	const body = line.trimStart();
	if (
		body === "" ||
		body === "---" ||
		body.startsWith("//!pd") ||
		body.startsWith("//")
	) {
		return line;
	}

	let prefix = "";
	let rest = body;
	if (rest === "-" || rest.startsWith("- ")) {
		prefix = "- ";
		rest = rest.slice(1).trimStart();
	}

	const kv = matchKeyValueFlex(rest);
	if (kv) {
		// 键值规范化：key: value（冒号后恰好一个空格；无值则裸冒号）
		rest =
			kv.value !== undefined
				? `${kv.key}: ${normalizeRefs(kv.value)}`
				: `${kv.key}:`;
	} else {
		rest = normalizeRefs(rest);
	}
	return `${" ".repeat(indent)}${prefix}${rest}`;
}

/**
 * 格式化 pd 文本：
 * 1. 全角冒号 `：` → 半角 `:`（键值/引用位置）
 * 2. 键值冒号后恰好一个空格（`key: value`）
 * 3. 引用 ` :refname ` 前后各一个空格（行首/行尾边界除外）
 * 4. 顶层 `- ` 缩进自动修正（去缩进；编译工具报错的同一规则）
 * 5. 行尾空白清理
 */
export function format(text: string): string {
	let out = text.split(/\r?\n/).map(formatLine);

	// 顶层 `- ` 缩进修正：反复解析直到无该错误（上限 5 轮）
	for (let round = 0; round < 5; round++) {
		const doc = parse(lex(out.join("\n")));
		const topIndent = doc.errors.filter((e) => e.message.includes("顶层"));
		if (topIndent.length === 0) break;
		const fixLines = new Set(topIndent.map((e) => e.lineNo));
		out = out.map((l, idx) => (fixLines.has(idx + 1) ? l.trimStart() : l));
	}
	return out.join("\n");
}
