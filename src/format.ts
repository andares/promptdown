import { hasLiteralColon, lex } from "./parser/lexer";
import { parse } from "./parser/parser";

/**
 * 格式化阶段的首个键值冒号判定：
 * - 整行含 `:-` / `：-` → 无键值
 * - 首个冒号是全角 `：` → 不论两侧空格，均作为键值分隔符
 * - 首个冒号是半角 `:` → 原本合法，或左右都无空格时作为键值分隔符
 */
function matchKeyValueFlex(
	s: string,
): { key: string; value: string | undefined } | null {
	if (hasLiteralColon(s)) return null;
	const separator = s.search(/[：:]/);
	if (separator <= 0) return null;

	const keySource = s.slice(0, separator);
	const marker = s[separator];
	const valueSource = s.slice(separator + 1);
	if (keySource.trim() === "") return null;

	if (marker === ":") {
		const leftHasSpace = /\s$/.test(keySource);
		const rightHasSpace = /^\s/.test(valueSource);
		if (valueSource !== "" && leftHasSpace && !rightHasSpace) return null;
	}

	const value = valueSource.trim();
	return { key: keySource.trim(), value: value === "" ? undefined : value };
}

/** 后续全角冒号：左侧是空格才转半角；半角冒号与 `：-` 一律保持。 */
function normalizeLaterColons(s: string, startsAfterSpace = false): string {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const char = s[i] as string;
		const leftHasSpace = i === 0 ? startsAfterSpace : /\s/.test(s[i - 1] as string);
		if (char === "：" && s[i + 1] !== "-" && leftHasSpace) out += ":";
		else out += char;
	}
	return out;
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
		// 首个分隔符统一为 `: `；后续只按左侧空格规则处理全角冒号。
		rest =
			kv.value !== undefined
				? `${kv.key}: ${normalizeLaterColons(kv.value, true)}`
				: `${kv.key}:`;
	} else {
		rest = normalizeLaterColons(rest);
	}
	return `${" ".repeat(indent)}${prefix}${rest}`;
}

/**
 * 格式化 pd 文本：
 * 1. `:-` / `：-` 所在行不识别键值
 * 2. 首个全角冒号，或两侧均无空格的首个半角冒号 → `: `
 * 3. 后续全角冒号仅在左侧有空格时转半角；后续半角冒号不处理
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
