#!/usr/bin/env node
/**
 * One-command release for promptdown（pnpm 包 + VSCode 扩展）。
 *
 *   pnpm release patch            # npm 发布：0.1.0 → 0.1.1（vsce 可选）
 *   pnpm release-all patch        # npm + VSCode 一起发：npm 失败中止，vsce 失败降级为只发 npm
 *
 * 模式：
 * - release：门禁 → bump(major|minor|patch) → commit+tag → pnpm publish（失败中止）
 *   → vsce package；设置了 VSCE_PAT 才 vsce publish（失败警告）
 * - release-all：同 release，但 npm 铁定发（失败即中止，版本已锚定）；
 *   npm 成功后尝试推 GitHub（分支 + tags，失败仅警告——可能此前已推过），
 *   并用 GITHUB_TOKEN 创建 GitHub Release v{next}（best-effort：未设 token /
 *   已存在 / 失败都只提示、不中止）；随后 vsce publish 必走——未设
 *   VSCE_PAT 或失败时降级：只提示、不中止，结果 = 仅 npm 已发布
 *   （可稍后手动补发扩展）。
 *
 * `--dry-run` 只打印计划（版本 + 步骤），不修改任何东西。
 *
 * 注意：
 *  - pnpm 包与 VSCode 扩展共用 package.json 的 version（单包设计）。
 *  - npm registry 上 `promptdown` 已被他人占用，发布 npm 时临时切换 scoped
 *    名 `@andares/promptdown`（--access=public），随后恢复供 vsce 使用。
 *  - 发布的 tarball 只含 dist/docs/skill 等（.npmignore 控制——pnpm
 *    复用 npm 的发布文件机制），本脚本与 PLAN.md 不发布。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const BUMPS = ["major", "minor", "patch"];

const NPM_NAME = "@andares/promptdown";
const VSCE_NAME = "promptdown";
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
			`\n  Bump the package version and publish npm (exactly one argument).` +
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

const branch =
	run(git, ["branch", "--show-current"], {
		stdio: "pipe",
		allowFailure: true,
	})
		.stdout.toString()
		.trim() || "master";

if (dryRun) {
	console.log(`\n${C.dim}--dry-run -- nothing changed. Would run:${C.reset}`);
	console.log(`  1. pnpm typecheck && pnpm test && pnpm build`);
	console.log(`  2. bump package.json version → ${next}`);
	if (tagExists(`v${next}`)) {
		console.log(
			`  3. git commit -m "chore: release v${next}" + tag-current（tag v${next} 已存在，跳过打 tag）`,
		);
	} else {
		console.log(
			`  3. git commit -m "chore: release v${next}" + tag-current（git tag v${next}）`,
		);
	}
	console.log(
		`  4. pnpm publish --no-git-checks --access=public（scoped: ${NPM_NAME}）`,
	);
	if (mode === "all") {
		console.log(
			`  5. git push origin ${branch} --tags + GitHub Release v${next}` +
				(process.env.GITHUB_TOKEN
					? ""
					: `（未设置 GITHUB_TOKEN → 仅 push，Release 跳过）`),
		);
	} else {
		console.log(`  5. （release 模式不做 GitHub 步骤）`);
	}
	console.log(
		`  6. pnpm exec vsce package --no-dependencies → promptdown-${next}.vsix`,
	);
	if (mode === "all") {
		console.log(
			process.env.VSCE_PAT
				? `  7. pnpm exec vsce publish（release-all 必走）`
				: `  7. pnpm exec vsce publish（release-all 必走，但未设置 VSCE_PAT → 仅提示）`,
		);
	} else {
		console.log(
			process.env.VSCE_PAT
				? `  7. pnpm exec vsce publish（检测到 VSCE_PAT）`
				: `  7. pnpm exec vsce publish（跳过：未设置 VSCE_PAT）`,
		);
	}
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
// 临时切换 scoped 包名发布（npm 的 promptdown 已被占用），随后恢复供 vsce 打包。
step(`pnpm publish（scoped: ${NPM_NAME}）`);
pkg.name = NPM_NAME;
writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
let publish;
try {
	publish = run(pnpm, ["publish", "--no-git-checks", "--access=public"], {
		allowFailure: true,
	});
} finally {
	pkg.name = VSCE_NAME;
	writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}
if (publish.status !== 0) {
	console.error(
		`${C.red}npm publish failed — 流程中止（版本已锚定在 ${next}）。` +
			`\n  To roll back: git tag -d v${next} && git reset --hard HEAD~1${C.reset}`,
	);
	process.exit(publish.status ?? 1);
}

// 5. GitHub：push 分支 + tags（尝试一次，失败仅警告——可能此前已推过；
// 确保 tag 在远端存在后再建 Release，否则 API 会自动建 tag 指向默认分支
// 的 HEAD，可能不是 release commit）。然后创建 GitHub Release v${next}
// （best-effort：未设 token / 已存在 / 失败都只提示，不中止）。
step("git push + GitHub Release");
const push = run(git, ["push", "origin", branch, "--tags"], {
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
	const body = lines.join("\n");
	if (rel.status === 0 && code === "201") {
		console.log(`${C.green}GitHub Release v${next} 创建成功${C.reset}`);
	} else if (code === "422" && body.includes("already_exists")) {
		console.warn(
			`${C.yellow}GitHub Release v${next} 已存在，跳过（不重复创建）${C.reset}`,
		);
	} else {
		console.warn(
			`${C.yellow}GitHub Release 创建失败（HTTP ${code || "?"}）。` +
				`npm 已发布 v${next}，可稍后手动创建。${C.reset}`,
		);
	}
}

// 6. Package VSCode extension (.vsix).
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

// 7. Publish to the VSCode Marketplace.
if (mode === "all") {
	// release-all：必走。未配置 token 或失败都只提示，不中止（npm 已锚定）。
	step("pnpm exec vsce publish");
	if (!process.env.VSCE_PAT) {
		console.warn(
			`${C.yellow}未设置 VSCE_PAT — 无法发布扩展。npm 已发布 v${next}，` +
				`\n  稍后可手动: export VSCE_PAT=... && pnpm exec vsce publish${C.reset}`,
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
} else if (process.env.VSCE_PAT) {
	step("pnpm exec vsce publish");
	const vp = run(
		pnpm,
		["exec", "vsce", "publish", "--skip-duplicate", "--no-dependencies"],
		{ allowFailure: true },
	);
	if (vp.status !== 0) {
		console.warn(
			`${C.yellow}vsce publish failed — pnpm 包已发布，扩展需手动上传 .vsix。${C.reset}`,
		);
	}
}

console.log(
	`\n${C.green}${C.bold}✅ Released v${current} → v${next}${C.reset}` +
		`\n${C.dim}Tag: v${next} · commit: chore: release v${next} · pnpm + vsix` +
		(mode === "all" ? ` · GitHub Release` : ``) +
		`${C.reset}`,
);
