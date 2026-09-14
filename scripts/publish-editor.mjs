#!/usr/bin/env node
/**
 * One-command release for @andares/pdeditor（Web 输入框组件）。
 *
 *   pnpm release-editor patch            # 纯 npm 发布：0.1.0 → 0.1.1
 *
 * 流程（纯 npm，不做任何 git 操作）：
 * 组件包门禁（typecheck + test + build）→ bump packages/editor/package.json
 * version → CHANGELOG 归档（packages/editor/CHANGELOG.dev.md 开发期条目 →
 * packages/editor/CHANGELOG.md 顶部 "## X.Y.Z (YYYY-MM-DD)"，删 dev 文件；无则提示跳过）
 * → pnpm publish。
 *
 * 不做：sync / commit / tag / push / GitHub Release——editor 是独立版本号的库，
 * 其版本不进入 promptdown 仓库的 git 历史与 tag（仓库 tag 体系是 v{主包版本}）。
 * bump 与 changelog 归档的改动留在工作区，由使用者自行决定何时提交。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - 组件包名就是 @andares/pdeditor（package.json name 即 scoped 名，无改名问题）。
 *  - 门禁在 packages/editor 内跑（pnpm --filter @andares/pdeditor ...）。
 *  - 版本独立于主包（@andares/pdeditor 与 @andares/promptdown 各自管理版本）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages", "editor");
const PKG_PATH = join(PKG_DIR, "package.json");
const CHANGELOG_PATH = join(PKG_DIR, "CHANGELOG.md");
const DEV_CHANGELOG_PATH = join(PKG_DIR, "CHANGELOG.dev.md");
const BUMPS = ["major", "minor", "patch"];
const PKG_NAME = "@andares/pdeditor";

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
		`${C.red}${C.bold}Usage: pnpm release-editor <${BUMPS.join("|")}>${C.reset}` +
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
	`${C.dim}release-editor${C.reset} ${C.bold}${current}${C.reset} → ${C.bold}${C.green}${next}${C.reset} (${arg})`,
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
	console.log(`  2. bump packages/editor/package.json version → ${next}`);
	console.log(
		`  3. CHANGELOG.dev.md 存在且有内容 → 归档为 packages/editor/CHANGELOG.md 顶部 "## ${next} (YYYY-MM-DD)"（无则提示跳过）`,
	);
	console.log(`  4. pnpm publish（${PKG_NAME}）`);
	console.log(
		`  （纯 npm 流程：不 commit、不打 tag、不 push、不建 GitHub Release；bump 与 changelog 归档留在工作区）`,
	);
	process.exit(0);
}

// 1. Checks gate（组件包门禁）— 失败即中止，未改动任何东西。
step("typecheck + test + build（组件包）");
run(pnpm, ["--filter", PKG_NAME, "typecheck"]);
run(pnpm, ["--filter", PKG_NAME, "test"]);
run(pnpm, ["--filter", PKG_NAME, "build"]);

// 2. Bump packages/editor/package.json（2 空格缩进 + 尾换行）。
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// 2.5 CHANGELOG 归档：开发期条目（packages/editor/CHANGELOG.dev.md）→ CHANGELOG.md 顶部。
//     版本号发布时才确定，开发期不预写；dev 文件归档后删除，改动留在工作区（无 git 操作）。
step(`CHANGELOG.dev.md → CHANGELOG.md 顶部 "## ${next} (日期)"（归档开发期条目）`);
if (existsSync(DEV_CHANGELOG_PATH)) {
	const devRaw = readFileSync(DEV_CHANGELOG_PATH, "utf8");
	// 去掉头部说明块（标题 + 引用块），只留条目
	const entries = devRaw
		.split("\n")
		.filter((l) => !l.startsWith("#") && !l.startsWith(">"))
		.join("\n")
		.trim();
	if (entries === "") {
		console.log(
			`${C.yellow}CHANGELOG.dev.md 无条目（纯说明/空白），跳过归档${C.reset}`,
		);
	} else if (!existsSync(CHANGELOG_PATH)) {
		console.error(
			`${C.red}packages/editor/CHANGELOG.md 不存在，无法归档 — 中止。` +
				`\n  请先按纪律建立该文件（顶部含 "# Changelog" 标题）。${C.reset}`,
		);
		process.exit(1);
	} else {
		const changelog = readFileSync(CHANGELOG_PATH, "utf8");
		const heading = "# Changelog";
		const idx = changelog.indexOf(heading);
		if (idx === -1) {
			console.error(
				`${C.red}CHANGELOG.md 缺少 "# Changelog" 标题锚点，无法归档 — 中止。${C.reset}`,
			);
			process.exit(1);
		}
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		// 插到首个已有 "## " 版本章节之前（最新在前；说明块/引用块在其上方保留）；
		// 无已有章节时退回标题行之后。
		const firstSection = changelog.indexOf("\n## ");
		let insertAt;
		if (firstSection !== -1) {
			insertAt = firstSection + 1;
		} else {
			const lineEnd = changelog.indexOf("\n", idx);
			insertAt = lineEnd === -1 ? changelog.length : lineEnd + 1;
		}
		const section = `## ${next} (${today})\n\n${entries}\n\n`;
		writeFileSync(
			CHANGELOG_PATH,
			changelog.slice(0, insertAt) + section + changelog.slice(insertAt),
			"utf8",
		);
		rmSync(DEV_CHANGELOG_PATH);
		console.log(
			`${C.green}已归档 ${entries.split("\n").filter((l) => l.trimStart().startsWith("- ")).length} 条到 "## ${next} (${today})"${C.reset}`,
		);
	}
} else {
	console.log(
		`${C.yellow}无 packages/editor/CHANGELOG.dev.md（本次发布无开发期变更记录），跳过归档${C.reset}`,
	);
}

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
			`\n  未产生任何 git 操作；工作区可能已有三处改动需手动回退：` +
			`\n  ① packages/editor/package.json（version bump）` +
			`\n  ② packages/editor/CHANGELOG.md（若已归档）` +
			`\n  ③ packages/editor/CHANGELOG.dev.md（已删除——可用 git checkout 恢复）` +
			`\n  回退后重试。${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

console.log(
	`\n${C.green}${C.bold}✅ Published ${PKG_NAME} v${current} → v${next}${C.reset}` +
		`\n${C.dim}bump 与 changelog 归档未提交（留在工作区），由你自行决定何时 commit。${C.reset}`,
);
