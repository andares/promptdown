#!/usr/bin/env node
/**
 * One-command release for @andares/pdfoundation（共享语义核心）。
 *
 *   pnpm release-foundation patch            # 纯 npm 发布：0.1.0 → 0.1.1
 *
 * 流程（纯 npm，不做任何 git 操作）：
 * 语义包门禁（typecheck + test + build）→ bump packages/pdfoundation/package.json
 * version → pnpm publish。
 *
 * 不做：sync / commit / tag / push / GitHub Release——pdfoundation 是独立版本号的共享语义库，
 * 其版本不进入 promptdown 仓库的 git 历史与 tag（仓库 tag 体系是 v{主包版本}）。
 * bump 后 packages/pdfoundation/package.json 的改动留在工作区，由使用者自行决定何时提交。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - 语义包名就是 @andares/pdfoundation（package.json name 即 scoped 名，无改名问题）。
 *  - 门禁在 packages/pdfoundation 内跑（pnpm --filter @andares/pdfoundation ...）。
 *  - 版本独立于主包（@andares/pdfoundation 与 @andares/promptdown 各自管理版本）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages", "pdfoundation");
const PKG_PATH = join(PKG_DIR, "package.json");
const BUMPS = ["major", "minor", "patch"];
const PKG_NAME = "@andares/pdfoundation";

const C = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = rawArgs.includes("--dry-run");
const positional = rawArgs.filter((a) => a !== "--dry-run");
const arg = positional[0];

if (!BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release-foundation <${BUMPS.join("|")}>${C.reset}` +
			`\n  Bump ${PKG_NAME} version and publish npm only (no git operations).` +
			`\n  Add --dry-run to preview without changing anything.`,
	);
	process.exit(1);
}
if (positional.length > 1) {
	console.error(
		`${C.red}Too many arguments. Expected: <${BUMPS.join("|")}> [--dry-run]${C.reset}`,
	);
	process.exit(1);
}

let pkg;
try {
	pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
} catch {
	console.error(
		`${C.red}package.json is missing or not valid JSON: ${PKG_PATH}${C.reset}`,
	);
	process.exit(1);
}
const current = pkg.version;
if (typeof current !== "string" || !/^\d+\.\d+\.\d+$/.test(current)) {
	console.error(
		`${C.red}Unexpected ${PKG_NAME} version: ${JSON.stringify(current)}${C.reset}`,
	);
	process.exit(1);
}

const [maj, min, pat] = current.split(".").map(Number);
let next;
if (arg === "major") next = `${maj + 1}.0.0`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

console.log(
	`${C.dim}release-foundation${C.reset} ${C.bold}${current}${C.reset} → ${C.bold}${C.green}${next}${C.reset} (${arg})`,
);

function step(label) {
	console.log(`\n${C.dim}▸${C.reset} ${C.bold}${label}${C.reset}`);
}

function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
	if (res.status !== 0 && !opts.allowFailure) {
		console.error(`${C.red}Failed: ${cmd} ${args.join(" ")}${C.reset}`);
		process.exit(res.status ?? 1);
	}
	return res;
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(`  1. pnpm --filter ${PKG_NAME} typecheck && test && build`);
	console.log(`  2. bump packages/pdfoundation/package.json version → ${next}`);
	console.log(`  3. pnpm publish（${PKG_NAME}）`);
	console.log(
		`  （纯 npm 流程：不 commit、不打 tag、不 push、不建 GitHub Release；bump 留在工作区）`,
	);
	process.exit(0);
}

// 1. Checks gate（组件包门禁）— 失败即中止，未改动任何东西。
step("typecheck + test + build（语义包）");
run(pnpm, ["--filter", PKG_NAME, "typecheck"]);
run(pnpm, ["--filter", PKG_NAME, "test"]);
run(pnpm, ["--filter", PKG_NAME, "build"]);

// 2. Bump packages/pdfoundation/package.json（2 空格缩进 + 尾换行）。
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// 3. Publish（组件包 prepublishOnly 未设；publish 前已 build）。
step(`pnpm publish（${PKG_NAME}）`);
const publish = run(
	pnpm,
	["--filter", PKG_NAME, "publish", "--no-git-checks", "--access=public"],
	{ allowFailure: true },
);
if (publish.status !== 0) {
	console.error(
		`${C.red}npm publish failed — 版本已锚定在 ${next}。` +
			`\n  未产生任何 git 操作；可手动改回 packages/pdfoundation/package.json 的 version 后重试。${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

console.log(
	`\n${C.green}${C.bold}✅ Published ${PKG_NAME} v${current} → v${next}${C.reset}` +
		`\n${C.dim}bump 未提交（留在工作区），由你自行决定何时 commit。${C.reset}`,
);
