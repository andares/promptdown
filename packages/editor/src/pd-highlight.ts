import {
	hasLiteralColon,
	findKeyValueSeparator,
	matchKeyValue,
	splitInlineCode,
} from "./inline";

/**
 * pd 语法高亮：把 pd 文本转成带 class 的 HTML（Yace highlighter 管线第一级）。
 * 语义与主包 TS 核心 lexer 一致（严格键值/`:-` 转义/行内代码豁免/围栏），
 * 输出 span class 与 TextMate scope 对应（pd-key/pd-item/pd-section/pd-sep/...）。
 *
 * 高亮服务精确：帮助看清结构（键/序列/段/引用/代码），不改变文本本身。
 * 本模块零依赖（自包含 tokenizer），组件不依赖主包。
 */

/** HTML 转义（Yace 管线第一级要求：纯文本 → 转义 HTML） */
function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const CLS = {
	key: "pd-key",
	keyPunct: "pd-key-punct",
	item: "pd-item",
	section: "pd-section",
	sep: "pd-sep",
	ref: "pd-ref",
	inlineCode: "pd-inline-code",
	fence: "pd-fence",
	literal: "pd-literal",
} as const;

/** 行内代码段（反引号配对）整体包 span */
function renderInlineCode(seg: string): string {
	return `<span class="${CLS.inlineCode}">${esc(seg)}</span>`;
}

/** 引用规则与 findRefs 一致（前后空白或行首；行内代码段内不识别） */
const REF_RE = /(?:^|\s):([^\s-][^\s]*)(?=\s|$)/g;

/** 非代码段内容：`:refname` 引用上色 */
function renderRefs(seg: string): string {
	let out = "";
	let last = 0;
	REF_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = REF_RE.exec(seg)) !== null) {
		const lead = /^\s/.test(m[0] as string) ? 1 : 0;
		const colon = m.index + lead;
		out += esc(seg.slice(last, colon));
		out += `<span class="${CLS.ref}">${esc(seg.slice(colon, m.index + m[0].length))}</span>`;
		last = m.index + m[0].length;
	}
	out += esc(seg.slice(last));
	return out;
}

/** 整行内容渲染：拆行内代码段（整体包 span）+ 非代码段引用上色 */
function renderLineContent(text: string): string {
	let out = "";
	for (const { code, seg } of splitInlineCode(text)) {
		out += code ? renderInlineCode(seg) : renderRefs(seg);
	}
	return out;
}

/** 键值行渲染（保留原始空白，保证与 textarea 逐字符对齐） */
function renderKeyLine(
	indent: string, // 已转义的行首缩进
	dash: string, // 已转义的 `- ` 前缀（item 用）或 ""
	key: string, // 键名（trim 后）
	valueSource: string, // 冒号后的原始内容（含前导/行尾空白，不 trim）
): string {
	const keySpan = `<span class="${CLS.key}">${renderLineContent(key)}</span>`;
	const punct = `<span class="${CLS.keyPunct}">:</span>`;
	return `${indent}${dash}${keySpan}${punct}${renderLineContent(valueSource)}`;
}

/**
 * 行分类 + 高亮。语义与 lexLine 一致：
 * - 段标记（整行锚定）、分隔线（整行 ---）
 * - item：`-` 后跟空白或行尾（`-x` 不是 item）
 * - item-key：item 且内容为键值；裸 key：非 item 的键值
 * - `:-` / `：-`（代码段外）整行转义 → 按内容渲染
 * 所有分支保留原始空白（覆盖层与 textarea 逐字符对齐）。
 */
function highlightLine(raw: string): string {
	const trimmed = raw.trim();
	// 段标记（整行锚定）：//!pd 或 //!pd <name>
	if (/^\/\/!pd(?:\s+[^\s]+)?$/.test(trimmed)) {
		const m = /^(\s*)(\/\/!pd)(\s*.*)$/.exec(raw);
		const lead = m?.[1] ?? "";
		const marker = m?.[2] ?? "//!pd";
		const rest = m?.[3] ?? "";
		return `${esc(lead)}<span class="${CLS.section}">${esc(marker)}</span>${renderLineContent(rest)}`;
	}
	// 分隔线：整行 ---
	if (trimmed === "---") {
		return `<span class="${CLS.sep}">${esc(raw)}</span>`;
	}
	// item 判定：`-` 后跟空白或行尾（与 lexer 一致，`-x` 不是 item）
	const itemM = /^(\s*)(-)(?=\s|$)/.exec(raw);
	if (itemM) {
		const indent = esc(itemM[1] ?? "");
		const dashPos = (itemM[1] ?? "").length + 1; // `-` 之后的位置（含缩进）
		const afterDash = raw.slice(dashPos); // `-` 之后（含其后所有空白，保留原文）
		const body = afterDash.trimStart(); // item 内容（判定用）
		const gap = afterDash.slice(0, afterDash.length - body.length); // `-` 后的原始空白
		const dash = `<span class="${CLS.item}">-</span>`;
		if (!hasLiteralColon(body)) {
			const kv = matchKeyValue(body);
			if (kv) {
				// item-key：- key: value（value 保留原始空白）
				const sep = findKeyValueSeparator(body);
				const key = body.slice(0, sep);
				const valueSource = body.slice(sep + 1);
				return `${indent}${dash}${esc(gap)}${renderKeyLine("", "", key, valueSource)}`;
			}
		}
		// item：- 内容（保留 `-` 后原始空白）
		return `${indent}${dash}${esc(gap)}${renderLineContent(body)}`;
	}
	// 裸 key（非 item）：保留行首缩进与值原始空白
	if (!hasLiteralColon(trimmed)) {
		const kv = matchKeyValue(trimmed);
		if (kv) {
			const indentLen = raw.length - raw.trimStart().length;
			const rest = raw.slice(indentLen); // 去缩进原文（保留行尾空白）
			const sep = findKeyValueSeparator(rest);
			const key = rest.slice(0, sep).trim();
			const valueSource = rest.slice(sep + 1); // 冒号后原文（含空白）
			return renderKeyLine(esc(raw.slice(0, indentLen)), "", key, valueSource);
		}
	}
	// 普通文本 / 空行 / 整行转义
	return renderLineContent(raw);
}

/**
 * pd 文本 → HTML（Yace highlighter）。围栏状态跟踪：围栏内行原样（仅转义）。
 */
export function highlightPd(value: string): string {
	const lines = value.split("\n");
	let inFence = false;
	const out: string[] = [];
	for (const raw of lines) {
		const trimmed = raw.trimStart();
		if (inFence) {
			if (trimmed.startsWith("```")) {
				inFence = false;
				out.push(`<span class="${CLS.fence}">${esc(raw)}</span>`); // 闭合行
			} else {
				out.push(esc(raw)); // 围栏内容原样（仅转义，不标色）
			}
			continue;
		}
		if (trimmed.startsWith("```")) {
			inFence = true;
			out.push(`<span class="${CLS.fence}">${esc(raw)}</span>`); // 开围栏行
			continue;
		}
		out.push(highlightLine(raw));
	}
	return out.join("\n");
}
