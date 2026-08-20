import { lexLine, splitInlineCode } from "./lexer";
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
const SECTION_RE = /^\/\/!pd(?:\s+([^\s]+))?$/;

/** 命名转义：首字符 % → 加倍（与数字序号 %N 区分；不判断是否已是 %%） */
export function escapeSectionName(name: string): string {
	return name.startsWith("%") ? `%${name}` : name;
}

interface ScanResult {
	sections: Section[];
	sawSection: boolean;
}

/**
 * 切段：`//!pd <name>` 开始新段。
 * - 无任何段标记 → 整文件为隐式段（name = ""）
 * - 有段标记 → 标记前的行是混输的提示词（preamble，丢弃）
 * - ``` 围栏内行一律归当前段（围栏内的 //!pd 不是段标记）；围栏行本身归当前段
 */
function scanSections(text: string): ScanResult {
	const sections: Section[] = [];
	const pending: string[] = [];
	let sawSection = false;
	let cur: Section | null = null;
	let inFence = false;

	for (const raw of text.split(/\r?\n/)) {
		const trimmed = raw.trim();
		const m = inFence ? null : SECTION_RE.exec(trimmed);
		if (m) {
			sawSection = true;
			cur = { name: escapeSectionName(m[1] ?? ""), lines: [] };
			sections.push(cur);
		} else if (!sawSection) {
			pending.push(raw);
		} else if (cur) {
			cur.lines.push(raw);
		}
		if (trimmed.startsWith("```")) inFence = !inFence;
	}

	if (!sawSection) {
		return { sections: [{ name: "", lines: pending }], sawSection: false };
	}
	return { sections, sawSection: true };
}

export function splitSections(text: string): Section[] {
	return scanSections(text).sections;
}

/** 文本是否含 //!pd 段标记（围栏内不算） */
export function hasSectionMarkers(text: string): boolean {
	return scanSections(text).sawSection;
}

/**
 * 段命名（寻址层）：无 //!pd 的隐式段赋文件主名（先转义）。
 * 有段标记的文件的匿名段不赋名（只能 %N 序号访问）。
 */
export function nameSections(
	text: string,
	sections: Section[],
	fileStem: string,
): void {
	if (fileStem === "" || hasSectionMarkers(text)) return;
	const s = sections[0];
	if (s && sections.length === 1 && s.name === "") {
		s.name = escapeSectionName(fileStem);
	}
}

/**
 * 按 selector 找段（寻址与引用共用的唯一解析规则）：
 * - `%N`（% 开头 + 纯数字）→ 全局 1-based 序号（匿名段也可寻址/引用）
 * - 否则字符模式：匹配**存储名**（已转义），返回第一个（同名段先到先得）
 * 找不到返回 undefined（由调用方决定报错文案）。
 */
export function findSection(
	sections: Section[],
	selector: string,
): Section | undefined {
	if (selector.startsWith("%") && /^\d+$/.test(selector.slice(1))) {
		return sections[Number(selector.slice(1)) - 1];
	}
	return sections.find((x) => x.name === selector);
}

/**
 * 段寻址：`%N`（1-based 序号）或字符命名（存储名，已转义）。
 * 匿名段只能 %N 访问；空 selector 报错。
 */
export function resolveSection(sections: Section[], selector: string): Section {
	if (/^%\d+$/.test(selector)) {
		const n = Number(selector.slice(1));
		const s = sections[n - 1];
		if (s) return s;
		throw new Error(`段不存在: 第 ${n} 块（文件共 ${sections.length} 段）`);
	}
	if (selector === "") {
		throw new Error("段不存在: 空选择器（匿名段只能用 %N 序号访问）");
	}
	const s = findSection(sections, selector);
	if (!s) throw new Error(`段不存在: ${selector}`);
	return s;
}

/** 段选择：selector 省略 → 单段直接取；多段必须指定（段名或 %序号） */
export function selectSection(sections: Section[], selector?: string): Section {
	if (selector === undefined) {
		if (sections.length === 1) return sections[0] as Section;
		const names = sections.map((s) => s.name).join(", ");
		throw new Error(
			`文件包含 ${sections.length} 个 pd 段（${names}），必须指定段（段名或 %序号）`,
		);
	}
	return resolveSection(sections, selector);
}

/** 查找行内引用（` :name ` 模式）；行内代码段内的 `:xxx` 不识别为引用 */
function findRefs(text: string): RefToken[] {
	const refs: RefToken[] = [];
	// 行内代码段区间（[start, end)）：冒号落在区间内 → 不是引用
	// （在原文上匹配引用，避免拆段后 seg 边界误把 `` `x`:ref `` 的 `:ref` 当行首引用）
	const codeRanges: [number, number][] = [];
	let pos = 0;
	for (const { code, seg } of splitInlineCode(text)) {
		if (code) codeRanges.push([pos, pos + seg.length]);
		pos += seg.length;
	}
	REF_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = REF_RE.exec(text)) !== null) {
		const lead = /^\s/.test(m[0] as string) ? 1 : 0; // 前导空格偏移
		const colonAt = m.index + lead;
		if (codeRanges.some(([s, e]) => colonAt >= s && colonAt < e)) continue;
		refs.push({
			name: m[1] as string,
			start: colonAt,
			end: m.index + (m[0] as string).length,
		});
	}
	return refs;
}

