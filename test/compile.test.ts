import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compilePdText, pdToJsonText } from "../src/pdtransform";

// ---- compilePdText：单文件编译（选段展开 + format） ----

test("compilePdText: 单段隐式段省略 selector 直接编译", () => {
	assert.equal(compilePdText("name1: some\n"), "name1: some");
});

test("compilePdText: 引用在编译期内联展开", () => {
	const text = "//!pd base\n基础内容\n//!pd main\n任务: :base 完成\n";
	assert.equal(compilePdText(text, "main"), "任务: 基础内容 完成");
});

test("compilePdText: %序号选段（含匿名段）", () => {
	const text = "//!pd\n任务: 一\n//!pd 乙\n任务: 二\n";
	assert.equal(compilePdText(text, "%2"), "任务: 二");
});

test("compilePdText: 隐式段用文件主名寻址", () => {
	assert.equal(compilePdText("任务: 甲\n", "first", "first"), "任务: 甲");
});

test("compilePdText: 输出统一 format（空行规则 + 规范化）", () => {
	const text = "//!pd a\n任务: 甲\n- 子项\n//!pd b\n任务: 乙\n";
	assert.equal(compilePdText(text, "a"), "任务: 甲\n- 子项");
	assert.equal(compilePdText("name1：some\n"), "name1: some");
});

test("compilePdText: 围栏内引用不展开、不切段", () => {
	const text =
		"//!pd 主\n```md\n参考 :base 写法\n//!pd 不是段\n```\n完成\n//!pd base\n基础\n";
	assert.equal(
		compilePdText(text, "主"),
		"```md\n参考 :base 写法\n//!pd 不是段\n```\n完成",
	);
});

test("compilePdText: 行内代码内引用不展开", () => {
	const text = "//!pd 主\n用 `:base` 写法\n//!pd base\n基础\n";
	assert.equal(compilePdText(text, "主"), "用 `:base` 写法");
});

test("compilePdText: 未命名段不自动赋文件名（只能 %N 访问）", () => {
	const text = "//!pd\n任务: 甲\n";
	assert.throws(() => compilePdText(text, "first", "first"), /段不存在: first/);
	assert.equal(compilePdText(text, "%1"), "任务: 甲");
});

// ---- pdcompile CLI：跨文件合并语义 ----

const CLI = join(__dirname, "..", "src", "compile-cli.ts");

/** 临时目录里建文件，跑 pdcompile，返回 stdout/stderr/status */
function runCompile(
	files: Record<string, string>,
	section: string,
): {
	stdout: string;
	stderr: string;
	status: number;
} {
	const dir = mkdtempSync(join(tmpdir(), "pdcompile-"));
	for (const [name, content] of Object.entries(files)) {
		writeFileSync(join(dir, name), content);
	}
	const res = spawnSync(
		"pnpm",
		["exec", "tsx", CLI, section, ...Object.keys(files).map((f) => join(dir, f))],
		{ encoding: "utf8" },
	);
	rmSync(dir, { recursive: true, force: true });
	return {
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
		status: res.status ?? -1,
	};
}

test("pdcompile: %1 必选第 1 个 section（跨文件全局编号）", () => {
	const r = runCompile(
		{
			"first.pd": "//!pd 甲\n任务: 甲\n//!pd 乙\n任务: 乙\n",
			"second.pd": "//!pd 丙\n任务: 丙\n",
		},
		"%1",
	);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "任务: 甲\n");
});

test("pdcompile: 无 //!pd 的文件 = 隐式段，段名 = 文件主名", () => {
	const r = runCompile(
		{ "first.pd": "任务: 甲\n", "second.pd": "//!pd 乙\n任务: 乙\n" },
		"first",
	);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "任务: 甲\n");
});

test("pdcompile: 跨文件引用按名字展开（先到先得）", () => {
	const r = runCompile(
		{
			"base.pd": "//!pd 基础\n基础内容\n",
			"main.pd": "//!pd 主\n任务: :基础 完成\n",
		},
		"主",
	);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "任务: 基础内容 完成\n");
});

test("pdcompile: 跨文件重名段先到先得（后出现的同名段自动匿名）", () => {
	const r = runCompile(
		{
			"a.pd": "//!pd 同名\n内容甲\n",
			"b.pd": "//!pd 同名\n内容乙\n//!pd 收尾\n完成\n",
		},
		"%3", // 全局第 3 段 = b.pd 的收尾
	);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "完成\n");
});

test("pdcompile: 报错信息带 pdcompile: 前缀（stderr，非零退出）", () => {
	const r = runCompile({ "a.pd": "//!pd x\n任务: 甲\n" }, "不存在的段");
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /^pdcompile: 段不存在: 不存在的段/);
});

test("pdcompile: 无参数打印用法并退出", () => {
	const r = runCompile({ "a.pd": "任务: 甲\n" }, "");
	const dir = mkdtempSync(join(tmpdir(), "pdcompile-usage-"));
	const res = spawnSync("pnpm", ["exec", "tsx", CLI], { encoding: "utf8" });
	rmSync(dir, { recursive: true, force: true });
	assert.notEqual(res.status, 0);
	assert.match(res.stdout, /用法: pdcompile/);
	assert.equal(r.status, 1); // section 为空 → 退出码 1
});

test("pdcompile: 输出已统一 format（编译结果空行规则生效）", () => {
	const r = runCompile({ "a.pd": "//!pd 甲\nk1:\n- 一\nk2:\n- 二\n" }, "甲");
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "k1:\n- 一\n\nk2:\n- 二\n");
});

// ---- %N 序号引用（引用段时 :%N 指向全局第 N 个段，匿名段也可引用） ----

test("compilePdText: :%N 序号引用匿名段（用户案例）", () => {
	const text = "//!pd\ndddd\n\n//!pd\naa: bbb :%1\n";
	assert.equal(compilePdText(text, "%2"), "aa: bbb dddd");
	assert.equal(compilePdText(text, "%1"), "dddd");
});

test("compilePdText: :%N 序号引用命名段；名字引用与序号引用并存", () => {
	const text = "//!pd 基础\n内容甲\n//!pd 主\n任务: :%1 和 :基础 都行\n";
	assert.equal(compilePdText(text, "主"), "任务: 内容甲 和 内容甲 都行");
});

test("compilePdText: :%N 越界报错", () => {
	const text = "//!pd\n任务: :%9 不存在\n";
	assert.throws(() => compilePdText(text, "%1"), /引用段不存在: %9/);
});

test("compilePdText: :%N 循环引用静默擦除", () => {
	const text = "//!pd\n甲: :%2\n//!pd\n乙: :%1\n";
	assert.equal(compilePdText(text, "%1"), "甲:\n- 乙:");
});

test("compilePdText: 循环与正常引用混一行（循环擦掉、正常展开）", () => {
	const text =
		"//!pd a\nA: :b :x\n//!pd b\nB: :a\n//!pd x\n正常内容\n";
	assert.equal(compilePdText(text, "a"), "A:\n- B:\n- 正常内容");
});

test("pdToJsonText: :%N 序号引用同样生效（transform 路径）", () => {
	const text = "//!pd\ndddd\n\n//!pd\naa: bbb :%1\n";
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%2")), { aa: "bbb dddd" });
});

test("pdcompile: :%N 跨文件序号引用（全局编号）", () => {
	const r = runCompile(
		{
			"a.pd": "//!pd\n内容甲\n",
			"b.pd": "//!pd\n任务: :%1 完成\n",
		},
		"%2", // 全局第 2 段 = b.pd 的段
	);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "任务: 内容甲 完成\n");
});
