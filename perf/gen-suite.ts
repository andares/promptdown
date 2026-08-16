/**
 * 性能测试样本生成器：
 * 读取 perf/sample-base.pd（208 行 / 14 段），复制 N 份（默认 10），
 * 每份对 section 名与命名引用统一加后缀（_1.._N）使副本内部自洽；
 * `:%序号` 引用按副本偏移重写（拼接后全局序号仍然正确指向本副本首段）。
 * 输出：单文件合并（combined-Nx.pd）与多文件（copy-1.pd..copy-N.pd）两种形态。
 *
 * 改名规则（与 findRefs 同语义，仅改"确认为引用"的位置）：
 * - 行内代码段内的 `:xxx` 不改（splitInlineCode 跳过）
 * - 引用前必须是空白或行首（REF_RE 约束），`:8443`（URL 端口）不会被误改
 * - `:%N` 序号引用不参与命名后缀，按 offset 重写
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitInlineCode } from "../src/parser/lexer";

const REF_RE = /(?:^|\s):([^\s-][^\s]*)(?=\s|$)/g;

export interface SuiteResult {
	combinedFile: string;
	files: string[];
	lines: number;
	bytes: number;
	sectionCount: number;
}

/** 单份样本改名：section 名与命名引用加后缀；%N 序号引用加偏移 */
function renameCopy(text: string, suffix: number, offset: number): string {
	const out: string[] = [];
	for (const raw of text.split("\n")) {
		// 1. 段标记行：//!pd <name> → //!pd <name>_N
		const sectionM = /^(\s*\/\/!pd)(\s+[^\s]+)?$/.exec(raw);
		if (sectionM && sectionM[2]) {
			out.push(`${sectionM[1]}${sectionM[2]}_${suffix}`);
			continue;
		}
		// 2. 普通行：仅对行内代码段外的命名引用加后缀；%N 序号引用加偏移
		let result = "";
		let pos = 0;
		for (const { code, seg } of splitInlineCode(raw)) {
			if (code) {
				result += seg;
				pos += seg.length;
				continue;
			}
			REF_RE.lastIndex = 0;
			let m: RegExpExecArray | null;
			let segOut = "";
			let last = 0;
			while ((m = REF_RE.exec(seg)) !== null) {
				const name = m[1] as string;
				const start = m.index + (m[0].startsWith(" ") ? 1 : 0);
				segOut += seg.slice(last, start);
				if (/^%\d+$/.test(name)) {
					segOut += `:%${Number(name.slice(1)) + offset}`; // 序号引用按偏移（保留 % 前缀）
				} else {
					segOut += `:${name}_${suffix}`; // 命名引用加后缀
				}
				last = m.index + m[0].length;
			}
			segOut += seg.slice(last);
			result += segOut;
			pos += seg.length;
		}
		out.push(result);
	}
	return out.join("\n");
}

/** 生成整套性能样本（N 份副本） */
export function buildSuite(outDir: string, count = 10): SuiteResult {
	const text = readFileSync(join(__dirname, "sample-base.pd"), "utf8");
	const sectionCount = (text.match(/^\/\/!pd[^\n]*$/gm) ?? []).length;
	mkdirSync(outDir, { recursive: true });

	const parts: string[] = [];
	const files: string[] = [];
	for (let i = 1; i <= count; i++) {
		const offset = (i - 1) * sectionCount; // 拼接后本副本首段的全局序号偏移
		const renamed = renameCopy(text, i, offset);
		const file = join(outDir, `copy-${i}.pd`);
		writeFileSync(file, renamed);
		files.push(file);
		parts.push(renamed);
	}
	const combined = parts.join("\n\n");
	const combinedFile = join(outDir, `combined-${count}x.pd`);
	writeFileSync(combinedFile, combined);

	return {
		combinedFile,
		files,
		lines: combined.split("\n").length,
		bytes: Buffer.byteLength(combined, "utf8"),
		sectionCount: sectionCount * count,
	};
}

// 直接运行：node/tsx perf/gen-suite.ts [份数]
if (import.meta.url === `file://${process.argv[1]}`) {
	const count = Number(process.argv[2] ?? 10);
	const r = buildSuite(join(__dirname, "generated"), count);
	console.log(
		`已生成 ${count} 份副本：${r.lines} 行 / ${(r.bytes / 1024).toFixed(1)} KB / ${r.sectionCount} 段\n` +
			`单文件: ${r.combinedFile}\n多文件: ${r.files.length} 个（${r.files[0]} ...）`,
	);
}
