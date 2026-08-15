import { detectPdIntent } from "./auto-detect";
import { format } from "./format";
import {
	expandSectionText,
	nameSections,
	selectSection,
	splitSections,
	type Section,
} from "./parser/expand";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { toJson } from "./parser/toJson";

/**
 * 编译核心（pdcompile CLI / VSCode 编译 / compilePdText 共用）：
 * 合并后的段列表 → 选段 → 引用内联展开（%N 序号引用 + 命名引用）→ 统一 format。
 */
export function compileSections(
	sections: Section[],
	selector?: string,
): string {
	const section = selectSection(sections, selector);
	const expanded = expandSectionText(section, sections);
	return format(expanded);
}

/**
 * 编译选中的段：引用内联展开 → 统一 format（含空行规则）。
 * 输出为单份完整 pd 文本（pdcompile 与 VSCode 编译共用）。
 * @param selector 段选择器：段名或 `%序号`（如 `%2`）
 * @param fileStem 文件主名——无 //!pd 的隐式段用它作段名
 */
export function compilePdText(
	text: string,
	selector?: string,
	fileStem = "",
): string {
	const sections = splitSections(text);
	nameSections(text, sections, fileStem);
	return compileSections(sections, selector);
}

/**
 * 转换核心（pdtransform CLI / VSCode 转换共用）：
 * 合并后的段列表 → 选段 → 展开 → 解析 → 格式化 JSON。
 */
function transformSections(sections: Section[], selector?: string): string {
	const section = selectSection(sections, selector);
	const expanded = expandSectionText(section, sections);
	const doc = parse(lex(expanded));
	if (doc.errors.length > 0) {
		throw new Error(
			doc.errors.map((e) => `第${e.lineNo}行: ${e.message}`).join("；"),
		);
	}
	return JSON.stringify(toJson(doc), null, 2);
}

/**
 * pd 文本 → 格式化 JSON 字符串（与 CLI `pdtransform` 输出一致）。
 * 解析错误 / 多段未指定段名时抛错（message 含行号与原因）。
 * @param selector 段选择器：段名或 `%序号`（如 `%2`）；多段时必须指定
 * @param fileStem 文件主名——无 //!pd 的隐式段用它作段名（如 `pdtransform first.pd first`）
 */
export function pdToJsonText(
	text: string,
	selector?: string,
	fileStem = "",
): string {
	const sections = splitSections(text);
	nameSections(text, sections, fileStem);
	return transformSections(sections, selector);
}

/** 文件名是否为 `.pd`（大小写不敏感） */
export function isPdFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(".pd");
}

/** 文件名是否为 `.json`（大小写不敏感） */
export function isJsonFileName(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(".json");
}

/** 列出全部段名（含裸 `//!pd` 的空名与 `%` 转义后的存储名） */
export function sectionNames(text: string): string[] {
	return splitSections(text).map((s) => s.name);
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
