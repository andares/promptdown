#!/usr/bin/env node
/**
 * 一条龙：打测试版 vsix → 卸载 WSL 端旧扩展 → 装进 vscode-server。
 *
 *   pnpm wsl-install
 *
 * 专为 WSL Remote 场景设计（扩展装在 ~/.vscode-server/extensions/，不是 Windows 端）。
 * - 用固定测试版本号 0.0.0-test 打包（不 bump package.json 正式版本，打包后自动恢复）
 * - 安装前先卸载旧版（VSCode 对同 ID 扩展的降级/同版本安装可能拒绝，卸载最干净）
 * - 安装后清理旧版本残留目录（orphan）
 * - 完成后需在 VSCode 里 Reload Window 生效
 */
import { spawnSync } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_PATH = join(ROOT, "package.json");
const TEST_VERSION = "0.0.0-test";
const EXT_ID = "andares.promptdown";

const C = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

const step = (label) =>
	console.log(`\n${C.dim}▸${C.reset} ${C.bold}${label}${C.reset}`);

/** 读 package.json（含 try/catch，损坏时报友好错误） */
function readPackageJson() {
	try {
		return JSON.parse(readFileSync(PKG_PATH, "utf8"));
	} catch (e) {
		throw new Error(`package.json 无法读取/解析: ${PKG_PATH}（${e.message}）`);
	}
}

function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
	if (res.status !== 0 && !opts.allowFailure) {
		console.error(`${C.red}Failed: ${cmd} ${args.join(" ")}${C.reset}`);
		process.exit(res.status ?? 1);
	}
	return res;
}

/** 打测试版 vsix：临时改 package.json version，打包后恢复（含 SIGINT） */
function packageTestVsix(pkg) {
	const original = pkg.version;
	let restored = false;
	const restore = () => {
		if (restored) return;
		pkg.version = original;
		writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
		restored = true;
	};
	process.on("SIGINT", () => {
		restore();
		process.exit(130);
	});

	try {
		pkg.version = TEST_VERSION;
		writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
		const vsix = join(ROOT, `promptdown-${TEST_VERSION}.vsix`);
		rmSync(vsix, { force: true }); // 清掉上次的测试包
		step(`打包测试版 vsix（${TEST_VERSION}，不 bump 正式版本）`);
		const res = run("pnpm", ["exec", "vsce", "package", "--no-dependencies"], {
			allowFailure: true,
		});
		if (res.status !== 0) {
			throw new Error(`vsce package 失败（版本已恢复为 ${original}）`);
		}
		return vsix;
	} finally {
		restore();
	}
}

/** 找 vscode-server 的 code-server CLI（多个 commit 目录时取最新） */
function findServerCli() {
	const binDir = join(homedir(), ".vscode-server", "bin");
	if (!existsSync(binDir)) {
		throw new Error(`未找到 ${binDir}——需要先通过 WSL Remote 打开过 VSCode`);
	}
	const commits = readdirSync(binDir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => ({
			name: e.name,
			mtime: statSync(join(binDir, e.name)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);
	if (commits.length === 0) {
		throw new Error(`${binDir} 下没有 server 版本目录`);
	}
	const cli = join(binDir, commits[0].name, "bin", "code-server");
	if (!existsSync(cli)) {
		throw new Error(`未找到 server CLI: ${cli}`);
	}
	console.log(`${C.dim}server CLI: ${cli}${C.reset}`);
	return cli;
}

/** 卸载旧版（未安装时忽略） */
function uninstallExtension(cli) {
	step(`卸载旧扩展 ${EXT_ID}`);
	const res = run(cli, ["--uninstall-extension", EXT_ID], {
		allowFailure: true,
		stdio: "pipe",
	});
	const out = res.stdout?.toString() ?? "";
	if (res.status === 0) {
		console.log(`${C.green}已卸载${C.reset}`);
	} else if (
		out.includes("not installed") ||
		out.includes("is not installed")
	) {
		console.log(`${C.dim}（旧版未登记，跳过）${C.reset}`);
	} else {
		console.warn(
			`${C.yellow}卸载命令异常（status ${res.status}），继续安装：${out.trim()}${C.reset}`,
		);
	}
}

/** 安装 vsix 到 WSL 端，并清理旧版本残留目录 */
function installExtension(cli, vsix) {
	step(`安装 ${vsix}`);
	run(cli, ["--install-extension", vsix, "--force"]);

	// 清理 orphan：删除 extensions 下非本次安装的 andares.promptdown-* 目录
	const extDir = join(homedir(), ".vscode-server", "extensions");
	const installed = `andares.promptdown-${TEST_VERSION}`;
	if (existsSync(extDir)) {
		for (const entry of readdirSync(extDir)) {
			if (entry.startsWith("andares.promptdown-") && entry !== installed) {
				console.log(`${C.dim}清理旧版本残留: ${entry}${C.reset}`);
				rmSync(join(extDir, entry), { recursive: true, force: true });
			}
		}
	}
}

try {
	const pkg = readPackageJson();
	step(`测试版本号: ${TEST_VERSION}（正式版本保持 ${pkg.version}）`);
	const vsix = packageTestVsix(pkg);
	const cli = findServerCli();
	uninstallExtension(cli);
	installExtension(cli, vsix);
	console.log(
		`\n${C.green}${C.bold}✅ 测试版已装进 WSL 端${C.reset}` +
			`\n${C.dim}在 VSCode 的 WSL 窗口里 Ctrl+Shift+P → Reload Window 生效。${C.reset}`,
	);
} catch (e) {
	console.error(
		`${C.red}${e instanceof Error ? e.message : String(e)}${C.reset}`,
	);
	process.exit(1);
}
