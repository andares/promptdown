import Prism from "prismjs";
import "prismjs/components/prism-markup"; // xml/html/svg
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";

export type PrismLang = "markup" | "markdown" | "json" | "yaml";

/**
 * Prism 高亮（md/xml/json/yaml）——Yace 管线第一级（html:false → 输出 HTML）。
 * 需配套 CSS（prismjs/themes 或自定义 token 样式）。
 */
export function highlightWithPrism(value: string, lang: PrismLang): string {
	const grammar = Prism.languages[lang];
	if (!grammar) return escapeHtml(value);
	return Prism.highlight(value, grammar, lang);
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 语言名 → Prism 语法名（组件内部映射） */
export function toPrismLang(lang: string): PrismLang | null {
	switch (lang) {
		case "md":
			return "markdown";
		case "xml":
			return "markup";
		case "json":
			return "json";
		case "yaml":
			return "yaml";
		default:
			return null;
	}
}
