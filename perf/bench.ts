/**
 * 性能基准：对 10 副本样本（单文件合并 2080+ 行 / 140 段，或多文件 10 个）测量
 * 核心链路各操作的耗时与内存占用。
 *
 * 测量项（每项跑 rounds 次取中位数）：
 * 1. splitSections          —— 段切分（含围栏状态跟踪）
 * 2. compilePdText          —— 编译引用链最深的段（"生成指令_N"，展开 10+ 引用）
 * 3. pdToJsonText           —— 选段转换 JSON（展开 + parse + toJson）
 * 4. format                 —— 全文件格式化（含空行规则、围栏/行内代码保护）
 * 5. jsonToPdText           —— JSON → pd 反向渲染（含转义）
 * 6. compileSections(all)   —— 跨 10 文件合并编译（pdcompile CLI 的核心路径）
 *
 * 运行：pnpm perf [rounds]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
	compilePdText,
	compileSections,
	format,
	jsonToPdText,
	nameSections,
	pdToJsonText,
	splitSections,
} from "@andares/pdfoundation";
import { buildSuite } from "./gen-suite";

/** 跑多次取中位数（ms） */
function medianMs(fn: () => void, rounds: number): number {
	const times: number[] = [];
	for (let i = 0; i < rounds; i++) {
		const t0 = performance.now();
		fn();
		times.push(performance.now() - t0);
	}
	times.sort((a, b) => a - b);
	return times[Math.floor(times.length / 2)] as number;
}

/** 内存增量（MB）：三次取最小（JIT/GC 噪声下 min 更接近真实增量）；需 --expose-gc */
function heapDelta(fn: () => void): number {
	const gc = globalThis.gc as (() => void) | undefined;
	const deltas: number[] = [];
	for (let i = 0; i < 3; i++) {
		gc?.();
		const before = process.memoryUsage().heapUsed;
		fn();
		gc?.();
		deltas.push((process.memoryUsage().heapUsed - before) / 1024 / 1024);
	}
	return Math.min(...deltas);
}

/** 合成大 JSON（~90KB，与样本体量相当）——jsonToPdText 反向渲染的输入 */
function synthBigJson(): string {
	const obj: Record<string, unknown> = {};
	for (let i = 0; i < 100; i++) {
		obj[`键组${i}`] = {
			Info1: [
				`内容项 ${i} 甲`,
				`内容项 ${i} 乙: 带冒号`,
				`URL https://a.com/${i}`,
				"普通文本",
				"再一行",
				`用 \`代码: ${i}\` 包裹`,
			],
			子键: { Info1: [`嵌套 ${i}`, "更多内容"], 折叠键: `值 ${i}` },
			Code1: { lang: "json", body: `{\n  "i": ${i}\n}` },
		};
	}
	return JSON.stringify(obj);
}

function main(): void {
	const rounds = Number(process.argv[2] ?? 7);
	const count = 10;
	const suite = buildSuite(join(__dirname, "generated"), count);
	const combined = readFileSync(suite.combinedFile, "utf8");
	const allSections = splitSections(combined);
	nameSections(combined, allSections, "");
	const lastCopy = count; // 第 10 份的段名后缀
	const deepSection = `生成指令_${lastCopy}`; // 引用链最深（10+ 引用）
	const midSection = `石犀镜头组_${lastCopy}`;

	const bigJson = synthBigJson();
	const rows: [string, string][] = [
		[
			"输入规模",
			`${suite.lines} 行 / ${(suite.bytes / 1024).toFixed(1)} KB / ${suite.sectionCount} 段（10 副本）`,
		],
		[
			"splitSections（段切分）",
			`${medianMs(() => splitSections(combined), rounds).toFixed(2)} ms`,
		],
		[
			`compilePdText（编译 ${deepSection}）`,
			`${medianMs(() => compilePdText(combined, deepSection), rounds).toFixed(2)} ms`,
		],
		[
			`pdToJsonText（转换 ${midSection}）`,
			`${medianMs(() => pdToJsonText(combined, midSection), rounds).toFixed(2)} ms`,
		],
		[
			"format（全文件格式化）",
			`${medianMs(() => format(combined), rounds).toFixed(2)} ms`,
		],
		[
			"jsonToPdText（~90KB 合成 JSON 反向渲染）",
			`${medianMs(() => jsonToPdText(bigJson), rounds).toFixed(2)} ms`,
		],
		[
			"compileSections（跨 10 文件合并编译）",
			`${medianMs(() => {
				const all: ReturnType<typeof splitSections> = [];
				for (const f of suite.files) {
					const text = readFileSync(f, "utf8");
					const secs = splitSections(text);
					nameSections(text, secs, "copy");
					all.push(...secs);
				}
				compileSections(all, `生成指令_${lastCopy}`);
			}, rounds).toFixed(2)} ms`,
		],
		[
			"内存增量（compilePdText 全量编译）",
			(() => {
				const d = heapDelta(() => compilePdText(combined, deepSection));
				return d <= 0 ? "≈0（GC 后无增长）" : `${d.toFixed(2)} MB`;
			})(),
		],
	];

	console.log(`\npromptdown 性能基准（rounds=${rounds}，取中位数）\n`);
	const w = Math.max(...rows.map((r) => r[0].length));
	for (const [k, v] of rows) console.log(`  ${k.padEnd(w + 2)}${v}`);
}

main();