/**
 * 引用解析：`%N`（% 开头 + 纯数字）→ 全局 1-based 序号引用（匿名段也可引用）；
 * 否则字符模式按存储名匹配（先到先得）。与段寻址共用 findSection 同一规则。
 */
function resolveRef(name: string, sections: Section[]): Section {
	const s = findSection(sections, name);
	if (s) return s;
	throw new Error(
		`引用段不存在: ${name}${/^%\d+$/.test(name) ? `（全局共 ${sections.length} 段）` : ""}`,
	);
}

/** 递归展开段内引用，返回行流；``` 围栏内行不展开引用（原样保留） */
function expandSection(
	section: Section,
	sections: Section[],
	depth: number,
	path: number[],
): string[] {
	if (depth > MAX_DEPTH) throw new Error(`引用嵌套过深（>${MAX_DEPTH}）`);
	const out: string[] = [];
	let inFence = false;
	section.lines.forEach((raw, idx) => {
		const trimmed = raw.trim();
		if (trimmed.startsWith("```")) {
			inFence = !inFence;
			out.push(raw);
			return;
		}
		if (inFence) {
			out.push(raw); // 围栏内原样，不展开引用
			return;
		}
		const line = lexLine(raw, idx + 1); // 行号 = 段内 1-based（报错用）
		if (line.kind === "blank" || line.kind === "section") {
			out.push(raw);
			return;
		}
		if (findRefs(line.text).length === 0) {
			out.push(raw);
			return;
		}
		out.push(...expandRefLine(line, sections, depth, path));
	});
	return out;
}

/** 展开含引用的行（内联嵌入 或 断开转 `- ` 项 + 块嵌入） */
function expandRefLine(
	line: PLine,
	sections: Section[],
	depth: number,
	path: number[],
): string[] {
	// key 行只对 value 部分处理引用（键名已单独保留）；内容行处理整行
	const isKey = line.kind === "key" || line.kind === "item-key";
	let prefix = "";
	if (line.kind === "item-key") prefix = `- ${line.key as string}:`;
	else if (line.kind === "key") prefix = `${line.key as string}:`;
	const body = isKey ? (line.value ?? "") : line.text;
	const refs = findRefs(body);

	// 预展开每个引用段（校验存在；循环引用静默擦除）。
	// 引用链 path 存**实际 section 的索引 id**（resolveRef 解析后取 indexOf），
	// 而非引用名——`:名称` 与 `:%序号` 指向同一段时 id 相同，不会被名字/序号绕开。
	// 命中引用链任意 id → 循环：不展开该引用（lines 为空 → 渲染时擦掉 `:refname`）。
	const expanded: { lines: string[] }[] = refs.map((r) => {
		let t: Section;
		try {
			t = resolveRef(r.name, sections);
		} catch (e) {
			throw new Error(`第${line.lineNo}行: ${(e as Error).message}`);
		}
		const idx = sections.indexOf(t);
		if (path.includes(idx)) return { lines: [] };
		return { lines: expandSection(t, sections, depth + 1, [...path, idx]) };
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
		let inFence = false;
		for (const rl of (expanded[i] as { lines: string[] }).lines) {
			const rlTrim = rl.trim();
			if (rlTrim === "") continue;
			// ``` 围栏行与围栏内容：永远顶层原样嵌入（code 块无视前置上下文，
			// parse 后归顶层键）。转 `- ` 项会破坏围栏语义（body 被序列前缀污染）。
			if (rlTrim.startsWith("```")) {
				inFence = !inFence;
				out.push(rl);
				continue;
			}
			if (inFence) {
				out.push(rl);
				continue;
			}
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
 * 展开单个段（引用按 sections 全局列表解析：%N 序号引用 + 命名引用），返回展开后的 pd 文本。
 * sections 由调用方提供（单文件 splitSections 结果；跨文件合并后的全局列表）。
 * 循环引用：引用链（path，存实际 section 的索引 id）命中任意一环时，
 * 静默擦掉 `:refname`（不展开、不报错），其余引用照常展开。
 */
export function expandSectionText(
	section: Section,
	sections: Section[],
): string {
	const lines = expandSection(section, sections, 0, [
		sections.indexOf(section), // 起始段先进引用链（自引用/绕回一圈即命中）
	]);
	// 丢弃 split 伪影产生的单个尾部空行（`a: 1\n` 的尾 `\n` 会产出 `""`；
	// 用户真实空行结尾如 `a: 1\n\n` 会保留一个）
	if (lines.length > 0 && lines.at(-1) === "") lines.pop();
	return lines.join("\n");
}

/**
 * 选段 + 引用展开，返回展开后的 pd 文本（供 lexer/parser 使用）。
 * @param text 源文本（可含多段/混输前缀）
 * @param target 段选择器：段名或 `%序号`；多段时必须指定
 */
export function expand(text: string, target?: string): string {
	const sections = splitSections(text);
	const section = selectSection(sections, target);
	return expandSectionText(section, sections);
}
