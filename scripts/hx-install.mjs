#!/usr/bin/env node
/**
 * 一键为系统 helix 安装 promptdown 语言支持。
 *
 *   pnpm hx-install
 *
 * 流程：
 *  1. 检测 hx（which + 版本）
 *  2. 写/合并 ~/.config/helix/languages.toml（[[language]] promptdown + [[grammar]] source.path 指向包内 grammar）
 *  3. 拷贝 queries/highlights.scm → ~/.config/helix/runtime/queries/promptdown/
 *  4. hx --grammar build promptdown（helix 官方编译机制）
 *  5. 输出 config.toml 工作流建议（不自动写，保护用户现有配置）
 *
 * 前置：tree-sitter-promptdown/src/parser.c 已生成（npm 包内自带，无需工具链）。
 */
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GRAMMAR_DIR = join(ROOT, "tree-sitter-promptdown");
const PARSER_C = join(GRAMMAR_DIR, "src", "parser.c");
const HIGHLIGHTS = join(GRAMMAR_DIR, "queries", "highlights.scm");
const LANG_NAME = "promptdown";

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

function run(cmd, args, opts = {}) {
	const res = spawnSync(cmd, args, { stdio: "inherit", ...opts });
	if (res.status !== 0 && !opts.allowFailure) {
		console.error(`${C.red}Failed: ${cmd} ${args.join(" ")}${C.reset}`);
		process.exit(res.status ?? 1);
	}
	return res;
}

/** helix 用户配置目录（Linux/macOS/Windows） */
function helixConfigDir() {
	const h = homedir();
	const candidates = [
		join(h, ".config", "helix"),
		join(h, "Library", "Application Support", "helix"),
		join(h, "AppData", "Roaming", "helix"),
	];
	return candidates.find((d) => existsSync(d)) ?? candidates[0];
}

/** 写/合并 languages.toml：追加 promptdown 的 [[language]] 与 [[grammar]]（按 name 幂等） */
function writeLanguagesToml(configDir) {
	const path = join(configDir, "languages.toml");
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
	// grammar 块存在且路径一致 → 跳过；路径不同 → 更新（repo ↔ npm 包切换场景）
	const grammarRe =
		/\[\[grammar\]\]\nname = "promptdown"\nsource = \{ path = "([^"]*)" \}/;
	const m = existing.match(grammarRe);
	if (m && m[1] === GRAMMAR_DIR) {
		console.log(
			`${C.dim}languages.toml 已有 promptdown 条目且路径一致，跳过${C.reset}`,
		);
		return;
	}
	if (m && m[1] !== GRAMMAR_DIR) {
		const updated = existing.replace(
			grammarRe,
			`[[grammar]]\nname = "promptdown"\nsource = { path = "${GRAMMAR_DIR}" }`,
		);
		writeFileSync(path, updated);
		console.log(
			`${C.green}已更新 source.path → ${GRAMMAR_DIR}${C.reset}`,
		);
		return;
	}
	// 无 grammar 块：language 已有则只补 grammar，否则 language + grammar 一起追加
	const hasLanguage = /name\s*=\s*"promptdown"/.test(existing);
	const block =
		(existing.trim() ? "\n" : "") +
		(hasLanguage ? "" : `[[language]]\nname = "promptdown"\nscope = "source.pd"\nfile-types = ["pd"]\ncomment-tokens = ["//"]\n\n`) +
		`[[grammar]]\nname = "promptdown"\nsource = { path = "${GRAMMAR_DIR}" }\n`;
	writeFileSync(path, existing + block);
	console.log(`${C.green}已写入 ${path}${C.reset}`);
}

