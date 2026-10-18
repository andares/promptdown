/**
 * 编辑器内部使用的 foundation 类型兜底（types-only，不参与运行时）。
 *
 * 为什么需要：@andares/pdfoundation 是 workspace 软链包，部分编辑器/LSP 的
 * 推断项目会把 `@andares/pdfoundation` 解析到 dist/index.js（构建窗口内 d.ts
 * 短暂缺失时尤其容易），报 7016 并把它当 any。这里只声明编辑器实际用到的
 * 冻结 API（1.0 起签名不破坏）；对外 d.ts 仍然 re-export 真实包，消费方拿到的
 * 是 foundation 自己的类型。若 foundation 改了这些签名，这里的 tsc 会先报错，
 * 同时 editor 的运行时测试会覆盖行为。
 */
declare module "@andares/pdfoundation" {
	export function format(text: string): string;
	export function pdToJsonText(
		text: string,
		selector?: string,
		fileStem?: string,
	): string;
	export function jsonToPdText(text: string): {
		pd: string;
		warnings: string[];
	};
	export function splitInlineCode(
		text: string,
	): { code: boolean; seg: string }[];
	export function hasLiteralColon(s: string): boolean;
	export function findKeyValueSeparator(s: string): number;
	export function matchKeyValue(
		s: string,
	): { key: string; value: string | undefined } | null;
}
