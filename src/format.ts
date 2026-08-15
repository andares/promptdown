import { hasLiteralColon, lex, lexLine, splitInlineCode } from "./parser/lexer";
import { parse } from "./parser/parser";
import { hasSectionMarkers } from "./parser/expand";

/**
 * 格式化阶段的首个键值冒号判定（宽松版：全角/无空格写法都规范化为 `: `）：
 * - 整行含 `:-` / `：-`（行内代码段外）→ 无键值
 * - 首个冒号（行内代码段外）是全角 `：` → 不论两侧空格，均作为键值分隔符
 * - 首个冒号是半角 `:` → 原本合法，或左右都无空格时作为键值分隔符
 */
function matchKeyValueFlex(
	s: string,
): { key: string; value: string | undefined } | null {
	if (hasLiteralColon(s)) return null;
	// 行内代码段内的冒号不参与键值判定
	let separator = -1;
	let pos = 0;
	for (const { code, seg } of splitInlineCode(s)) {
		if (!code) {
			const idx = seg.search(/[：:]/);
			if (idx !== -1) {
				separator = pos + idx;
				break;
			}
		}
		pos += seg.length;
	}
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

/**
 * 后续全角冒号：左侧是空格才转半角；半角冒号与 `：-` 一律保持。
 * 行内代码段整体原样（不识别内部任何字符）。
 */
function normalizeLaterColons(s: string, startsAfterSpace = false): string {
	let out = "";
	let leftHasSpace = startsAfterSpace;
	for (const { code, seg } of splitInlineCode(s)) {
		if (code) {
			out += seg; // 行内代码整体字串，内部完全不动
			leftHasSpace = /\s$/.test(seg);
			continue;
		}
		for (let i = 0; i < seg.length; i++) {
			const char = seg[i] as string;
			if (char === "：" && seg[i + 1] !== "-" && leftHasSpace) out += ":";
			else out += char;
			leftHasSpace = /\s/.test(char);
		}
	}
	return out;
}

/** 行尾空白清理：空白段起点若落在行内代码段内 → 保留（代码内容原样） */
function trimTrailingWs(raw: string): string {
	const m = /[ \t]+$/.exec(raw);
	if (!m) return raw;
	const start = m.index;
	let pos = 0;
	for (const { code, seg } of splitInlineCode(raw)) {
		const end = pos + seg.length;
		if (code && start >= pos && start < end) return raw;
		if (end > start) break;
		pos = end;
	}
	return raw.slice(0, start);
}

/** 单行格式化 */
function formatLine(raw: string): string {
	const line = trimTrailingWs(raw);
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
			kv.value === undefined
				? `${kv.key}:`
				: `${kv.key}: ${normalizeLaterColons(kv.value, true)}`;
	} else {
		rest = normalizeLaterColons(rest);
	}
	return `${" ".repeat(indent)}${prefix}${rest}`;
}

/** 行分类（空行规则分组用）：key / 内容（含围栏）/ 分隔线 / 段标记 / 空行 */
function classifyTop(raw: string): "key" | "content" | "sep" | "blank" {
	const trimmed = raw.trim();
	if (trimmed === "") return "blank";
	if (trimmed === "---" || trimmed.startsWith("//!pd")) return "sep";
	if (trimmed.startsWith("```")) return "content";
	return lexLine(raw, 0).kind === "key" ? "key" : "content";
}

/**
 * 空行规则（换行格式化）：顶层**带子域键值**（`key:` 行 + 有子内容）后跟下一个
 * 顶层条目（键块/文本块/代码块/分隔线/段标记）时，中间空一行；默认无空行。
 * 文本块（Subject）不触发；幂等（已有空行不重复插入）。
 * 输入必须是单段文本（无 //!pd 标记行；多段由 applyBlankLinesMulti 逐段调用）。
 */
