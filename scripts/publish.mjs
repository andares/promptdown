#!/usr/bin/env node
/**
 * One-command release for promptdown（pnpm 主包 + @andares/pdfoundation + VSCode 扩展）。
 *
 *   pnpm release-all patch        # 准备 + 推 tag → CI 发 foundation 与主包（OIDC，无 token）
 *   pnpm release-all patch --prepare-only   # 只准备到本地 tag，不推
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
 *   门禁（build → typecheck → test，含 foundation）→
 *   bump 主包 version + 同步 bump foundation version（同号）→
 *   CHANGELOG 归档（CHANGELOG.dev.md 开发期条目 → CHANGELOG.md 顶部 "## X.Y.Z (YYYY-MM-DD)"，删 dev 文件；无则提示跳过）→
 *   commit + tag v{next} → **git push 分支 + tag**（发版动作）→
 *   轮询 npm 确认 foundation 与主包均已发布且带 provenance（失败中止；`--no-wait` 跳过）→
 *   GitHub Release（best-effort）→ vsce package + publish（失败降级）。
 *
 * 发版语义（2026-11 起）：**tag 是发版意图，CI 是发版执行**。本脚本不再写 registry；
 * 推 `vX.Y.Z` 会触发 `.github/workflows/publish.yml`，由它用 OIDC trusted publishing
 * 先发 `@andares/pdfoundation`、再发 `@andares/promptdown`（同号），不涉及任何 token。
 * 本地 npm token 降级为「读取 + 应急 staging」。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 * `--prepare-only` 停在 push 之前，打印推送命令。
 *
 * 注意：
 *  - npm registry 上 `promptdown` 被占用，主包 publishConfig.name = @andares/promptdown（--access=public）；
 *    foundation 包名即 @andares/pdfoundation（scoped，--access=public）。
 *  - foundation 没有独立 tag/git 操作：它不新开 commit，版本号随主包 release commit 一起进 git；
 *    CI 发布顺序固定 foundation → 主包（主包 tarball 里 workspace:^ 在 pnpm pack 时改写为实际版本）。
 *  - editor 是独立版本线，用 `pdeditor-vX.Y.Z` tag 单独发（见 scripts/publish-editor.mjs）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const FOUNDATION_PKG_PATH = join(ROOT, "packages", "pdfoundation", "package.json");
const CHANGELOG_PATH = join(ROOT, "CHANGELOG.md");
const DEV_CHANGELOG_PATH = join(ROOT, "CHANGELOG.dev.md");
const BUMPS = ["major", "minor", "patch"];

const NPM_NAME = "@andares/promptdown";
const FOUNDATION_NAME = "@andares/pdfoundation";
const EDITOR_NAME = "@andares/pdeditor";
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
const prepareOnly = rawArgs.includes("--prepare-only");
const noWait = rawArgs.includes("--no-wait");
const META_FLAGS = ["--dry-run", "--prepare-only", "--no-wait"];
const positional = rawArgs.filter((a) => !META_FLAGS.includes(a));

// 只接受 all 模式（本脚本即 all）：主包 + foundation 强绑定，独立 npm 发布不再单独提供。
// 拦截旧命令形态（release / release-all all）与无参/非法参数，防误操作。
if (positional[0] === "release" || positional[0] === "all") {
	console.error(
		`${C.red}${C.bold}独立 npm 发布已合并进 release-all（foundation 与主包同号强绑定）。${C.reset}` +
			`\n  请使用: pnpm release-all <${BUMPS.join("|")}> [--dry-run] [--prepare-only] [--no-wait]${C.reset}` +
			`\n  editor 独立发布（${EDITOR_NAME}，tag pdeditor-vX.Y.Z）: pnpm release-editor <${BUMPS.join("|")}> [--dry-run] [--prepare-only]${C.reset}`,
	);
	process.exit(1);
}
const arg = positional[0];
if (!BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release-all <${BUMPS.join("|")}> [--dry-run] [--prepare-only] [--no-wait]${C.reset}` +
			`\n  Bump foundation + main (same version), commit + tag, push the tag, and let GitHub Actions publish.` +
			`\n  --prepare-only stops before the push and prints the command; --no-wait skips npm polling.`,
	);
	process.exit(1);
}
if (positional.length > 1) {
	console.error(
		`${C.red}Too many arguments. Expected: <${BUMPS.join("|")}> [--dry-run|--prepare-only|--no-wait]${C.reset}`,
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
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** 轮询 npm 与 provenance；确认成功返回 true，超时/缺 attestation 返回 false。 */
async function waitForNpm(name, version, { attempts = 30, delayMs = 20000 } = {}) {
	const url = `https://github.com/${ghRepo}/actions/workflows/publish.yml`;
	if (noWait) {
		console.log(`${C.dim}--no-wait：跳过 npm 轮询。工作流：${url}${C.reset}`);
		return false;
	}
	console.log(
		`${C.dim}  等待 npm 上出现 ${name}@${version}（Ctrl-C 可随时退出，不影响已推的 tag）${C.reset}`,
	);
	for (let attempt = 0; attempt < attempts; attempt++) {
		const probe = spawnSync(npm, ["view", `${name}@${version}`, "version"], {
			cwd: ROOT,
			encoding: "utf8",
		});
		if (probe.status === 0 && probe.stdout.trim() === version) {
			let attested = false;
			for (let attempt = 0; attempt < 6 && !attested; attempt++) {
				const att = spawnSync(
					npm,
					["view", `${name}@${version}`, "dist.attestations", "--json"],
					{ cwd: ROOT, encoding: "utf8" },
				);
				const raw = att.status === 0 ? att.stdout.trim() : "";
				attested =
					raw !== "" && raw !== "{}" && raw !== "undefined" && raw !== "null";
				if (!attested) await sleep(10000);
			}
			console.log(
				attested
					? `${C.green}✅ ${name}@${version} 已发布，provenance 已附${C.reset}`
					: `${C.yellow}${name}@${version} 已发布，但 dist.attestations 为空——检查工作流是否走了 OIDC${C.reset}`,
			);
			return attested;
		}
		process.stdout.write(".");
		await sleep(delayMs);
	}
	console.log(
		`\n${C.yellow}等待超时：npm 上还没有 ${name}@${version}。本地 tag 不受影响。${C.reset}` +
			`\n  查看工作流：${url}` +
			`\n  修复后重跑该工作流（ref 选 v${version}）；已存在的版本会自动跳过。`,
	);
	return false;
}

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
		`  0. sync：未提交改动 → git add -A + commit；未推送 → git push origin ${branch}（无则跳过）` +
			(prepareOnly ? "；--prepare-only → 不推" : ""),
	);
	console.log(
		`  1. pnpm build:all && pnpm typecheck:all && pnpm test:all（与 CI 同序：先构建再校验）`,
	);
	console.log(
		`  2. bump 主包 package.json version → ${next} + 同步 bump packages/pdfoundation version → ${next}（同号绑定）`,
	);
	console.log(
		`  2.5 CHANGELOG.dev.md 存在且有内容 → 归档为 CHANGELOG.md 顶部 "## ${next} (YYYY-MM-DD)" 章节（无则提示跳过）`,
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
	if (prepareOnly) {
		console.log(`  4. --prepare-only：停在 push 之前（打印推送命令）`);
	} else {
		console.log(
			`  4. git push origin ${branch} refs/tags/v${next} ← 发版动作，触发 GitHub Actions`,
		);
		console.log(
			`  5. CI: install → build:all → typecheck:all → test:all → 校验 tag==version → pnpm pack → npm publish --provenance（foundation 先、主包后）`,
		);
		console.log(
			`  6. 轮询 npm 确认 ${FOUNDATION_NAME}@${next} 与 ${NPM_NAME}@${next} 及 provenance（失败中止；--no-wait 跳过）`,
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
				: `  9. pnpm exec vsce publish（无 vsce 凭据 → 仅提示）`,
		);
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
		if (prepareOnly) {
			// --prepare-only 必须完全本地：push 由人或后续的显式 push 命令完成。
			console.log(`${C.yellow}--prepare-only：跳过 push（${ahead} 个 commit 留在本地）${C.reset}`);
		} else {
			run(git, ["push", "origin", branch]); // 失败中止：tag 必须建立在已推送的代码上
			console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
		}
	} else {
		console.log(`${C.dim}无未推送 commit，跳过 push${C.reset}`);
	}
} else {
	console.log(`${C.dim}远端无 origin/${branch} 分支，将全量推送${C.reset}`);
	if (prepareOnly) {
		console.log(`${C.yellow}--prepare-only：跳过 push${C.reset}`);
	} else {
		run(git, ["push", "origin", branch]); // 失败中止
		console.log(`${C.green}✅ 已推送到 origin/${branch}${C.reset}`);
	}
}

