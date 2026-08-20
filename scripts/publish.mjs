#!/usr/bin/env node
/**
 * One-command release for promptdown（pnpm 主包 + @andares/pdfoundation + VSCode 扩展）。
 *
 *   pnpm release-all patch        # 一键：foundation（版本与主包同号）→ 主包 npm → 打 tag 推送 → vsce
 *
 * 模式（2026-08 起收敛）：
 * - 发布入口只剩两个：`pnpm release-all`（本脚本）与 `pnpm release-editor`（editor 包独立）。
 * - `pnpm release`（独立 npm 发布）已移除：主包与 foundation 强绑定，必须走 release-all，
 *   防止漏发 foundation 或版本脱节。误敲 `pnpm release` 会得到明确报错提示。
 * - `release-foundation` 已并入本脚本：foundation 版本号**与主包完全同号**（本次在
 *   publish-all 里把 foundation package.json 的 version 写为与主包一致的 next），
 *   顺序 fix：先发 foundation 到 npm → 再发主包（主包 tarball 里 workspace:^ 会自动改写出实际版本）。
 *
 * 流程（一个步骤都不能少）：
 *   sync（未提交 → git add -A + commit；本地领先 → push；落后 → 中止）→
 *   门禁（typecheck + test + build，含 foundation）→
 *   bump 主包 version + 同步 bump foundation version（同号）→ commit + tag → 发 foundation → 发主包 →
 *   git push 分支 + tag → GitHub Release（best-effort）→ vsce package + publish（失败降级只发 npm）。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - npm registry 上 `promptdown` 被占用，主包 publishConfig.name = @andares/promptdown（--access=public）；
 *    foundation 包名即 @andares/pdfoundation（scoped，--access=public）。
 *  - foundation 没有独立 tag/git 操作：它不新开 commit，版本号随主包 release commit 一起进 git。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const FOUNDATION_PKG_PATH = join(ROOT, "packages", "pdfoundation", "package.json");
const BUMPS = ["major", "minor", "patch"];

const NPM_NAME = "@andares/promptdown";
const FOUNDATION_NAME = "@andares/pdfoundation";
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

// 只接受 all 模式（本脚本即 all）：主包 + foundation 强绑定，独立 npm 发布不再单独提供。
// 拦截旧命令形态（release / release-all all）与无参/非法参数，防误操作。
if (positional[0] === "release" || positional[0] === "all") {
	console.error(
		`${C.red}${C.bold}独立 npm 发布已合并进 release-all（foundation 与主包同号强绑定）。${C.reset}` +
			`\n  请使用: pnpm release-all <${BUMPS.join("|")}> [--dry-run]${C.reset}` +
			`\n  editor 独立发布: pnpm release-editor <${BUMPS.join("|")}> [--dry-run]${C.reset}`,
	);
	process.exit(1);
}
const arg = positional[0];
if (!BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release-all <${BUMPS.join("|")}> [--dry-run]${C.reset}` +
			`\n  Bump + publish @andares/pdfoundation → @andares/promptdown → vsce; npm failure aborts, vsce failure degrades.`,
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
	`${C.dim}release-all${C.reset} ${C.bold}${current}${C.reset} → ${C.bold}${C.green}${next}${C.reset} (${arg})` +
		` · foundation 同号 ${C.bold}${FOUNDATION_NAME}@${next}${C.reset}`,
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
			`请在目标分支上运行 release-all。${C.reset}`,
	);
	process.exit(1);
}

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(
		`  0. sync：未提交改动 → git add -A + commit；未推送 → git push origin ${branch}（无则跳过）`,
	);
	console.log(`  1. pnpm typecheck && pnpm test && pnpm build（含 foundation 门禁）`);
	console.log(
		`  2. bump 主包 package.json version → ${next} + 同步 bump packages/pdfoundation version → ${next}（同号绑定）`,
	);
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
		`  4. pnpm --filter ${FOUNDATION_NAME} publish --no-git-checks --access=public（foundation v${next}）`,
	);
	console.log(
		`  5. pnpm publish --no-git-checks --access=public（publishConfig.name: ${NPM_NAME}，workspace:^ → ^${next}）`,
	);
	console.log(
		`  6. git push origin ${branch} refs/tags/v${next}（best-effort）`,
	);
	console.log(
		`  7. 创建 GitHub Release v${next}` +
			(process.env.GITHUB_TOKEN
				? ""
				: `（未设置 GITHUB_TOKEN → 跳过 Release）`),
	);
	console.log(
		`  8. pnpm exec vsce package --no-dependencies → promptdown-${next}.vsix`,
	);
	console.log(
		vsceCred
			? `  9. pnpm exec vsce publish（检测到凭据）`
			: `  9. pnpm exec vsce publish（无 vsce 凭据 → 仅提示，npm 已发布）`,
	);
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
				`\n  请先同步（git pull --rebase origin ${branch}）再重跑 release-all。${C.reset}`,
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
//    含 foundation 门禁（主包 build 链已触发 foundation build；这里补 test）。
step("typecheck + test + build（含 foundation）");
run(pnpm, ["typecheck"]);
run(pnpm, ["test"]);
run(pnpm, ["--filter", FOUNDATION_NAME, "test"]);
run(pnpm, ["build"]);

// 2. Bump 主包 version + 同步 bump foundation version（同号绑定）。
//    格式化保持 2-space indent + trailing newline。
step(`bump 主包 + foundation 版本 → ${next}（同号）`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

let fpkg;
try {
	fpkg = JSON.parse(readFileSync(FOUNDATION_PKG_PATH, "utf8"));
} catch {
	console.error(
		`${C.red}packages/pdfoundation/package.json is missing or not valid JSON: ${FOUNDATION_PKG_PATH}${C.reset}`,
	);
	process.exit(1);
}
if (typeof fpkg.version !== "string") {
	console.error(
		`${C.red}Unexpected foundation package.json version: ${JSON.stringify(fpkg.version)}${C.reset}`,
	);
	process.exit(1);
}
if (fpkg.version !== current) {
	console.warn(
		`${C.yellow}注意：foundation 当前版本 ${fpkg.version} 与主包 ${current} 不一致` +
			`（绑定前历史遗留）。本次将直接同步为 ${next}。${C.reset}`,
	);
}
fpkg.version = next;
writeFileSync(
	FOUNDATION_PKG_PATH,
	`${JSON.stringify(fpkg, null, 2)}\n`,
	"utf8",
);

// 3. Commit，然后调用 tag-current.mjs 打 tag（内部检测已存在 → 不重复打）。
//    两个 package.json 的 version 均已在 commit 中体现；v${next} 指向 release commit。
step(`git commit + tag v${next}`);
run(git, ["add", "package.json", FOUNDATION_PKG_PATH]);
run(git, ["commit", "-m", `chore: release v${next}`]);
run(process.execPath, [join(ROOT, "scripts", "tag-current.mjs")]);

// 4. 先发 foundation：主包 tarball 里 workspace:^ 在发布时被 pnpm 改写为 ^${next}，
//    所以 foundation 必须先上 npm（否则主包发布后消费者装不到依赖）。
//    foundation 无 prepublishOnly，发布前门禁已含它的 test/build。
step(`pnpm --filter ${FOUNDATION_NAME} publish（foundation v${next}）`);
const fpub = run(
	pnpm,
	["--filter", FOUNDATION_NAME, "publish", "--no-git-checks", "--access=public"],
	{ allowFailure: true },
);
if (fpub.status !== 0) {
	console.error(
		`${C.red}foundation publish failed — 流程中止（版本已锚定在 ${next}）。` +
			`\n  未产生 npm 发布；git 侧有一个 release commit（可保留或 reset）。${C.reset}`,
	);
	process.exit(fpub.status ?? 1);
}

// 5. Publish 主包（prepublishOnly 再跑门禁）。
step(`pnpm publish（publishConfig.name: ${NPM_NAME}）`);
const publish = run(pnpm, ["publish", "--no-git-checks", "--access=public"], {
	allowFailure: true,
});
if (publish.status !== 0) {
	console.error(
		`${C.red}主包 npm publish failed — 流程中止（版本已锚定在 ${next}）。${C.reset}` +
			`\n  foundation v${next} 已发布到 npm、无法撤回（npm 不支持删版本）。` +
			`\n  git 回滚: git tag -d v${next} && git reset --hard HEAD~1` +
			`\n  重跑 release-all 将 bump 到下一版本，foundation 会跳号跟随（无害）。${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

// 6. push 分支 + tags（失败仅警告——可能此前已推过）。
//    然后创建 GitHub Release v${next}（best-effort：未设 token / 已存在 / 失败都只提示）。
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

// 7. Package VSCode extension (.vsix)。（失败降级为只发 npm）
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

// 8. Publish to the VSCode Marketplace.（凭据缺失 → 降级提示）
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

console.log(
	`\n${C.green}${C.bold}✅ Released v${current} → v${next}${C.reset}` +
		`\n${C.dim}Tag: v${next} · commit: chore: release v${next} · @andares/pdfoundation@${next} + npm + GitHub Release + vsix${C.reset}`,
);