function installQueries(configDir) {
	const queryDir = join(configDir, "runtime", "queries", LANG_NAME);
	mkdirSync(queryDir, { recursive: true });
	// grammar 配置不管 queries：highlights（高亮）与 indents（auto-indent）都需手动拷
	for (const name of ["highlights.scm", "indents.scm"]) {
		const src = join(GRAMMAR_DIR, "queries", name);
		if (!existsSync(src)) continue; // indents 缺失时仅警告（高亮仍可用）
		copyFileSync(src, join(queryDir, name));
		console.log(`${C.green}已安装 queries → ${join(queryDir, name)}${C.reset}`);
	}

	// hx --grammar build 需要输出目录存在（helix 不会自动创建）
	mkdirSync(join(configDir, "runtime", "grammars"), { recursive: true });
}

function printConfigAdvice() {
	console.log(
		`\n${C.bold}可选：写提示词工作流（config.toml 建议，请自行确认后加入 ~/.config/helix/config.toml）${C.reset}` +
			`\n${C.dim}[editor]` +
			`\nclipboard-provider = "wayland"   # WSLg 默认已自动检测；显式声明更稳` +
			`\n` +
			`\n[keys.normal]` +
			`\n# 一键激活 pd 语言（空 buffer / 未存盘场景）` +
			`\nF5 = ":set-language promptdown"` +
			`\n# 一键全选复制全文到系统剪贴板（WSLg → Windows 剪贴板）` +
			`\nF6 = ["select_all", "yank"]${C.reset}` +
			`\n\n用法：hx 提示词.pd（.pd 后缀自动识别）直接写；写完 F6 复制全文，Windows 端 Ctrl+V 粘贴。`,
	);
}

try {
	// 0. 前置检查
	if (!existsSync(PARSER_C)) {
		throw new Error(
			`缺少 ${PARSER_C}——npm 包应自带生成的 parser.c；若在开发目录运行请先执行 pnpm dlx tree-sitter-cli generate`,
		);
	}
	if (!existsSync(HIGHLIGHTS)) {
		throw new Error(`缺少 ${HIGHLIGHTS}`);
	}

	// 1. 检测 hx
	step("检测 hx");
	const which = run("which", ["hx"], { stdio: "pipe", allowFailure: true });
	if (which.status !== 0) {
		throw new Error("未找到 hx（helix）——请先安装 helix");
	}
	const hxPath = which.stdout.toString().trim();
	const ver = run(hxPath, ["--version"], { stdio: "pipe" });
	console.log(`${C.dim}${hxPath} — ${ver.stdout.toString().trim()}${C.reset}`);

	// 2. languages.toml
	step("写/合并 languages.toml");
	const configDir = helixConfigDir();
	mkdirSync(configDir, { recursive: true });
	writeLanguagesToml(configDir);

	// 3. queries
	step("安装 queries（highlights.scm）");
	installQueries(configDir);

	// 4. hx --grammar build promptdown
	// 注意：helix 的 build 是全量行为（会尝试全部 grammar；内置的未 fetch 会失败——
	// 环境噪音，允许失败）。promptdown 有本地 source.path，编译成功即可。
	step("hx --grammar build promptdown");
	run(hxPath, ["--grammar", "build", LANG_NAME], {
		allowFailure: true,
		stdio: "pipe",
	});
	const soFile = join(configDir, "runtime", "grammars", `${LANG_NAME}.so`);
	if (!existsSync(soFile)) {
		throw new Error(
			`${soFile} 未生成——hx --grammar build 未成功编译 promptdown（见上方输出）`,
		);
	}
	console.log(`${C.green}grammar 编译成功 → ${soFile}${C.reset}`);

	// 5. 完成 + config 建议
	console.log(
		`\n${C.green}${C.bold}✅ promptdown 语言支持已装进 helix${C.reset}` +
			`\n${C.dim}验证: hx --health promptdown · 打开 .pd 文件看高亮${C.reset}`,
	);
	printConfigAdvice();
} catch (e) {
	console.error(
		`${C.red}${e instanceof Error ? e.message : String(e)}${C.reset}`,
	);
	process.exit(1);
}
