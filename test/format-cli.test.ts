import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const CLI = join(__dirname, "..", "src", "format-cli.ts");

function run(
	file: string,
	args: string[],
): {
	stdout: string;
	stderr: string;
	status: number;
} {
	const res = spawnSync("pnpm", ["exec", "tsx", CLI, ...args], {
		encoding: "utf8",
	});
	void file;
	return {
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
		status: res.status ?? -1,
	};
}

test("format-cli: 默认输出 stdout（不写回原文件）", () => {
	const dir = mkdtempSync(join(tmpdir(), "pdformat-"));
	const file = join(dir, "a.pd");
	writeFileSync(file, "name1：some\n");
	const r = run(file, [file]);
	assert.equal(r.status, 0);
	assert.equal(r.stdout, "name1: some\n"); // 结果走 stdout
	assert.equal(readFileSync(file, "utf8"), "name1：some\n"); // 原文件不动
	rmSync(dir, { recursive: true, force: true });
});

test("format-cli: -w 写回原文件", () => {
	const dir = mkdtempSync(join(tmpdir(), "pdformat-"));
	const file = join(dir, "a.pd");
	writeFileSync(file, "name1：some\n");
	const r = run(file, [file, "-w"]);
	assert.equal(r.status, 0);
	assert.equal(readFileSync(file, "utf8"), "name1: some\n"); // 已写回
	rmSync(dir, { recursive: true, force: true });
});

test("format-cli: 无参数打印用法并退出", () => {
	const r = run("", []);
	assert.notEqual(r.status, 0);
	assert.match(r.stdout, /用法: pdformat/);
});

test("format-cli: 已格式化内容 -w 提示无需修改", () => {
	const dir = mkdtempSync(join(tmpdir(), "pdformat-"));
	const file = join(dir, "a.pd");
	writeFileSync(file, "name1: some\n");
	const r = run(file, [file, "-w"]);
	assert.equal(r.status, 0);
	assert.match(r.stdout, /无需修改/);
	rmSync(dir, { recursive: true, force: true });
});
