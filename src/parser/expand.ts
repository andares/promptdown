import { lexLine } from "./lexer";
import type { PLine } from "./types";

export interface Section {
	name: string;
	lines: string[];
}

interface RefToken {
	name: string;
	start: number; // body 中 `:` 的字符偏移
	end: number; // body 中引用名结束偏移
}

// `:-` / `：-` 是普通冒号标记，因此引用名不能以 `-` 开头。
// 引用名 = 冒号后紧贴的非空白字符序列（UTF-8，天然支持中文），到下一个空白结束。
const REF_RE = /(?:^|\s):([^\s-][^\s]*)(?=\s|$)/g;
const MAX_DEPTH = 32;

/**
 * 切段：`//!pd <name>` 开始新段。
 * - 无任何段标记 → 整文件为隐式段（name = ""）
 * - 有段标记 → 标记前的行是混输的提示词（preamble，丢弃）
 */
export function splitSections(text: string): Section[] {
	const sections: Section[] = [];
	const pending: string[] = [];
	let sawSection = false;
	let cur: Section | null = null;

	for (const raw of text.split(/\r?\n/)) {
		const m = raw.trim().match(/^\/\/!pd(?:\s+([^\s]+))?$/);
		if (m) {
			sawSection = true;
			cur = { name: m[1] ?? "", lines: [] };
			sections.push(cur);
		} else if (!sawSection) {
			pending.push(raw);
		} else if (cur) {
			cur.lines.push(raw);
		}
	}

	if (!sawSection) {
		return [{ name: "", lines: pending }];
	}
	return sections;
}

function selectSection(sections: Section[], target?: string | number): Section {
	if (typeof target === "number") {
		// 1-based 序号（未命名段同名，只能按序号区分）
		const s = sections[target - 1];
		if (!s)
			throw new Error(`段不存在: 第 ${target} 块（文件共 ${sections.length} 段）`);
		return s;
	}
	if (target !== undefined) {
		const s = sections.find((x) => x.name === target);
		if (!s) throw new Error(`段不存在: ${target}`);
		return s;
	}
	if (sections.length === 1) return sections[0] as Section;
	const names = sections.map((s) => s.name).join(", ");
	throw new Error(
		`文件包含 ${sections.length} 个 pd 段（${names}），必须指定段名`,
	);
}

function findRefs(text: string): RefToken[] {
	const refs: RefToken[] = [];
	REF_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = REF_RE.exec(text)) !== null) {
		const lead = /^\s/.test(m[0] as string) ? 1 : 0; // 前导空格偏移
		refs.push({
			name: m[1] as string,
			start: m.index + lead,
			end: m.index + (m[0] as string).length,
		});
	}
	return refs;
}

/** 递归展开段内引用，返回行流 */
function expandSection(
	section: Section,
	byName: Map<string, Section>,
	depth: number,
	path: string[],
): string[] {
	if (depth > MAX_DEPTH) throw new Error(`引用嵌套过深（>${MAX_DEPTH}）`);
	const out: string[] = [];
	for (const raw of section.lines) {
		const line = lexLine(raw, 0);
		if (line.kind === "blank" || line.kind === "section") {
			out.push(raw);
			continue;
		}
		if (findRefs(line.text).length === 0) {
			out.push(raw);
			continue;
		}
		out.push(...expandRefLine(line, byName, depth, path));
	}
	return out;
}

/** 展开含引用的行（内联嵌入 或 断开转 `- ` 项 + 块嵌入） */
function expandRefLine(
	line: PLine,
	byName: Map<string, Section>,
	depth: number,
	path: string[],
): string[] {
	// key 行只对 value 部分处理引用（键名已单独保留）；内容行处理整行
	const isKey = line.kind === "key" || line.kind === "item-key";
	const prefix = isKey
		? `${line.kind === "item-key" ? "- " : ""}${line.key as string}:`
		: "";
	const body = isKey ? (line.value ?? "") : line.text;
	const refs = findRefs(body);

	// 预展开每个引用段（校验存在 + 循环引用）
	const expanded: { lines: string[] }[] = refs.map((r) => {
		const t = byName.get(r.name);
		if (!t) throw new Error(`第${line.lineNo}行: 引用段不存在: ${r.name}`);
		if (path.includes(r.name))
			throw new Error(`循环引用: ${[...path, r.name].join(" -> ")}`);
		return { lines: expandSection(t, byName, depth + 1, [...path, r.name]) };
	});

	// 全部为单行纯文字 → 内联嵌入（保留前后空格）
	const allPure = expanded.every(({ lines }) => {
		const trimmed = lines.map((l) => l.trim()).filter(Boolean);
		return (
			trimmed.length === 1 && lexLine(trimmed[0] as string, 0).kind === "text"
		);
	});
	if (allPure) {
		let result = body;
		refs.forEach((r, i) => {
			const content = (expanded[i] as { lines: string[] }).lines
				.map((l) => l.trim())
				.filter(Boolean)
				.join(" ");
			result = result.slice(0, r.start) + content + result.slice(r.end);
		});
		const full = prefix ? `${prefix} ${result}` : result;
		return [`${" ".repeat(line.indent)}${full}`];
	}

	// 独立展开：键保留（key: / - key:），文本段断开转 `- ` 项，引用段块嵌入
	const out: string[] = [];
	const base = line.indent;
	if (isKey) out.push(`${" ".repeat(base)}${prefix}`);
	let pos = 0;
	refs.forEach((r, i) => {
		const before = body.slice(pos, r.start).trim();
		if (before) out.push(`${" ".repeat(base)}- ${before}`);
		for (const rl of (expanded[i] as { lines: string[] }).lines) {
			const rlTrim = rl.trim();
			if (rlTrim === "") continue;
			const rlIndent = rl.length - rl.trimStart().length;
			if (rlIndent === 0 && !rlTrim.startsWith("-")) {
				out.push(`${" ".repeat(base)}- ${rlTrim}`);
			} else {
				out.push(`${" ".repeat(base + 2 + rlIndent)}${rlTrim}`);
			}
		}
		pos = r.end;
	});
	const after = body.slice(pos).trim();
	if (after) out.push(`${" ".repeat(base)}- ${after}`);
	return out;
}

/**
 * 选段 + 引用展开，返回展开后的 pd 文本（供 lexer/parser 使用）。
 * @param text 源文本（可含多段/混输前缀）
 * @param target 目标段：段名，或 1-based 序号（未命名段只能按序号选）；多段时必须指定
 */
export function expand(text: string, target?: string | number): string {
	const sections = splitSections(text);
	const byName = new Map(sections.map((s) => [s.name, s]));
	const section = selectSection(sections, target);
	return expandSection(section, byName, 0, []).join("\n");
}
