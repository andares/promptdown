#!/usr/bin/env node
/**
 * 给当前 package.json 的版本号打 git tag（默认 vX.Y.Z）。
 *
 *   pnpm tag-current                    # 打 tag：v{当前版本}，已存在则跳过
 *   pnpm tag-current --tag pdeditor-vX.Y.Z --package packages/editor/package.json
 *   pnpm tag-current --dry-run          # 只预览，不修改任何东西
 *
 * 行为：
 *  - tag 名默认 = `v${package.json 的 version}`，打在当前 HEAD 上；
 *    `--tag <name>` 用于包级前缀（如 `pdeditor-v0.5.1`），名称必须以 `v{版本}` 结尾；
 *    `--package <path>` 指定读取哪个包的 package.json（editor 与根包版本不同，必须指定）
 *  - 检测 tag 是否已存在：已存在且指向当前 HEAD → 跳过（重试场景）；
 *    已存在但指向其他 commit → 报错退出（静默跳过会让 tag 指向旧代码，
 *    release commit 反而没有 tag）
 *  - **只打本地 tag，不推送**（推送由 publish*.mjs 的 push 步骤负责）
 *
 * 在 release 中 bump + commit 之后调用：此时 package.json 已是新版本，
 * 打出的 tag 恰好指向 release commit。
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = process.platform === "win32" ? "git.exe" : "git";

const C = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
let dryRun = false;
let explicitTag;
let packageArg;
for (let i = 0; i < rawArgs.length; i++) {
	const arg = rawArgs[i];
	if (arg === "--dry-run") {
		dryRun = true;
		continue;
	}
	if (arg === "--tag" || arg === "--package") {
		const value = rawArgs[++i];
		if (!value || value.startsWith("--")) {
			console.error(`${C.red}${arg} 缺少参数值${C.reset}`);
			process.exit(1);
		}
		if (arg === "--tag") explicitTag = value;
		else packageArg = value;
		continue;
	}
	console.error(`${C.red}未知参数：${arg}${C.reset}`);
	process.exit(1);
}
if (explicitTag && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(explicitTag)) {
	console.error(
		`${C.red}--tag 需要一个合法的 tag 名（字母数字开头，可含 . _ -）${C.reset}`,
	);
	process.exit(1);
}
const PKG_PATH = packageArg
	? resolve(ROOT, packageArg)
	: join(ROOT, "package.json");

let pkg;
try {
	pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
} catch {
	console.error(
		`${C.red}package.json is missing or not valid JSON: ${PKG_PATH}${C.reset}`,
	);
	process.exit(1);
}
const version = pkg.version;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
	console.error(
		`${C.red}Unexpected package.json version: ${JSON.stringify(version)}${C.reset}`,
	);
	process.exit(1);
}
const tag = explicitTag ?? `v${version}`;
if (explicitTag && !explicitTag.endsWith(`v${version}`)) {
	console.error(
		`${C.red}tag ${explicitTag} 与 package.json 版本 ${version} 不一致（必须以 v${version} 结尾）${C.reset}`,
	);
	process.exit(1);
}

function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
	if (res.status !== 0 && !opts.allowFailure) {
		console.error(`${C.red}Failed: ${cmd} ${args.join(" ")}${C.reset}`);
		process.exit(res.status ?? 1);
	}
	return res;
}

// 检测 tag 是否已存在：已存在且指向当前 HEAD → 跳过（重试场景）；
// 已存在但指向其他 commit → 报错退出（拒绝覆盖，避免 tag 指向旧代码）。
const tagRef = run(
	git,
	["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`],
	{ stdio: "pipe", allowFailure: true },
);
if (tagRef.status === 0) {
	const tagCommit = tagRef.stdout.toString().trim();
	const head = run(git, ["rev-parse", "HEAD"], { stdio: "pipe" })
		.stdout.toString()
		.trim();
	if (tagCommit === head) {
		console.log(
			`${C.yellow}tag ${tag} 已存在且指向当前 HEAD，跳过（不重复打）${C.reset}`,
		);
		process.exit(0);
	}
	console.error(
		`${C.red}tag ${tag} 已存在但指向 ${tagCommit.slice(0, 8)}（当前 HEAD ${head.slice(0, 8)}）— 拒绝覆盖。` +
			`\n  若确认要重打：git tag -d ${tag} 后重跑。${C.reset}`,
	);
	process.exit(1);
}

if (dryRun) {
	console.log(
		`${C.dim}--dry-run -- nothing changed. Would run:${C.reset}` +
			`\n  git tag ${tag}`,
	);
	process.exit(0);
}

run(git, ["tag", tag]);
console.log(`${C.green}✅ git tag ${tag}${C.reset}（本地 tag，未推送）`);
