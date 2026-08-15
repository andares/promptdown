import { detectPdIntent } from "./auto-detect";
import { expand, splitSections, type Section } from "./parser/expand";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { toJson } from "./parser/toJson";

/**
 * pd 文本 → 格式化 JSON 字符串（与 CLI `pdtransform` 输出一致）。
 * 解析错误 / 多段未指定段名时抛错（message 含行号与原因）。
 */
export function pdToJsonText(text: string, section?: string): string {
	const expanded = expand(text, section);
	const doc = parse(lex(expanded));
	if (doc.errors.length > 0) {
		throw new Error(
			doc.errors.map((e) => `第${e.lineNo}行: ${e.message}`).join("；"),
		);
	}
	return JSON.stringify(toJson(doc), null, 2);
}

/** 文件名是否为 `.pd`（大小写不敏感） */
export function isPdFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(".pd");
}

/** 文件名是否为 `.json`（大小写不敏感） */
export function isJsonFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(".json");
}

/** 列出全部段名（含裸 `//!pd` 的空名）；供多段文件 QuickPick 用 */
export function sectionNames(text: string): string[] {
	return splitSections(text).map((s) => s.name);
}

/**
 * 段选择器解析：先按段名精确匹配；匹配不上且是正整数 → 1-based 序号；
 * 都失败抛错（段不存在）。
 * 返回传给 expand 的段名；selector 省略返回 undefined（单段隐式段）。
 */
export function resolveSectionName(
	sections: Section[],
	selector?: string,
): string | undefined {
	if (selector === undefined) return undefined;
	if (sections.some((s) => s.name === selector)) return selector;
	if (/^\d+$/.test(selector)) {
		const n = Number(selector);
		if (n >= 1 && n <= sections.length) {
			return (sections[n - 1] as Section).name;
		}
		throw new Error(`段不存在: 第 ${n} 块（文件共 ${sections.length} 段）`);
	}
	throw new Error(`段不存在: ${selector}`);
}

/**
 * 输入类型识别（pdtransform 方向判定，CLI 与 VSCode 共用）：
 * 扩展名优先（.pd / .json，大小写不敏感）→ 内容探针（//!pd 段标记 → pd；
 * 可解析为 JSON → json）→ 无法识别返回 null。
 */
export function detectTransformKind(
	fileName: string,
	text: string,
): "pd" | "json" | null {
	if (isPdFileName(fileName)) return "pd";
	if (isJsonFileName(fileName)) return "json";
	if (detectPdIntent(text)) return "pd";
	try {
		JSON.parse(text.trim());
		return "json";
	} catch {
		return null;
	}
}
