#!/usr/bin/env node
/**
 * One-command release for prompt-down（npm 包 + VSCode 扩展）。
 *
 *   npm run release patch   # 0.1.0 → 0.1.1
 *   npm run release minor   # 0.1.0 → 0.2.0   (patch zeroed)
 *   npm run release major   # 0.1.0 → 1.0.0   (minor + patch zeroed)
 *
 * 恰好需要 major | minor | patch 之一；更高层级 bump 会清零所有更低层级。
 *
 * Flow:
 *   validate arg → warn on dirty git tree (non-blocking) → typecheck + test
 *   + build → bump package.json → git commit `chore: release vX.Y.Z` +
 *   tag `vX.Y.Z` → `npm publish`（prepublishOnly 再门禁）→ `vsce package`
 *   生成 .vsix。若设置了 VSCODE_MARKETPLACE_TOKEN，则继续 `vsce publish`
 *   上传扩展市场。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - npm 包与 VSCode 扩展共用 package.json 的 version（单包设计）。
 *  - 发布的 tarball 只含 dist/docs/skill 等（.npmignore 控制），
 *    本脚本与 PLAN.md 不发布。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const BUMPS = ["major", "minor", "patch"];

const C = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

const arg = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: npm run release <${BUMPS.join("|")}>${C.reset}` +
			`\n  Bump the package version and publish (requires exactly one argument).` +
			`\n  Add --dry-run to preview without changing anything.`,
	);
	process.exit(1);
}
if (process.argv.slice(2).filter((a) => a !== "--dry-run").length > 1) {
	console.error(
		`${C.red}Exactly one of ${BUMPS.join("|")} is required.${C.reset}`,
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
		`${C.red}Unexpected package.json version: ${JSON.stringify(current)}${C.reset}`,
	);
	process.exit(1);
}

const [maj, min, pat] = current.split(".").map(Number);
let next;
if (arg === "major") next = `${maj + 1}.0.0`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

console.log(
	`${C.dim}release${C.reset} ${C.bold}${current}${C.reset} → ${C.bold}${C.green}${next}${C.reset} (${arg})`,
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

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const git = process.platform === "win32" ? "git.exe" : "git";

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(`  1. npm run typecheck && npm test && npm run build`);
	console.log(`  2. bump package.json version → ${next}`);
	console.log(
		`  3. git commit -m "chore: release v${next}" && git tag v${next}`,
	);
	console.log(`  4. npm publish --no-git-checks`);
	console.log(`  5. vsce package → prompt-down-${next}.vsix`);
	console.log(
		process.env.VSCODE_MARKETPLACE_TOKEN
			? `  6. vsce publish（检测到 VSCODE_MARKETPLACE_TOKEN）`
			: `  6. vsce publish（跳过：未设置 VSCODE_MARKETPLACE_TOKEN）`,
	);
	process.exit(0);
}

// Dirty-tree warning (non-blocking; publish uses --no-git-checks).
const dirty = run(git, ["status", "--porcelain"], { stdio: "pipe" })
	.stdout.toString()
	.trim();
if (dirty) {
	console.warn(
		`${C.yellow}Warning: uncommitted changes present:\n${dirty
			.split("\n")
			.map((l) => `  ${l}`)
			.join("\n")}${C.reset}`,
	);
}

// 1. Checks gate — abort before anything is changed if they fail.
step("typecheck + test + build");
run(npm, ["run", "typecheck"]);
run(npm, ["test"]);
run(npm, ["run", "build"]);

// 2. Bump package.json (preserve formatting: 2-space indent + trailing newline).
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// 3. Commit + tag.
step(`git commit + tag v${next}`);
run(git, ["add", "package.json"]);
run(git, ["commit", "-m", `chore: release v${next}`]);
run(git, ["tag", `v${next}`]);

// 4. Publish npm (prepublishOnly re-gates with typecheck + test + build).
step("npm publish");
const publish = run(npm, ["publish", "--no-git-checks"], { allowFailure: true });
if (publish.status !== 0) {
	console.error(
		`${C.red}Publish failed. The version bump is already committed + tagged as v${next}.` +
			`\n  To roll back: git tag -d v${next} && git reset --hard HEAD~1${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

// 5. Package VSCode extension (.vsix).
step("vsce package");
const vsce = run(npx, ["vsce", "package"], { allowFailure: true });
if (vsce.status !== 0) {
	console.warn(
		`${C.yellow}vsce package failed — npm 已发布，但 .vsix 未生成。` +
			`\n  可手动运行: npx vsce package${C.reset}`,
	);
} else {
	console.log(`${C.dim}vsix: ${ROOT}/prompt-down-${next}.vsix${C.reset}`);
}

// 6. Optional: publish to the VSCode Marketplace.
if (process.env.VSCODE_MARKETPLACE_TOKEN) {
	step("vsce publish");
	const vp = run(
		npx,
		["vsce", "publish", "--no-git-checks", "--skip-duplicate"],
		{ allowFailure: true },
	);
	if (vp.status !== 0) {
		console.warn(
			`${C.yellow}vsce publish failed — npm 包已发布，扩展需手动上传 .vsix。${C.reset}`,
		);
	}
}

console.log(
	`\n${C.green}${C.bold}✅ Released v${current} → v${next}${C.reset}` +
		`\n${C.dim}Tag: v${next} · commit: chore: release v${next} · npm + vsix${C.reset}`,
);
