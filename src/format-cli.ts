#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "@andares/pdfoundation";

const USAGE = `用法: pdformat <file.pd> [-w|--write]

格式化 promptdown 文本：
- 首个全角冒号或紧邻内容的首个半角冒号 → \`: \`
- 后续全角冒号仅在左侧有空格时转半角；后续半角冒号不处理
- \`:-\` / \`：-\` 所在行不识别键值，不影响后续引用
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