// 1. Checks gate — abort before anything is changed if they fail.
//    与 CI 完全同序（build:all → typecheck:all → test:all）：先构建再校验——
//    三包的 typecheck/test 都经 foundation 的 dist 解析类型与运行时，
//    没有 dist 时（全新 clone / 清过 dist）直接 typecheck 会误报找不到模块。
step("build + typecheck + test（三包，与 CI 同序）");
run(pnpm, ["build:all"]);
run(pnpm, ["typecheck:all"]);
run(pnpm, ["test:all"]);

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

// 2.5 CHANGELOG 归档：开发期条目（CHANGELOG.dev.md）→ CHANGELOG.md 顶部新版本章节。
//     版本号发布时才确定，开发期不预写；dev 文件归档后删除，随 release commit 一起进 git。
step(`CHANGELOG.dev.md → CHANGELOG.md 顶部 "## ${next} (日期)"（归档开发期条目）`);
let changedFiles = ["package.json", FOUNDATION_PKG_PATH];
if (existsSync(DEV_CHANGELOG_PATH)) {
	const devRaw = readFileSync(DEV_CHANGELOG_PATH, "utf8");
	// 去掉头部的说明块（引用块 + 标题），只留条目列表
	const entries = devRaw
		.split("\n")
		.filter((l) => !l.startsWith("#") && !l.startsWith(">"))
		.join("\n")
		.trim();
	if (entries === "") {
		console.log(
			`${C.yellow}CHANGELOG.dev.md 无条目（纯说明/空白），跳过归档${C.reset}`,
		);
	} else {
		const changelog = readFileSync(CHANGELOG_PATH, "utf8");
		// 锚 "# Changelog" 标题行（其前可能有 icon 等 HTML 块），新章节插在标题后
		const heading = "# Changelog\n";
		const idx = changelog.indexOf(heading);
		if (idx === -1) {
			console.error(
				`${C.red}CHANGELOG.md 缺少 "# Changelog" 标题锚点，无法归档 — 中止。${C.reset}`,
			);
			process.exit(1);
		}
		const now = new Date();
		const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		// 插到首个已有 "## " 版本章节之前（最新在前）；无已有章节时退回标题锚行之后。
		const firstSection = changelog.indexOf("\n## ");
		const insertAt =
			firstSection !== -1 ? firstSection + 1 : idx + heading.length + 1;
		const section = `## ${next} (${today})\n\n${entries}\n\n`;
		writeFileSync(
			CHANGELOG_PATH,
			changelog.slice(0, insertAt) + section + changelog.slice(insertAt),
			"utf8",
		);
		rmSync(DEV_CHANGELOG_PATH);
		changedFiles = [...changedFiles, "CHANGELOG.md", "CHANGELOG.dev.md"];
		console.log(
			`${C.green}已归档 ${entries.split("\n").filter((l) => l.startsWith("- ")).length} 条到 "## ${next} (${today})"${C.reset}`,
		);
	}
} else {
	console.log(
		`${C.yellow}无 CHANGELOG.dev.md（本次发布无开发期变更记录），跳过归档${C.reset}`,
	);
}

