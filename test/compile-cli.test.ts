import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// pdcompile CLI 集成测试（跨文件合并语义）：spawn 主包 compile-cli.ts。

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
