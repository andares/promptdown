import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CLI 通用参数 --version 的共享实现（pdtransform / pdcompile / pdformat 统一调用）。
 *
 * 版本号读包根 package.json——dist/ 编译产物位于包根下一级，repo 内与 npm 安装
 * 布局一致（package.json 与 dist/ 同级），`__dirname/..` 两种场景都能命中。
 */

/** 当前 promptdown 版本号；package.json 不可读时兜底 unknown（不炸 CLI） */
export function pdVersion(): string {
	try {
		const pkg = JSON.parse(
			readFileSync(join(__dirname, "..", "package.json"), "utf8"),
		) as { version?: string };
		return pkg.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

/**
 * 命中 `--version` 则打印版本号并退出（exit 0），返回给调用方一个永不发生的
 * 布尔仅为类型完整；未命中返回 false，CLI 继续原有参数流程。
 */
export function handleVersionArg(args: string[]): boolean {
	if (!args.includes("--version")) return false;
	console.log(pdVersion());
	process.exit(0);
}
