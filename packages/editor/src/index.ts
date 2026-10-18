/// <reference path="./foundation-types.d.ts" />
import {
	createCoreEditor,
	escapeHtml,
	type EditorLang,
	type PdEditorInstance,
	type PdEditorOptions,
} from "./core";
import { highlightPd } from "./pd-highlight";
import { highlightWithPrism, toPrismLang } from "./highlighters";

export type { EditorLang, PdEditorInstance, PdEditorOptions } from "./core";

// 语义 API（re-export @andares/pdfoundation，external + peer）——与 /pd 入口一致。
// vite lib 构建将共享语义包 external 掉（见 vite.config.ts rollupOptions.external），
// 运行时由消费方自动安装（dependencies），产物零体积、语义单一来源。
export { format, jsonToPdText, pdToJsonText } from "@andares/pdfoundation";

// pd 高亮 tokenizer 也在此导出：避免消费方为了 highlightPd 再去 import /pd
// （两入口各自打包 core，同时引入会带两份核心）。
export { highlightPd } from "./pd-highlight";

/**
 * Prism 高亮器（EditorLang 口径）——供 `<pd-editor>` 的 `highlight` 属性复用：
 * 元素入口默认只带 pd tokenizer（~几 KB），需要 md/json/yaml/xml 时由宿主显式注入，
 * 避免所有元素用户都背 Prism（~80 kB）。
 */
export function prismHighlighter(source: string, lang: EditorLang): string {
	const prismLang = toPrismLang(lang);
	return prismLang ? highlightWithPrism(source, prismLang) : escapeHtml(source);
}

/** 高亮器签名：源码 → 带 token class 的 HTML（内置实现全量转义用户文本） */
type Highlighter = (value: string) => string;

/**
 * 内置高亮管线。pd 用自研 tokenizer；md/xml/json/yaml 用 Prism（本入口因此包含 Prism）。
 */
function getHighlighter(lang: EditorLang): Highlighter {
	return (value: string) => {
		if (lang === "pd") return highlightPd(value);
		const prismLang = toPrismLang(lang);
		return prismLang ? highlightWithPrism(value, prismLang) : escapeHtml(value);
	};
}

/**
 * Headless 提示词输入框（全量入口）。
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

// re-export: semantic API（foundation；vite external，运行时由 dependencies 提供）
