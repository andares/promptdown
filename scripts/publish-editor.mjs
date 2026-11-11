#!/usr/bin/env node
/**
 * One-command release for @andares/pdeditor（Web 输入框组件）。
 *
 *   pnpm release-editor patch            # 0.1.0 → 0.1.1
 *   pnpm release-editor patch --prepare-only   # 只到本地 tag，不 push
 *
 * 流程（tag = 发版意图，CI = 发版执行）：
 * 工作区必须干净 → 组件包门禁（typecheck + test + build）→ foundation 目标版本已在 npm
 * → bump packages/editor/package.json version → CHANGELOG 归档
 * （packages/editor/CHANGELOG.dev.md 开发期条目 → packages/editor/CHANGELOG.md 顶部
 * "## X.Y.Z (YYYY-MM-DD)"，删 dev 文件；无则提示跳过）→ commit + tag `pdeditor-vX.Y.Z`
 * → git push 分支 + tag（触发 CI 发布）→ 轮询 npm 确认版本与 provenance。
 *
 * 为什么是独立 tag：editor 是独立版本线的库，与主包 `v{X.Y.Z}`（foundation + 主包同号）
 * 互不拖号。`.github/workflows/publish.yml` 按前缀分流：`v*` → foundation + 主包，
 * `pdeditor-v*` → editor。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西；`--prepare-only` 停在 push 前。
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
const FOUNDATION_PKG_PATH = join(ROOT, "packages", "pdfoundation", "package.json");
const FOUNDATION_NAME = "@andares/pdfoundation";
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
const prepareOnly = rawArgs.includes("--prepare-only");
const noWait = rawArgs.includes("--no-wait");
const META_FLAGS = ["--dry-run", "--prepare-only", "--no-wait"];
const positional = rawArgs.filter((a) => !META_FLAGS.includes(a));
const arg = positional[0];

if (!BUMPS.includes(arg)) {
	console.error(
		`${C.red}${C.bold}Usage: pnpm release-editor <${BUMPS.join("|")}> [--dry-run] [--prepare-only] [--no-wait]${C.reset}` +
			`\n  Bump ${PKG_NAME}, commit + tag pdeditor-vX.Y.Z, push the tag, and let GitHub Actions publish.` +
			`\n  Add --dry-run to preview without changing anything.` +
			`\n  Add --prepare-only to stop after commit+tag and print the push command.`,
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
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const git = process.platform === "win32" ? "git.exe" : "git";
const repoMatch = (() => {
	try {
		return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
			.repository?.url?.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
	} catch {
		return undefined;
	}
})();
const ghRepo = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : "andares/promptdown";
const tag = `pdeditor-v${next}`;

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
			`\n  修复后重跑该工作流（ref 选 ${tag}）；已存在的版本会自动跳过。`,
	);
	return false;
}

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(`  0. 工作区必须干净（有未提交变更则直接中止——CI 只发布 tag 里的内容）`);
	console.log(`  1. pnpm --filter ${PKG_NAME} typecheck && test && build`);
	console.log(`  1.5 前置检查：${FOUNDATION_NAME} 目标版本已在 npm（否则 ETARGET）`);
	console.log(`  2. bump packages/editor/package.json version → ${next}`);
	console.log(
		`  3. CHANGELOG.dev.md 存在且有内容 → 归档为 packages/editor/CHANGELOG.md 顶部 "## ${next} (YYYY-MM-DD)"（无则提示跳过）`,
	);
	console.log(`  4. git commit + tag ${tag}`);
	if (prepareOnly) {
		console.log(`  5. --prepare-only：停在 push 之前（打印推送命令）`);
	} else {
		console.log(
			`  5. git push origin <branch> refs/tags/${tag} ← 发版动作，触发 GitHub Actions`,
		);
		console.log(
			`  6. CI: install → foundation build → editor typecheck/test/build → 校验 tag==version → pnpm pack → npm publish --provenance`,
		);
		console.log(
			`  7. 轮询 npm 确认 ${PKG_NAME}@${next} 与 provenance（--no-wait 跳过）`,
		);
	}
	process.exit(0);
}

// 0. 硬闸：CI 从 tag 构建，工作区里的未提交内容不会被发布——必须先提交。
step("工作区必须干净");
const branch = run(git, ["branch", "--show-current"], {
	stdio: "pipe",
	allowFailure: true,
})
	.stdout.toString()
	.trim();
if (!branch) {
	console.error(`${C.red}无法确定当前分支（detached HEAD？）— 中止。${C.reset}`);
	process.exit(1);
}
const dirty = run(git, ["status", "--porcelain"], { stdio: "pipe" })
	.stdout.toString()
	.trim();
if (dirty) {
	console.error(
		`${C.red}${C.bold}Aborting: uncommitted changes present.${C.reset}\n` +
			dirty
				.split("\n")
				.map((l) => `  ${l}`)
				.join("\n") +
			`\n${C.red}先提交（或 stash）再发版：CI 只发布 tag 指向的内容。${C.reset}`,
	);
	process.exit(1);
}
console.log(`${C.green}工作区干净${C.reset}`);

// 1. Checks gate（组件包门禁）— 失败即中止，未改动任何东西。
step("typecheck + test + build（组件包）");
run(pnpm, ["--filter", PKG_NAME, "typecheck"]);
run(pnpm, ["--filter", PKG_NAME, "test"]);
run(pnpm, ["--filter", PKG_NAME, "build"]);

// 1.5 前置检查：dependencies 的 foundation（workspace:^）发布时会改写成本地版本，
//     目标版本必须已在 npm；否则消费方安装时报 ETARGET。先于 bump，失败不留半成品。
step(`前置检查：${FOUNDATION_NAME} 目标版本已在 npm`);
const foundationVersion = JSON.parse(
	readFileSync(FOUNDATION_PKG_PATH, "utf8"),
).version;
if (typeof pkg.dependencies?.[FOUNDATION_NAME] === "string") {
	const probe = spawnSync(
		npm,
		["view", `${FOUNDATION_NAME}@${foundationVersion}`, "version"],
		{ cwd: ROOT, encoding: "utf8" },
	);
	if (probe.status !== 0) {
		console.error(
			`${C.red}${FOUNDATION_NAME}@${foundationVersion} 尚未在 npm（或网络不可用）。${C.reset}`,
		);
		console.error(
			`  请先运行 pnpm release-all（发布 foundation 同号版本）并等待 npm 传播，再跑 release-editor。`,
		);
		process.exit(1);
	}
	console.log(`${C.green}✅ ${FOUNDATION_NAME}@${foundationVersion} 已在 npm${C.reset}`);
} else {
	console.log(`${C.dim}editor 未依赖 ${FOUNDATION_NAME}，跳过${C.reset}`);
}

// 2. Bump packages/editor/package.json（2 空格缩进 + 尾换行）。
step(`bump version → ${next}`);
pkg.version = next;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

const changedFiles = [PKG_PATH];

// 2.5 CHANGELOG 归档：开发期条目（packages/editor/CHANGELOG.dev.md）→ CHANGELOG.md 顶部。
//     版本号发布时才确定，开发期不预写；dev 文件归档后删除，随 release commit 一起进 git。
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
		changedFiles.push(CHANGELOG_PATH, DEV_CHANGELOG_PATH);
		console.log(
			`${C.green}已归档 ${entries.split("\n").filter((l) => l.trimStart().startsWith("- ")).length} 条到 "## ${next} (${today})"${C.reset}`,
		);
	}
} else {
	console.log(
		`${C.yellow}无 packages/editor/CHANGELOG.dev.md（本次发布无开发期变更记录），跳过归档${C.reset}`,
	);
}

// 3. Commit + tag（tag 是发版意图，CI 是发版执行）。
step(`git commit + tag ${tag}`);
run(git, ["add", ...changedFiles]);
run(git, ["commit", "-m", `chore: release ${PKG_NAME} v${next}`]);
run(process.execPath, [
	join(ROOT, "scripts", "tag-current.mjs"),
	"--tag",
	tag,
	"--package",
	PKG_PATH,
]);

// 3b. 自检：tag 必须指向 HEAD 且工作区干净——保证将要发布的内容 == tag 内容。
const headHash = run(git, ["rev-parse", "HEAD"], { stdio: "pipe" })
	.stdout.toString()
	.trim();
const tagHash = run(git, ["rev-parse", tag], { stdio: "pipe" })
	.stdout.toString()
	.trim();
if (tagHash !== headHash) {
	console.error(
		`${C.red}Aborting: tag ${tag} (${tagHash.slice(0, 7)}) does not point at HEAD (${headHash.slice(0, 7)}).${C.reset}`,
	);
	process.exit(1);
}
const dirtyAfterTag = run(git, ["status", "--porcelain"], { stdio: "pipe" })
	.stdout.toString()
	.trim();
if (dirtyAfterTag) {
	console.error(
		`${C.red}Aborting: working tree is dirty after commit+tag — the published content would NOT match ${tag}:${C.reset}\n` +
			dirtyAfterTag
				.split("\n")
				.map((l) => `  ${l}`)
				.join("\n"),
	);
	process.exit(1);
}
console.log(`${C.green}tag ${tag} == HEAD, working tree clean${C.reset}`);

// 4. 检查点：--prepare-only 停在 push 之前。
if (prepareOnly) {
	step("prepare-only：停在 push 之前");
	console.log(
		`${C.yellow}未推送——npm 上还不会出现 ${PKG_NAME}@${next}。确认后执行：${C.reset}` +
			`\n  git push origin ${branch} refs/tags/${tag}` +
			`\n${C.dim}推 tag 会触发 GitHub Actions 的 publish 工作流（OIDC，无 token）${C.reset}`,
	);
	process.exit(0);
}

// 5. Push 分支 + tag —— 发版动作。
step(`git push（分支 + tag ${tag}）→ 触发 CI 发布`);
const push = run(git, ["push", "origin", branch, `refs/tags/${tag}`], {
	allowFailure: true,
});
if (push.status !== 0) {
	console.error(
		`${C.red}git push 失败——tag ${tag} 未推送，CI 不会发布。${C.reset}` +
			`\n  本地 commit + tag 已就绪；修好远端后重试：` +
			`\n  git push origin ${branch} refs/tags/${tag}` +
			`\n  决定不发这一版：git tag -d ${tag} && git reset --hard HEAD~1`,
	);
	process.exit(push.status ?? 1);
}
console.log(`${C.green}✅ 已推送 tag ${tag}，GitHub Actions 开始发布${C.reset}`);

// 6. 等待 CI 把这一版落到 npm；失败必须返回非零，不能声称已发布。
const publishResult = await waitForNpm(PKG_NAME, next);
if (!noWait && publishResult !== true) {
	console.error(
		`${C.red}${C.bold}CI 未确认 ${PKG_NAME}@${next} 的 npm 发布与 provenance。${C.reset}` +
			`\n  工作流：https://github.com/${ghRepo}/actions/workflows/publish.yml` +
			`\n  临时故障可在 Actions 中对同一 tag 重跑；已存在的 npm 版本会自动跳过。`,
	);
	process.exit(1);
}

console.log(
	noWait
		? `\n${C.green}${C.bold}✅ ${PKG_NAME} v${next} 的 tag 已推送（未等待 npm 确认）${C.reset}`
		: `\n${C.green}${C.bold}✅ Released ${PKG_NAME} v${current} → v${next}${C.reset}` +
				`\n${C.dim}Tag: ${tag} · commit: chore: release ${PKG_NAME} v${next} · npm 发布由 GitHub Actions 完成（OIDC + provenance）${C.reset}`,
);
