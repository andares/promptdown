#!/usr/bin/env node
/**
 * One-command release for promptdown（pnpm 包 + VSCode 扩展）。
 *
 *   pnpm release patch            # npm 发布 + 打 tag 并推送：0.1.0 → 0.1.1
 *   pnpm release-all patch        # npm + VSCode 一起发：npm 失败中止，vsce 失败降级为只发 npm
 *
 * 模式：
 * - release：sync（未提交改动 → git add -A + commit；本地领先 → push 分支，
 *   失败中止；本地落后 → 中止提示 pull；没有 → 跳过）→
 *   门禁 → bump(major|minor|patch) → commit+tag → pnpm publish（失败中止）
 *   → git push origin <当前分支> refs/tags/v{next}（best-effort，失败仅警告）→
 *   创建 GitHub Release v{next}（best-effort：未设 GITHUB_TOKEN / tag 未到远端 /
 *   已存在 / 失败都只提示、不中止）。
 *   不做 vsce package/publish。
 * - release-all：同 release（前面所有步骤一个不少），npm 成功后额外跑
 *   vsce package + publish——vsce 凭据（VSCE_PAT 环境变量或 `vsce login` 存的
 *   ~/.vsce 文件）缺失或发布失败时降级：只提示、不中止，结果 = 仅 npm 已发布
 *   （可稍后手动补发扩展）。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - pnpm 包与 VSCode 扩展共用 package.json 的 version（单包设计）。
 *  - npm registry 上 `promptdown` 已被他人占用，发布 npm 用 publishConfig.name 声明
 *    scoped 名 `@andares/promptdown`（--access=public）；package.json 的 name 保持
 *    `promptdown` 供 vsce 使用（扩展 ID = andares.promptdown）。
 *  - 发布的 tarball 只含 dist/docs/skill 等（.npmignore 控制——pnpm
 *    复用 npm 的发布文件机制），本脚本与 PLAN.md 不发布。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const BUMPS = ["major", "minor", "patch"];

const NPM_NAME = "@andares/promptdown";
const curl = process.platform === "win32" ? "curl.exe" : "curl";

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
const mode = positional[0] === "all" ? "all" : "release";
const arg = mode === "all" ? positional[1] : positional[0];

if (mode === "release" && !BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release <${BUMPS.join("|")}>${C.reset}` +
			`\n  Bump the package version, publish npm, then push branch + tags (exactly one argument).` +
			`\n  Add --dry-run to preview without changing anything.`,
	);
	process.exit(1);
}
if (mode === "all" && !BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release-all <${BUMPS.join("|")}>${C.reset}` +
			`\n  Bump and publish npm + VSCode; npm failure aborts, vsce failure degrades to npm-only.` +
			`\n  Add --dry-run to preview without changing anything.`,
	);
	process.exit(1);
}
if (positional.length > (mode === "all" ? 2 : 1)) {
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
		`${C.red}Unexpected package.json version: ${JSON.stringify(current)}${C.reset}`,
	);
	process.exit(1);
}

const [maj, min, pat] = current.split(".").map(Number);
let next;
if (arg === "major") next = `${maj + 1}.0.0`;
else if (arg === "minor") next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

// GitHub 仓库 owner/repo（用于 REST API），从 package.json repository.url 解析。
const repoMatch = pkg.repository?.url?.match(
	/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/,
);
const ghRepo = repoMatch
	? `${repoMatch[1]}/${repoMatch[2]}`
	: "andares/promptdown";

console.log(
	`${C.dim}${mode}${C.reset} ${C.bold}${current}${C.reset} → ${C.bold}${C.green}${next}${C.reset} (${arg})`,
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

function tagExists(tag) {
	return (
		run(git, ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
			stdio: "pipe",
			allowFailure: true,
		}).status === 0
	);
}

// vsce 认证可用性：VSCE_PAT 环境变量，或 `vsce login` 存的凭据文件
// ~/.vsce（keytar 原生模块在本机未编译，vsce 降级为明文文件存储）。
// 两者都没有时才需要拦截（避免 vsce 交互式等待输入 PAT 而挂起）。
function vsceCredentialAvailable() {
	if (process.env.VSCE_PAT) return true;
	try {
		const store = JSON.parse(readFileSync(join(homedir(), ".vsce"), "utf8"));
		return (
			store.publishers?.some((p) => p.name === pkg.publisher && p.pat) ?? false
		);
	} catch {
		return false;
	}
}

const vsceCred = vsceCredentialAvailable();

const branch = run(git, ["branch", "--show-current"], {
	stdio: "pipe",
	allowFailure: true,
})
	.stdout.toString()
	.trim();
if (!branch) {
	console.error(
		`${C.red}无法确定当前分支（detached HEAD？）— 中止。` +
			`请在目标分支上运行 release。${C.reset}`,
	);
	process.exit(1);
}

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(
		`  0. sync：未提交改动 → git add -A + commit；未推送 → git push origin ${branch}（无则跳过）`,
	);
	console.log(`  1. pnpm typecheck && pnpm test && pnpm build`);
	console.log(`  2. bump package.json version → ${next}`);
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
	console.log(
		`  4. pnpm publish --no-git-checks --access=public（publishConfig.name: ${NPM_NAME}）`,
	);
	console.log(
		`  5. git push origin ${branch} refs/tags/v${next}（best-effort）`,
	);
	console.log(
		`  6. 创建 GitHub Release v${next}` +
			(process.env.GITHUB_TOKEN
				? ""
				: `（未设置 GITHUB_TOKEN → 跳过 Release）`),
	);
	if (mode === "all") {
		console.log(
			`  7. pnpm exec vsce package --no-dependencies → promptdown-${next}.vsix`,
		);
		console.log(
			vsceCred
				? `  8. pnpm exec vsce publish（release-all 必走，检测到凭据）`
				: `  8. pnpm exec vsce publish（release-all 必走，但无 vsce 凭据 → 仅提示）`,
		);
	} else {
		console.log(`     （release 模式：到此为止，无 vsce 步骤）`);
	}
	process.exit(0);
}
// 0. Sync — 把未同步的改动先落到 git 并推到远端，保证后续的 release
//    commit 与 tag 建立在"线上最新代码"之上（不会出现"文件没提交但打了 tag"）：
//    - 未提交改动 → git add -A + commit
//    - 本地领先远端（未推送 commit）→ git push origin <branch>（失败中止）
//    - 都没有 → 跳过（不推）
//    dist/ 已被 .gitignore 忽略，门禁 build 产物不会混入。
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
	// 本地落后远端：push 会被拒（non-fast-forward），且 bump 会基于旧代码——
	// 提前中止，避免发布出旧代码版本或 tag 无法推送。
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
				`\n  请先同步（git pull --rebase origin ${branch}）再重跑 release。${C.reset}`,
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
		run(git, ["push", "origin", branch]); // 失败中止：tag 必须建立在已推送的代码上
		console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
	} else {
		console.log(`${C.dim}无未推送 commit，跳过 push${C.reset}`);
	}
} else {
	console.log(`${C.dim}远端无 origin/${branch} 分支，将全量推送${C.reset}`);
	run(git, ["push", "origin", branch]); // 失败中止
	console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
}

// 1. Checks gate — abort before anything is changed if they fail.
step("typecheck + test + build");
run(pnpm, ["typecheck"]);
run(pnpm, ["test"]);
run(pnpm, ["build"]);

// 2. Bump package.json (preserve formatting: 2-space indent + trailing newline).
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

// 3. Commit，然后调用 tag-current.mjs 打 tag（内部检测已存在 → 不重复打）。
// 此时 package.json 已是新版本，打出的 v${next} 恰好指向 release commit。
step(`git commit + tag v${next}`);
run(git, ["add", "package.json"]);
run(git, ["commit", "-m", `chore: release v${next}`]);
run(process.execPath, [join(ROOT, "scripts", "tag-current.mjs")]);

// 4. Publish pnpm (prepublishOnly re-gates with typecheck + test + build).
// 包名走 package.json 的 publishConfig.name（@andares/promptdown），不再临时改 package.json。
// package.json 的 name 保持 promptdown（vsce 需要非 scoped 名，扩展 ID = andares.promptdown）。
step(`pnpm publish（publishConfig.name: ${NPM_NAME}）`);
const publish = run(pnpm, ["publish", "--no-git-checks", "--access=public"], {
	allowFailure: true,
});
if (publish.status !== 0) {
	console.error(
		`${C.red}npm publish failed — 流程中止（版本已锚定在 ${next}）。` +
			`\n  To roll back: git tag -d v${next} && git reset --hard HEAD~1${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

// 5. push 分支 + tags（两种模式都做；失败仅警告——可能此前已推过）。
//    然后创建 GitHub Release v${next}（两种模式都做，best-effort：
//    未设 token / 已存在 / 失败都只提示，不中止）。
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
	).status !== 0
) {
	// push 是 best-effort，可能失败——此时 GitHub 会为不存在的 tag 自动
	// 创建指向远程默认分支 tip 的 Release，内容错误，故先跳过创建。
	console.warn(
		`${C.yellow}tag v${next} 尚未推送到远端 — 跳过 GitHub Release 创建。` +
			`\n  稍后可手动: git push origin refs/tags/v${next}，再手动创建 Release。${C.reset}`,
	);
} else {
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
		// POST 失败后查询确认——release 可能已存在（并发/重试/手动补建），
		// 幂等处理：查询返回 200 即视为成功，不再重复创建。
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
}

// 6. Package VSCode extension (.vsix).（仅 release-all）
if (mode === "all") {
	step("pnpm exec vsce package --no-dependencies");
	const vsce = run(pnpm, ["exec", "vsce", "package", "--no-dependencies"], {
		allowFailure: true,
	});
	if (vsce.status !== 0) {
		console.warn(
			`${C.yellow}vsce package failed — pnpm 已发布，但 .vsix 未生成。` +
				`\n  可手动运行: pnpm exec vsce package --no-dependencies${C.reset}`,
		);
	} else {
		console.log(`${C.dim}vsix: ${ROOT}/promptdown-${next}.vsix${C.reset}`);
	}
}

// 7. Publish to the VSCode Marketplace.（仅 release-all）
if (mode === "all") {
	step("pnpm exec vsce publish");
	if (!vsceCred) {
		console.warn(
			`${C.yellow}无 vsce 凭据（VSCE_PAT 未设置，~/.vsce 也没有 publisher 凭据）— 无法发布扩展。` +
				`npm 已发布 v${next}，` +
				`\n  稍后可手动: pnpm exec vsce login andares 或 export VSCE_PAT=... && pnpm exec vsce publish${C.reset}`,
		);
	} else {
		const vp = run(
			pnpm,
			["exec", "vsce", "publish", "--skip-duplicate", "--no-dependencies"],
			{ allowFailure: true },
		);
		if (vp.status !== 0) {
			console.warn(
				`${C.yellow}vsce publish failed — npm 已发布 v${next}，扩展需手动上传 .vsix。${C.reset}`,
			);
		}
	}
}

console.log(
	`\n${C.green}${C.bold}✅ Released v${current} → v${next}${C.reset}` +
		`\n${C.dim}Tag: v${next} · commit: chore: release v${next} · pnpm + GitHub Release` +
		(mode === "all" ? ` + vsix` : ``) +
		`${C.reset}`,
);