function applyBlankLines(text: string): string {
	const lines = text.split("\n");
	const out: string[] = [];
	let curKind: "key" | "text" | null = null; // 当前顶层条目
	let curStructured = false; // key 条目是否带子域
	let inFence = false;
	for (const raw of lines) {
		const trimmed = raw.trim();
		if (inFence) {
			// 围栏内：一律归当前条目（围栏内的键形行如 `a: b` 不是新条目）
			if (trimmed.startsWith("```")) inFence = false;
			if (curKind === null) curKind = "text";
			if (curKind === "key") curStructured = true;
			out.push(raw);
			continue;
		}
		const c = classifyTop(raw);
		if (c === "blank") {
			out.push(raw);
			continue;
		}
		if (c === "sep") {
			// 前条目结束：带子域键块 → 当前行前插空行（输出末尾非空行才插，幂等）
			if (curKind === "key" && curStructured && out[out.length - 1] !== "") {
				out.push("");
			}
			curKind = null;
			curStructured = false;
			out.push(raw);
			continue;
		}
		if (c === "key") {
			if (curKind === "key" && curStructured && out[out.length - 1] !== "") {
				out.push("");
			}
			curKind = "key";
			curStructured = false;
			out.push(raw);
			continue;
		}
		// content / fence：归当前条目（键块带子域；无条目则开文本块）
		if (curKind === null) curKind = "text";
		if (curKind === "key") curStructured = true;
		out.push(raw);
		if (trimmed.startsWith("```")) inFence = true;
	}
	return out.join("\n");
}

/** 按段切分（保留 //!pd 标记行；围栏内的 //!pd 不切段），逐段应用空行规则 */
function applyBlankLinesMulti(text: string): string {
	if (!hasSectionMarkers(text)) return applyBlankLines(text);
	const parts: string[] = [];
	let cur: string[] = [];
	let inFence = false;
	for (const raw of text.split("\n")) {
		const trimmed = raw.trim();
		if (!inFence && /^\/\/!pd(?:\s+([^\s]+))?$/.test(trimmed)) {
			if (cur.length) parts.push(cur.join("\n"));
			cur = [raw];
		} else {
			cur.push(raw);
		}
		if (trimmed.startsWith("```")) inFence = !inFence;
	}
	if (cur.length) parts.push(cur.join("\n"));
	return parts.map((p) => applyBlankLines(p)).join("\n");
}

/**
 * 格式化 pd 文本：
 * 1. `:-` / `：-` 所在行不识别键值（行内代码段内不参与）
 * 2. 首个全角冒号，或两侧均无空格的首个半角冒号 → `: `
 * 3. 后续全角冒号仅在左侧有空格时转半角；后续半角冒号不处理
 * 4. 顶层 `- ` 缩进自动修正（去缩进；编译工具报错的同一规则）
 * 5. 行尾空白清理（行内代码段内不动）
 * 6. ``` 围栏内行原样保留；` 行内代码整体字串（内部不做任何处理）
 * 7. 空行规则：顶层带子域键值后跟下一个顶层条目时中间空一行（多段按段应用）
 */
export function format(text: string): string {
	const rawLines = text.split(/\r?\n/);
	let inFence = false;
	let out = rawLines.map((l) => {
		const trimmed = l.trimStart();
		if (inFence) {
			if (trimmed.startsWith("```")) inFence = false;
			return l; // 围栏内原样
		}
		if (trimmed.startsWith("```")) {
			inFence = true;
			return l.replace(/[ \t]+$/, ""); // 围栏行本身清行尾
		}
		return formatLine(l);
	});

	// 顶层 `- ` 缩进修正：反复解析直到无该错误（上限 5 轮）
	for (let round = 0; round < 5; round++) {
		const doc = parse(lex(out.join("\n")));
		const topIndent = doc.errors.filter((e) => e.message.includes("顶层"));
		if (topIndent.length === 0) break;
		const fixLines = new Set(topIndent.map((e) => e.lineNo));
		out = out.map((l, idx) => (fixLines.has(idx + 1) ? l.trimStart() : l));
	}
	return applyBlankLinesMulti(out.join("\n"));
}
