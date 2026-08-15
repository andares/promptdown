#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { jsonToPdText } from "./jsonToPd";
import { splitSections } from "./parser/expand";
import {
	detectTransformKind,
	pdToJsonText,
	resolveSectionName,
} from "./pdtransform";

const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const USAGE = `用法: pdtransform <file> [段名|序号]

promptdown ↔ JSON 双向转换（自动识别输入类型）：
- .pd 文件 → 转 JSON（输出到 stdout）
- .json 文件 → 转 promptdown（输出到 stdout）
- 其他扩展名按内容探测：//!pd 段标记 → pd；可解析为 JSON → json
- 多段 pd 文件必须指定段：段名，或 1-based 序号（如 2 = 第 2 块）
- 引用 (:refname) 在编译期内联展开
- JSON 中不符合 pd 规则的条目：标量转文本、结构性丢弃（黄字警告逐条列出）`;

function main(): void {
	const args = process.argv.slice(2);
	const file = args[0];
	const selector = args[1];

	if (!file || file === "-h" || file === "--help") {
		console.log(USAGE);
		process.exit(file ? 0 : 1);
	}

	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (e) {
		console.error(`pdtransform: 无法读取文件 ${file}: ${(e as Error).message}`);
		process.exit(1);
	}

	const kind = detectTransformKind(file, text);
	if (kind === "pd") {
		let section: string | number | undefined;
		try {
			section = resolveSectionName(splitSections(text), selector);
		} catch (e) {
			console.error(`pdtransform: ${(e as Error).message}`);
			process.exit(1);
		}
		try {
			console.log(pdToJsonText(text, section));
		} catch (e) {
			console.error(`pdtransform: ${(e as Error).message}`);
			process.exit(1);
		}
		return;
	}

	if (kind === "json") {
		if (selector) {
			console.error("pdtransform: JSON 转换不支持段参数");
			process.exit(1);
		}
		try {
			const result = jsonToPdText(text);
			for (const w of result.warnings) {
				console.error(`${YELLOW}pdtransform: ${w}${RESET}`);
			}
			process.stdout.write(result.pd === "" ? "" : `${result.pd}\n`);
		} catch (e) {
			console.error(`pdtransform: ${(e as Error).message}`);
			process.exit(1);
		}
		return;
	}

	console.error(
		`pdtransform: 无法识别文件类型 ${file}（既不是 .pd/含 //!pd 段标记，也不是可解析的 JSON）`,
	);
	process.exit(1);
}

main();
