#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { nameSections, splitSections, type Section } from "./parser/expand";
import { compileSections } from "./pdtransform";

const USAGE = `用法: pdcompile <section> <file>[...<file>]

编译选中的段为单份完整 pd（引用内联展开 + 统一 format，输出到 stdout）：
- <section>：段名，或 %序号（如 %1 = 第 1 个 section，从 1 开始，全局跨文件编号）
- 无 //!pd 段标记的文件 = 一个隐式段，段名 = 文件主名（去扩展名）
- 匿名段只能 %序号 访问；命名以 % 开头的段转义为 %% 前缀
- 跨文件重名段：先到先得（后出现的同名段自动匿名化，只能 %序号 访问）
- 引用 (:refname 或 :%序号) 在编译期内联展开（代码块/行内代码内不展开）
- section 必填（没有 section 无从编译）`;

/** 文件主名（去扩展名）——无 //!pd 的隐式段用它作段名 */
function fileStem(file: string): string {
	return basename(file, extname(file));
}

function main(): void {
	const args = process.argv.slice(2);
	const sectionArg = args[0];
	const files = args.slice(1);

	if (
		!sectionArg ||
		files.length === 0 ||
		args.includes("-h") ||
		args.includes("--help")
	) {
		console.log(USAGE);
		process.exit(sectionArg ? 0 : 1);
	}

	// 读全部文件 → 各文件 splitSections + 隐式段命名 → 全局合并（文件序 → 段序）
	const all: Section[] = [];
	for (const file of files) {
		let text: string;
		try {
			text = readFileSync(file, "utf8");
		} catch (e) {
			console.error(`pdcompile: 无法读取文件 ${file}: ${(e as Error).message}`);
			process.exit(1);
		}
		const sections = splitSections(text);
		nameSections(text, sections, fileStem(file));
		all.push(...sections);
	}

	try {
		const pd = compileSections(all, sectionArg); // 选段 → 展开（%N 序号/命名引用）→ format
		process.stdout.write(pd === "" ? "" : `${pd}\n`);
	} catch (e) {
		console.error(`pdcompile: ${(e as Error).message}`);
		process.exit(1);
	}
}

main();
