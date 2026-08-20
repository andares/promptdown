import type { Block, CodeBlock, PdDoc } from "./types";

export type JsonValue = string | string[] | { [k: string]: JsonValue };

/** 单块转 JSON：折叠规则（单条 inline 且无子键/无代码块 → 字符串；否则对象） */
function blockToJson(b: Block): JsonValue {
	const onlyInline =
		b.inline !== null &&
		b.entries.size === 0 &&
		b.codes.length === 0 &&
		b.infos.length === 1 &&
		(b.infos[0] as string[]).length === 1;
	if (onlyInline) return b.inline as string;

	const obj: { [k: string]: JsonValue } = {};
	for (const entry of b.order) {
		if (entry.kind === "key") {
			const child = b.entries.get(entry.name);
			if (child) obj[entry.name] = blockToJson(child);
		} else if (entry.kind === "code") {
			const code = b.codes[entry.index] as CodeBlock;
			const codeObj: { [k: string]: JsonValue } = {};
			if (code.lang) codeObj.lang = code.lang; // lang 空则省略字段
			codeObj.body = code.body;
			obj[`Code${entry.index + 1}`] = codeObj;
		} else {
			obj[`Info${entry.index + 1}`] = [...(b.infos[entry.index] as string[])];
		}
	}
	return obj;
}

/** 文档 → JSON 对象（根按顺序输出） */
export function toJson(doc: PdDoc): { [k: string]: JsonValue } {
	const obj: { [k: string]: JsonValue } = {};
	for (const entry of doc.root.order) {
		if (entry.kind === "key") {
			const child = doc.root.entries.get(entry.name);
			if (child) obj[entry.name] = blockToJson(child);
		}
	}
	return obj;
}
