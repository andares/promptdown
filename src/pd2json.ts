import { expand, splitSections } from "./parser/expand";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { toJson } from "./parser/toJson";

/**
 * pd 文本 → 格式化 JSON 字符串（与 CLI `pd2json` 输出完全一致）。
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

/** 列出全部段名（含裸 `//!pd` 的空名）；供多段文件 QuickPick 用 */
export function sectionNames(text: string): string[] {
	return splitSections(text).map((s) => s.name);
}
