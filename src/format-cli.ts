#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "./format";

const USAGE = `用法: pdformat <file.pd> [-w|--write]

格式化 prompt-down 文本：
- 全角冒号 → 半角（键值/引用位置）
- 键值冒号后恰好一个空格（key: value）
- 引用 :refname 前后各一个空格
- 顶层 \`- \` 缩进自动修正
- 行尾空白清理

默认输出到 stdout；-w 写回原文件`;

function main(): void {
	const args = process.argv.slice(2);
	const write = args.includes("-w") || args.includes("--write");
	const file = args.find((a) => !a.startsWith("-"));

	if (!file || args.includes("-h") || args.includes("--help")) {
		console.log(USAGE);
		process.exit(file ? 0 : 1);
	}

	let text: string;
	try {
		text = readFileSync(file, "utf8");
	} catch (e) {
		console.error(`pdformat: 无法读取文件 ${file}: ${(e as Error).message}`);
		process.exit(1);
		return;
	}

	const formatted = format(text);
	if (write) {
		if (formatted === text) {
			console.log(`${file}: 无需修改`);
		} else {
			writeFileSync(file, formatted, "utf8");
			console.log(`${file}: 已格式化`);
		}
	} else {
		process.stdout.write(
			formatted.endsWith("\n") ? formatted : `${formatted}\n`,
		);
	}
}

main();