// 3. Commit，然后调用 tag-current.mjs 打 tag（内部检测已存在 → 不重复打）。
//    两个 package.json 的 version 均已在 commit 中体现；v${next} 指向 release commit。
step(`git commit + tag v${next}`);
run(git, ["add", ...changedFiles]);
run(git, ["commit", "-m", `chore: release v${next}`]);
run(process.execPath, [join(ROOT, "scripts", "tag-current.mjs")]);

// 4. 检查点：--prepare-only 停在 push 之前（本地 tag 已就绪，由人决定何时推）。
if (prepareOnly) {
	step("prepare-only：停在 push 之前");
	console.log(
		`${C.yellow}未推送——npm 上还不会出现 v${next}。确认后执行：${C.reset}` +
			`\n  git push origin ${branch} refs/tags/v${next}` +
			`\n${C.dim}推 tag 会触发 GitHub Actions 的 publish 工作流（OIDC，无 token）${C.reset}`,
	);
	process.exit(0);
}

// 5. Push 分支 + tag —— 这一步就是「发版」：tag 触发 CI 先发 foundation 再发主包。
//    失败必须中止：tag 没上去，npm 就不会有这一版。
step(`git push（分支 + tag v${next}）→ 触发 CI 发布`);
const push = run(git, ["push", "origin", branch, `refs/tags/v${next}`], {
	allowFailure: true,
});
if (push.status !== 0) {
	console.error(
		`${C.red}git push 失败——tag v${next} 未推送，CI 不会发布。${C.reset}` +
			`\n  本地 commit + tag 已就绪；修好远端后重试：` +
			`\n  git push origin ${branch} refs/tags/v${next}` +
			`\n  决定不发这一版：git tag -d v${next} && git reset --hard HEAD~1`,
	);
	process.exit(push.status ?? 1);
}
console.log(`${C.green}✅ 已推送 tag v${next}，GitHub Actions 开始发布${C.reset}`);

