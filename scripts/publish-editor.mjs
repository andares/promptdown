#!/usr/bin/env node
/**
 * One-command release for @andares/pdeditor（Web 输入框组件）。
 *
 *   pnpm release-editor patch            # 发布组件包 + 打 tag 并推送：0.1.0 → 0.1.1
 *
 * 流程（与主包 publish.mjs 同模式，去掉 vsce 步骤）：
 * sync（未提交改动 → git add -A + commit；本地领先 → push 分支，失败中止；
 * 本地落后 → 中止提示 pull；没有 → 跳过）→ 组件包门禁（typecheck + test + build）
 * → bump packages/editor/package.json version → commit+tag → pnpm publish（失败中止）
 * → git push origin <当前分支> refs/tags/v{next}（best-effort）→
 * 创建 GitHub Release v{next}（best-effort：未设 GITHUB_TOKEN / tag 未到远端 /
 * 已存在 / 失败都只提示、不中止）。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - 组件包名就是 @andares/pdeditor（package.json name 即 scoped 名，无改名问题）。
 *  - 门禁在 packages/editor 内跑（pnpm --filter @andares/pdeditor ...）。
 *  - 版本独立于主包（@andares/pdeditor 与 @andares/promptdown 各自管理版本）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages", "editor");
const PKG_PATH = join(PKG_DIR, "package.json");
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
			`\n  Bump ${PKG_NAME} version, publish npm, then push branch + tags (exactly one argument).` +
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

// GitHub 仓库 owner/repo（用于 REST API），从根 package.json repository.url 解析。
let rootPkg = {};
try {
	rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
} catch {
	// 根 package.json 缺失/非法——不影响组件包发布本身，仅影响 GitHub Release 创建
}
const repoMatch = rootPkg.repository?.url?.match(
	/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
);
const ghRepo = repoMatch
	? `${repoMatch[1]}/${repoMatch[2]}`
	: "andares/promptdown";

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
const git = process.platform === "win32" ? "git.exe" : "git";
const curl = process.platform === "win32" ? "curl.exe" : "curl";

function tagExists(tag) {
	return (
		run(git, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
			stdio: "pipe",
			allowFailure: true,
		}).status === 0
	);
}

const branch = run(git, ["branch", "--show-current"], {
	stdio: "pipe",
	allowFailure: true,
})
	.stdout.toString()
	.trim();
if (!branch) {
	console.error(
		`${C.red}无法确定当前分支（detached HEAD？）— 中止。` +
			`请在目标分支上运行 release-editor。${C.reset}`,
	);
	process.exit(1);
}

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(
		`  0. sync：未提交改动 → git add -A + commit；未推送 → git push origin ${branch}（无则跳过）`,
	);
	console.log(`  1. pnpm --filter ${PKG_NAME} typecheck && test && build`);
	console.log(`  2. bump packages/editor/package.json version → ${next}`);
	if (tagExists(`v${next}`)) {
		const tagCommit = run(
			git,
			["rev-parse", "-q", "--verify", `refs/tags/v${next}^{commit}`],
			{
				stdio: "pipe",
				allowFailure: true,
			},
		)
			.stdout.toString()
			.trim();
		const head = run(git, ["rev-parse", "HEAD"], { stdio: "pipe" })
			.stdout.toString()
			.trim();
		if (tagCommit === head) {
			console.log(
				`  3. git commit -m "chore: release v${next}" + tag-current（tag v${next} 已存在且指向 HEAD，跳过打 tag）`,
			);
		} else {
			console.log(
				`  3. git commit -m "chore: release v${next}" 后 tag-current 将报错（tag v${next} 指向 ${tagCommit.slice(0, 8)}，不是当前 HEAD）`,
			);
		}
	} else {
		console.log(
			`  3. git commit -m "chore: release v${next}" + tag-current（git tag v${next}）`,
		);
	}
	console.log(`  4. pnpm publish（${PKG_NAME}）`);
	console.log(
		`  5. git push origin ${branch} refs/tags/v${next}（best-effort）`,
	);
	console.log(
		`  6. 创建 GitHub Release v${next}` +
			(process.env.GITHUB_TOKEN ? "" : `（未设置 GITHUB_TOKEN → 跳过 Release）`),
	);
	process.exit(0);
}

// 0. Sync（与主包同逻辑）。
step("sync（未提交改动 → commit；未推送 → push）");
const dirty = run(git, ["status", "--porcelain"], { stdio: "pipe" })
	.stdout.toString()
	.trim();
if (dirty) {
	console.log(
		`${C.dim}工作区有 ${dirty.split("\n").length} 个未提交文件，将全部提交：\n${dirty
			.split("\n")
			.map((l) => `  ${l}`)
			.join("\n")}${C.reset}`,
	);
	run(git, ["add", "-A"]);
	run(git, ["commit", "-m", "chore: sync uncommitted changes before release"]);
	console.log(`${C.green}✅ 已提交${C.reset}`);
} else {
	console.log(`${C.dim}工作区干净，无未提交改动${C.reset}`);
}
const upstreamRef = `refs/remotes/origin/${branch}`;
const hasUpstream =
	run(git, ["rev-parse", "-q", "--verify", upstreamRef], {
		stdio: "pipe",
		allowFailure: true,
	}).status === 0;
if (hasUpstream) {
	const behind =
		parseInt(
			run(git, ["rev-list", "--count", `HEAD..${upstreamRef}`], {
				stdio: "pipe",
			})
				.stdout.toString()
				.trim(),
			10,
		) || 0;
	if (behind > 0) {
		console.error(
			`${C.red}本地落后 origin/${branch} ${behind} 个 commit — 中止。` +
				`\n  请先同步（git pull --rebase origin ${branch}）再重跑 release-editor。${C.reset}`,
		);
		process.exit(1);
	}
	const ahead =
		parseInt(
			run(git, ["rev-list", "--count", `${upstreamRef}..HEAD`], {
				stdio: "pipe",
			})
				.stdout.toString()
				.trim(),
			10,
		) || 0;
	if (ahead > 0) {
		console.log(
			`${C.dim}本地领先 origin/${branch} ${ahead} 个 commit，将推送${C.reset}`,
		);
		run(git, ["push", "origin", branch]);
		console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
	} else {
		console.log(`${C.dim}无未推送 commit，跳过 push${C.reset}`);
	}
} else {
	console.log(`${C.dim}远端无 origin/${branch} 分支，将全量推送${C.reset}`);
	run(git, ["push", "origin", branch]);
	console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
}

// 1. Checks gate（组件包门禁）。
step("typecheck + test + build（组件包）");
run(pnpm, ["--filter", PKG_NAME, "typecheck"]);
run(pnpm, ["--filter", PKG_NAME, "test"]);
run(pnpm, ["--filter", PKG_NAME, "build"]);

// 2. Bump packages/editor/package.json（2 空格缩进 + 尾换行）。
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// 3. Commit + tag。
step(`git commit + tag v${next}`);
run(git, ["add", PKG_PATH]);
run(git, ["commit", "-m", `chore: release editor v${next}`]);
run(process.execPath, [join(ROOT, "scripts", "tag-current.mjs")]);

// 4. Publish（组件包 prepublishOnly 未设；publish 前确保已 build）。
step(`pnpm publish（${PKG_NAME}）`);
const publish = run(
	pnpm,
	["--filter", PKG_NAME, "publish", "--no-git-checks", "--access=public"],
	{ allowFailure: true },
);
if (publish.status !== 0) {
	console.error(
		`${C.red}npm publish failed — 流程中止（版本已锚定在 ${next}）。` +
			`\n  To roll back: git tag -d v${next} && git reset --hard HEAD~1${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

// 5. push 分支 + tags + GitHub Release（best-effort）。
step("git push（分支 + tag）");
const push = run(git, ["push", "origin", branch, `refs/tags/v${next}`], {
	allowFailure: true,
});
if (push.status !== 0) {
	console.warn(
		`${C.yellow}git push 失败（可能此前已推过，可忽略）。` +
			`若远端还没有 tag v${next}，Release 将无法指向 release commit。${C.reset}`,
	);
}
if (!process.env.GITHUB_TOKEN) {
	console.warn(
		`${C.yellow}未设置 GITHUB_TOKEN — 跳过 GitHub Release 创建。` +
			`npm 已发布 v${next}，可稍后手动创建 release。${C.reset}`,
	);
} else if (
	run(
		git,
		["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/v${next}`],
		{
			stdio: "pipe",
			allowFailure: true,
		},
	).status === 0
) {
	const rel = run(
		curl,
		[
			"-sS",
			"-X",
			"POST",
			"-H",
			"Accept: application/vnd.github+json",
			"-H",
			"X-GitHub-Api-Version: 2022-11-28",
			"-H",
			`Authorization: Bearer ${process.env.GITHUB_TOKEN}`,
			"-w",
			"\n%{http_code}",
			"-d",
			JSON.stringify({
				tag_name: `v${next}`,
				name: `v${next}`,
				generate_release_notes: true,
			}),
			`https://api.github.com/repos/${ghRepo}/releases`,
		],
		{ allowFailure: true, stdio: "pipe" },
	);
	const lines = rel.stdout.toString().trimEnd().split("\n");
	const code = lines.pop()?.trim() ?? "";
	if (rel.status === 0 && code === "201") {
		console.log(`${C.green}GitHub Release v${next} 创建成功${C.reset}`);
	} else {
		const chk = run(
			curl,
			[
				"-sS",
				"-o",
				"/dev/null",
				"-w",
				"%{http_code}",
				"-H",
				`Authorization: Bearer ${process.env.GITHUB_TOKEN}`,
				`https://api.github.com/repos/${ghRepo}/releases/tags/v${next}`,
			],
			{ allowFailure: true, stdio: "pipe" },
		);
		const chkCode = chk.stdout.toString().trim();
		if (chkCode === "200") {
			console.warn(
				`${C.yellow}POST 返回 HTTP ${code || "?"}，但查询确认 Release v${next} 已存在，跳过（不重复创建）${C.reset}`,
			);
		} else {
			console.warn(
				`${C.yellow}GitHub Release 创建失败（POST HTTP ${code || "?"}，按 tag 查询 ${chkCode || "?"}）。` +
					`npm 已发布 v${next}，可稍后手动创建。${C.reset}`,
			);
		}
	}
} else {
	console.warn(
		`${C.yellow}tag v${next} 尚未推送到远端 — 跳过 GitHub Release 创建。` +
			`\n  稍后可手动: git push origin refs/tags/v${next}，再手动创建 Release。${C.reset}`,
	);
}

console.log(
	`\n${C.green}${C.bold}✅ Released ${PKG_NAME} v${current} → v${next}${C.reset}` +
		`\n${C.dim}Tag: v${next} · commit: chore: release editor v${next} · pnpm + GitHub Release${C.reset}`,
);
