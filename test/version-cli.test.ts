import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// CLI 通用参数 --version 集成测试：三个命令行（pdtransform / pdcompile / pdformat）
// 统一调用 src/version.ts，输出与 package.json 的 version 一致。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIS = ["cli.ts", "compile-cli.ts", "format-cli.ts"].map((f) =>
	join(ROOT, "src", f),
);

function runVersion(cli: string) {
	return spawnSync("pnpm", ["exec", "tsx", cli, "--version"], {
		encoding: "utf8",
		cwd: ROOT,
	});
}

test("--version: 三个 CLI 输出与 package.json version 一致（exit 0）", () => {
	const pkg = JSON.parse(
		readFileSync(join(ROOT, "package.json"), "utf8"),
	) as { version: string };
	for (const cli of CLIS) {
		const res = runVersion(cli);
		assert.equal(res.status, 0, `${cli}: exit ${res.status}, stderr=${res.stderr}`);
		assert.equal(res.stdout.trim(), pkg.version);
	}
});

test("--version: 与其他参数共存时优先输出版本号（不读文件）", () => {
	const res = runVersion(CLIS[0] as string); // pdtransform --version（无文件也不报错）
	assert.equal(res.status, 0);
	assert.match(res.stdout, /^\d+\.\d+\.\d+/);
});
