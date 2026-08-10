#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { expand } from "./parser/expand";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { toJson } from "./parser/toJson";

const USAGE = `用法: pd2json <file.pd> [段名]

转 prompt-down 为 JSON。
- 单段文件可省略段名
- 多段文件必须指定段名（//!pd <name>）
- 引用 (:refname) 在编译期内联展开`;

function main(): void {
	const args = process.argv.slice(2);
	const file = args[0];
	const section = args[1];

	if (!file || file === "-h" || file === "--help") {
		console.log(USAGE);
		process.exit(file ? 0 : 1);
	}

	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (e) {
		console.error(`pd2json: 无法读取文件 ${file}: ${(e as Error).message}`);
		process.exit(1);
		return;
	}

	try {
		const expanded = expand(text, section);
		const doc = parse(lex(expanded));
		if (doc.errors.length > 0) {
			for (const err of doc.errors) {
				console.error(`pd2json: ${file}:${err.lineNo}: ${err.message}`);
				console.error(`           ${err.raw}`);
			}
			process.exit(1);
			return;
		}
		console.log(JSON.stringify(toJson(doc), null, 2));
	} catch (e) {
		console.error(`pd2json: ${(e as Error).message}`);
		process.exit(1);
	}
}

main();
