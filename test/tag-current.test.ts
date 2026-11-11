import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "scripts", "tag-current.mjs");

/** 隔离的 git 仓：根包与 editor 版本不同，覆盖 monorepo 的真实形态。 */
function fixture() {
	const dir = mkdtempSync(join(tmpdir(), "pd-tag-current-"));
	mkdirSync(join(dir, "scripts"), { recursive: true });
	mkdirSync(join(dir, "packages", "editor"), { recursive: true });
	copyFileSync(SOURCE, join(dir, "scripts", "tag-current.mjs"));
	writeFileSync(
		join(dir, "package.json"),
		`${JSON.stringify({ name: "root", version: "1.2.3" }, null, 2)}\n`,
	);
	writeFileSync(
		join(dir, "packages", "editor", "package.json"),
		`${JSON.stringify({ name: "editor", version: "0.5.1" }, null, 2)}\n`,
	);
	for (const args of [
		["init", "--quiet"],
		["config", "user.email", "test@example.com"],
		["config", "user.name", "Test"],
		["add", "-A"],
		["commit", "--quiet", "-m", "fixture"],
	]) {
		const res = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
		assert.equal(res.status, 0, res.stderr);
	}
	return dir;
}

function run(dir: string, args: string[]) {
	return spawnSync(
		process.execPath,
		[join(dir, "scripts", "tag-current.mjs"), ...args],
		{ cwd: dir, encoding: "utf8" },
	);
}

function tags(dir: string) {
	return spawnSync("git", ["tag", "--list"], { cwd: dir, encoding: "utf8" })
		.stdout.trim();
}

test("tag-current: 默认仍按根包版本打 vX.Y.Z", (t) => {
	const dir = fixture();
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const res = run(dir, []);
	assert.equal(res.status, 0, res.stderr);
	assert.equal(tags(dir), "v1.2.3");
});

test("tag-current: --package 让 editor 前缀 tag 对照 editor 版本", (t) => {
	const dir = fixture();
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const args = [
		"--tag",
		"pdeditor-v0.5.1",
		"--package",
		"packages/editor/package.json",
	];
	const res = run(dir, args);
	assert.equal(res.status, 0, res.stderr);
	assert.equal(tags(dir), "pdeditor-v0.5.1");
	const again = run(dir, args);
	assert.equal(again.status, 0, again.stderr);
	assert.match(again.stdout, /已存在且指向当前 HEAD/);
});

test("tag-current: editor tag 与目标包版本不一致时拒绝", (t) => {
	const dir = fixture();
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const res = run(dir, [
		"--tag",
		"pdeditor-v0.5.2",
		"--package",
		"packages/editor/package.json",
	]);
	assert.equal(res.status, 1);
	assert.match(res.stderr, /与 package.json 版本 0.5.1 不一致/);
	assert.equal(tags(dir), "");
});
