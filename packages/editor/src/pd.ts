import type { Highlighter } from "yace";
import { createCoreEditor, escapeHtml } from "./core";
import { highlightPd } from "./pd-highlight";
import type { PdEditorInstance, PdEditorOptions } from "./core";

export type { EditorLang, PdEditorInstance, PdEditorOptions } from "./core";

/**
 * 内置高亮管线（pd-only）：pd 用自研 tokenizer，其余语言回退纯文本转义——
 * 本入口完全不引入 Prism，产物只含 Yace + 插件 + tokenizer + debounce。
 */
function getHighlighter(lang: string): Highlighter {
	return (value: string) => {
		if (lang === "pd") return highlightPd(value);
		return escapeHtml(value);
	};
}

/**
 * Headless 提示词输入框（基于 Yace）——pd-only 精简入口。
 * 仅 pd 语言高亮（自研 tokenizer）；setLanguage 切到 md/xml/json/yaml 时内容
 * 以纯文本渲染（无高亮但功能完好）。需要其余语言内置高亮时用主入口
 * `@andares/pdeditor`（含 Prism），或通过 options.highlight 自带高亮器（BYO）。
 */
export function createPdEditor(
	el: HTMLElement,
	options: PdEditorOptions = {},
): PdEditorInstance {
	return createCoreEditor(el, options, getHighlighter);
}