// 6. 先确认 CI 的 npm 发布与 provenance，再公开 GitHub Release / VSIX。
//    否则 CI 失败时仍会留下「Release 已公开、npm 没有这一版」的不一致状态。
step("等待 CI 发布（foundation → 主包）");
const foundationResult = await waitForNpm(FOUNDATION_NAME, next);
const mainResult =
	foundationResult === true ? await waitForNpm(NPM_NAME, next) : foundationResult;
if (!noWait && (foundationResult !== true || mainResult !== true)) {
	console.error(
		`${C.red}${C.bold}CI 未确认 npm 发布与 provenance——中止本地尾部。${C.reset}` +
			`\n  尚未创建 GitHub Release，也未发布 VSIX。` +
			`\n  工作流：https://github.com/${ghRepo}/actions/workflows/publish.yml` +
			`\n  临时故障可在 Actions 中对同一 tag 重跑；已存在的 npm 版本会自动跳过。`,
	);
	process.exit(1);
}

// 7. GitHub Release（best-effort）。刚推完时远端 ref 可能还看不见，短暂重试。
let tagVisible = false;
for (let attempt = 0; attempt < 5 && !tagVisible; attempt++) {
	tagVisible =
		run(
			git,
			["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/v${next}`],
			{ stdio: "pipe", allowFailure: true },
		).status === 0;
	if (!tagVisible) await sleep(2000);
}
if (!process.env.GITHUB_TOKEN) {
	console.warn(
		`${C.yellow}未设置 GITHUB_TOKEN — 跳过 GitHub Release 创建。` +
			`npm 发布已由 CI 接管；可稍后手动创建 release。${C.reset}`,
	);
} else if (!tagVisible) {
	console.warn(
		`${C.yellow}tag v${next} 尚未在远端可见 — 跳过 GitHub Release 创建。` +
			`\n  稍后重试创建（幂等）或手动在 GitHub 上建 Release。${C.reset}`,
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
					`tag v${next} 已推送，可稍后手动创建 Release。${C.reset}`,
			);
		}
	}
}

// 8. Package VSCode extension (.vsix)。（失败降级为只发 npm）
step("pnpm exec vsce package --no-dependencies");
const vsce = run(pnpm, ["exec", "vsce", "package", "--no-dependencies"], {
	allowFailure: true,
});
if (vsce.status !== 0) {
	console.warn(
		`${C.yellow}vsce package failed — tag 已推送、npm 由 CI 发布，但 .vsix 未生成。` +
			`\n  可手动运行: pnpm exec vsce package --no-dependencies${C.reset}`,
	);
} else {
	console.log(`${C.dim}vsix: ${ROOT}/promptdown-${next}.vsix${C.reset}`);
}

// 9. Publish to the VSCode Marketplace.（凭据缺失 → 降级提示）
step("pnpm exec vsce publish");
if (!vsceCred) {
	console.warn(
		`${C.yellow}无 vsce 凭据（VSCE_PAT 未设置，~/.vsce 也没有 publisher 凭据）— 无法发布扩展。` +
			`tag v${next} 已推送、npm 由 CI 发布，` +
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
			`${C.yellow}vsce publish failed — tag v${next} 已推送、npm 由 CI 发布，扩展需手动上传 .vsix。${C.reset}`,
		);
	}
}

console.log(
	noWait
		? `\n${C.green}${C.bold}✅ v${next} 的 tag 已推送，本地 Release/VSIX 尾部已执行（未等待 npm 确认）${C.reset}`
		: `\n${C.green}${C.bold}✅ Released v${current} → v${next}${C.reset}` +
				`\n${C.dim}Tag: v${next} · GitHub Actions 发布 ${FOUNDATION_NAME}@${next} → ${NPM_NAME}@${next}（OIDC + provenance）${C.reset}`,
);
