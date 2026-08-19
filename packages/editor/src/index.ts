import type { Highlighter } from "yace";
import { createCoreEditor } from "./core";
import { highlightPd } from "./pd-highlight";
import { highlightWithPrism, toPrismLang } from "./highlighters";
import { escapeHtml, type PdEditorInstance, type PdEditorOptions } from "./core";

export type { EditorLang, PdEditorInstance, PdEditorOptions } from "./core";

/**
 * 内置高亮管线（Yace 管线第一级：html:false → 纯文本转 HTML）。
 * pd 用自研 tokenizer；md/xml/json/yaml 用 Prism（本入口因此包含 Prism）。
 */
function getHighlighter(lang: string): Highlighter {
	return (value: string) => {
		if (lang === "pd") return highlightPd(value);
		const prismLang = toPrismLang(lang);
		return prismLang ? highlightWithPrism(value, prismLang) : escapeHtml(value);
	};
}

/**
 * Headless 提示词输入框（基于 Yace）——全量入口。
 * 支持语言：pd（自研 tokenizer）/ md / xml / json / yaml（Prism）。
 * 只需 pd 高亮且不想要 Prism 体积时，改用精简入口 `@andares/pdeditor/pd`。
 * - 只渲染输入框内容（高亮层 + 原生 textarea），无任何 UI/chrome
 * - 语言切换是 API 行为（setLanguage），不做 UI 切换器
 * - 核心维护覆盖层排版不变量；外部框架定义容器外观与 token 配色
 */
export function createPdEditor(
	el: HTMLElement,
	options: PdEditorOptions = {},
): PdEditorInstance {
	return createCoreEditor(el, options, getHighlighter);
}
