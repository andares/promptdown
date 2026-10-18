/// <reference path="./foundation-types.d.ts" />
import {
	createCoreEditor,
	escapeHtml,
	type EditorLang,
	type PdEditorInstance,
	type PdEditorOptions,
	type TabBehavior,
} from "./core";
import { highlightPd } from "./pd-highlight";

// 语义 API 与 pd 高亮随元素入口一并可用（foundation 已是 external 依赖，re-export 零体积）
export { format, jsonToPdText, pdToJsonText } from "@andares/pdfoundation";
export { highlightPd } from "./pd-highlight";

/** 元素侧高亮器签名（与 core 的 options.highlight 一致） */
export type PdHighlighter = (source: string, lang: EditorLang) => string;

export interface PdEditorElement extends HTMLElement {
	value: string;
	language: string;
	placeholder: string;
	readOnly: boolean;
	disabled: boolean;
	lineNumbers: boolean;
	indentUnit: string;
	tabBehavior: TabBehavior;
	maxLength: number;
	name: string;
	/** BYO 高亮器；null = 回到内置 pd-only 管线 */
	highlight: PdHighlighter | null;
	readonly editor: PdEditorInstance | null;
	readonly textarea: HTMLTextAreaElement | null;
	setValue(value: string): void;
	getValue(): string;
	setLanguage(lang: string): void;
	insertText(text: string): void;
	getSelection(): { start: number; end: number } | null;
	setSelection(start: number, end?: number): void;
	undo(): void;
	redo(): void;
}

export type PdEditorElementConstructor = new () => PdEditorElement;

/** 元素默认高亮：pd 用自研 tokenizer；其余语言纯文本（需要 Prism 时注入 highlight） */
function pdHighlighter(lang: EditorLang) {
	return (source: string) => {
		if (lang === "pd") return highlightPd(source);
		return escapeHtml(source);
	};
}

// ---------------------------------------------------------------------------
// 样式：低 UI 默认值。只画文本/光标；无边框、背景、圆角、阴影。
// token 配色用 currentColor 派生（color-mix），任何宿主底色都不突兀；
// 所有可配置项走 CSS 变量，宿主不需要知道内部结构。
// 注意：token 规则绝不能改 font-size / padding / margin / border / font-weight
// （会破坏透明 textarea 与高亮层的逐字符对齐）。
// ---------------------------------------------------------------------------

function tokenRules(prefix: string): string {
	const p = prefix;
	return `
${p}.pd-key{color:var(--pd-token-key,color-mix(in oklab,currentColor 66%,transparent))}
${p}.pd-key-punct{color:var(--pd-token-punct,color-mix(in oklab,currentColor 45%,transparent))}
${p}.pd-item{color:var(--pd-token-item,color-mix(in oklab,currentColor 78%,transparent))}
${p}.pd-section{color:var(--pd-token-section,color-mix(in oklab,currentColor 62%,transparent))}
${p}.pd-sep{color:var(--pd-token-sep,color-mix(in oklab,currentColor 45%,transparent))}
${p}.pd-ref{color:var(--pd-token-ref,color-mix(in oklab,currentColor 74%,transparent))}
${p}.pd-inline-code{color:var(--pd-token-code,color-mix(in oklab,currentColor 84%,transparent))}
${p}.pd-fence{color:var(--pd-token-fence,color-mix(in oklab,currentColor 55%,transparent))}
${p}.token.comment,${p}.token.prolog,${p}.token.doctype,${p}.token.cdata{color:var(--pd-token-comment,color-mix(in oklab,currentColor 52%,transparent))}
${p}.token.string,${p}.token.attr-value{color:var(--pd-token-string,color-mix(in oklab,currentColor 78%,transparent))}
${p}.token.keyword,${p}.token.tag,${p}.token.operator{color:var(--pd-token-keyword,color-mix(in oklab,currentColor 64%,transparent))}
${p}.token.number,${p}.token.boolean{color:var(--pd-token-number,color-mix(in oklab,currentColor 72%,transparent))}
${p}.token.property,${p}.token.function{color:var(--pd-token-property,color-mix(in oklab,currentColor 68%,transparent))}
${p}.token.punctuation{color:var(--pd-token-punctuation,color-mix(in oklab,currentColor 50%,transparent))}
`;
}

/** color-mix 不支持时的中性回退（只改透明度，不改字形宽度） */
function opacityFallback(prefix: string): string {
	const p = prefix;
	return `
@supports not (color: color-mix(in oklab, red, blue)){
${p}.pd-key{opacity:.72}${p}.pd-key-punct{opacity:.5}${p}.pd-item{opacity:.8}
${p}.pd-section{opacity:.65}${p}.pd-sep{opacity:.5}${p}.pd-ref{opacity:.78}
${p}.pd-inline-code{opacity:.88}${p}.pd-fence{opacity:.6}
}`;
}

const SHADOW_CSS = `
:host{display:block;min-width:0;max-width:100%;height:auto;max-height:inherit;font:inherit;color:inherit;background:transparent}
:host([disabled]){opacity:var(--pd-disabled-opacity,.6)}
:host(:focus-within){outline:var(--pd-focus-ring,2px solid color-mix(in oklab,currentColor 32%,transparent));outline-offset:var(--pd-focus-ring-offset,2px);border-radius:var(--pd-focus-radius,2px)}
${tokenRules("")}
${opacityFallback("")}
`;

function lightCss(): string {
	const p = "pd-editor ";
	return `
pd-editor{display:block;min-width:0;max-width:100%;height:auto;max-height:inherit;font:inherit;color:inherit;background:transparent}
pd-editor[disabled]{opacity:var(--pd-disabled-opacity,.6)}
pd-editor:focus-within{outline:var(--pd-focus-ring,2px solid color-mix(in oklab,currentColor 32%,transparent));outline-offset:var(--pd-focus-ring-offset,2px);border-radius:var(--pd-focus-radius,2px)}
${tokenRules(p)}
${opacityFallback(p)}
`;
}

const lightStyled = new WeakSet<Document>();

function ensureLightStyles(doc: Document): void {
	if (lightStyled.has(doc)) return;
	lightStyled.add(doc);
	const style = doc.createElement("style");
	style.setAttribute("data-pd-editor", "");
	style.textContent = lightCss();
	(doc.head ?? doc.documentElement).appendChild(style);
}

function applyShadowStyles(shadow: ShadowRoot): void {
	if (shadow.querySelector("style[data-pd-editor]")) return;
	// 优先 constructable stylesheet（不走内联 <style>，对严格 CSP 更友好）
	try {
		if (
			typeof CSSStyleSheet !== "undefined" &&
			"replaceSync" in CSSStyleSheet.prototype
		) {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(SHADOW_CSS);
			shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
			return;
		}
	} catch {
		// 老浏览器 / CSP 限制：退回 <style>（严格 CSP 下由宿主自行提供样式）
	}
	const style = document.createElement("style");
	style.setAttribute("data-pd-editor", "");
	style.textContent = SHADOW_CSS;
	shadow.appendChild(style);
}

// ---------------------------------------------------------------------------
// 自定义元素（延迟定义：模块在 Node/SSR 下 import 不触碰 HTMLElement/customElements）
// ---------------------------------------------------------------------------

const OBSERVED = [
	"value",
	"language",
	"placeholder",
	"indent-unit",
	"line-numbers",
	"tab-behavior",
	"readonly",
	"disabled",
	"maxlength",
	"name",
	"spellcheck",
	"inputmode",
	"enterkeyhint",
	"dir",
	"aria-label",
	"aria-labelledby",
	"aria-describedby",
	"shadow",
] as const;

/**
 * 定义 `<pd-editor>`（幂等）。Node/SSR 下安全返回 null；浏览器里返回构造器。
 *
 * 用法：
 * ```ts
 * import { definePdEditor } from "@andares/pdeditor/element";
 * definePdEditor(); // 或 import "@andares/pdeditor/element/auto" 自动注册
 * ```
 */
export function definePdEditor(
	tagName = "pd-editor",
): PdEditorElementConstructor | null {
	if (typeof HTMLElement === "undefined" || typeof customElements === "undefined") {
		return null;
	}
	const existing = customElements.get(tagName);
	if (existing) return existing as PdEditorElementConstructor;

	class PdEditorElementImpl extends HTMLElement implements PdEditorElement {
		static formAssociated = true;
		static get observedAttributes(): readonly string[] {
			return OBSERVED;
		}

		private _editor: PdEditorInstance | null = null;
		private _internals: ElementInternals | null = null;
		private _container: HTMLElement | null = null;
		private _shadow: ShadowRoot | null = null;
		private _value = "";
		private _defaultValue: string | null = null;
		private _highlight: PdHighlighter | null = null;
		private _formDisabled = false;
		private _focusValue = "";

		constructor() {
			super();
			try {
				this._internals =
					typeof this.attachInternals === "function"
						? this.attachInternals()
						: null;
			} catch {
				this._internals = null;
			}
		}

		// ---- 属性 / 属性反射 ----
		get value(): string {
			return this._editor ? this._editor.getValue() : this._value;
		}
		set value(next: string) {
			const v = next == null ? "" : String(next);
			this._value = v;
			this._editor?.setValue(v);
			this._syncFormValue();
		}

		get language(): string {
			return this.getAttribute("language") ?? "pd";
		}
		set language(v: string) {
			this.setAttribute("language", String(v));
		}

		get placeholder(): string {
			return this.getAttribute("placeholder") ?? "";
		}
		set placeholder(v: string) {
			this.setAttribute("placeholder", String(v));
		}

		get readOnly(): boolean {
			return this.hasAttribute("readonly");
		}
		set readOnly(v: boolean) {
			this.toggleAttribute("readonly", Boolean(v));
		}

		get disabled(): boolean {
			return this.hasAttribute("disabled");
		}
		set disabled(v: boolean) {
			this.toggleAttribute("disabled", Boolean(v));
		}

		get lineNumbers(): boolean {
			return this.hasAttribute("line-numbers");
		}
		set lineNumbers(v: boolean) {
			this.toggleAttribute("line-numbers", Boolean(v));
		}

		get indentUnit(): string {
			return this.getAttribute("indent-unit") ?? "  ";
		}
		set indentUnit(v: string) {
			this.setAttribute("indent-unit", String(v));
		}

		get tabBehavior(): TabBehavior {
			return this.getAttribute("tab-behavior") === "focus" ? "focus" : "indent";
		}
		set tabBehavior(v: TabBehavior) {
			this.setAttribute("tab-behavior", v === "focus" ? "focus" : "indent");
		}

		get maxLength(): number {
			const raw = this.getAttribute("maxlength");
			if (raw === null || raw === "") return -1;
			const n = Number.parseInt(raw, 10);
			return Number.isFinite(n) ? n : -1;
		}
		set maxLength(v: number) {
			// maxLength 属性不接受负数；只有显式设置非负数才生效，-1/undefined/NaN 用于移除限制
			if (!Number.isFinite(v) || v < 0) this.removeAttribute("maxlength");
			else this.setAttribute("maxlength", String(Math.floor(v)));
		}

		get name(): string {
			return this.getAttribute("name") ?? "";
		}
		set name(v: string) {
			this.setAttribute("name", String(v));
		}

		get highlight(): PdHighlighter | null {
			return this._highlight;
		}
		set highlight(fn: PdHighlighter | null) {
			this._highlight = typeof fn === "function" ? fn : null;
			this._syncOptions();
		}

		get editor(): PdEditorInstance | null {
			return this._editor;
		}
		get textarea(): HTMLTextAreaElement | null {
			return this._editor?.textarea ?? null;
		}

		// ---- 生命周期 ----
		connectedCallback(): void {
			this._upgradeProperties();
			const attrValue = this.getAttribute("value");
			if (attrValue !== null && this._value === "") this._value = attrValue;
			if (this._defaultValue === null) this._defaultValue = this._value;
			if (this._editor) return;

			const light = this.getAttribute("shadow") === "false";
			if (!light) {
				this._shadow ??= this.attachShadow({
					mode: "open",
					delegatesFocus: true,
				});
				applyShadowStyles(this._shadow);
			} else {
				ensureLightStyles(this.ownerDocument);
			}
			const root: HTMLElement | ShadowRoot = light ? this : this._shadow!;
			const container = document.createElement("div");
			container.className = "pd-container";
			container.setAttribute("part", "container");
			// 让引擎看到“宿主给定的高度”：height:100% 在宿主 auto 高度时仍为 auto；
			// max-height:inherit 把宿主的 max-height 透给容器/引擎（侧栏、弹窗、表单常见）。
			container.style.cssText =
				"display:block;height:100%;max-height:inherit;min-width:0";
			root.appendChild(container);
			this._container = container;

			const options: PdEditorOptions = {
				value: this._value,
				language: this.language,
				placeholder: this.placeholder,
				readOnly: this.readOnly,
				disabled: this.disabled || this._formDisabled,
				lineNumbers: this.lineNumbers,
				indentUnit: this.indentUnit,
				tabBehavior: this.tabBehavior,
				maxLength: this.maxLength,
				spellcheck: this.getAttribute("spellcheck") === "true",
				dir: this.getAttribute("dir") ?? "",
				ariaLabel: this.getAttribute("aria-label") ?? undefined,
				ariaLabelledby: this.getAttribute("aria-labelledby") ?? undefined,
				ariaDescribedby: this.getAttribute("aria-describedby") ?? undefined,
				highlight: this._highlight ?? undefined,
				onValueChange: (v) => this._handleValueChange(v),
			};
			this._editor = createCoreEditor(container, options, pdHighlighter);
			this._editor.textarea.addEventListener("focus", this._onFocus);
			this._editor.textarea.addEventListener("blur", this._onBlur);
			this._focusValue = this._value;
			this._applyInputHints();
			this._syncFormValue();
			queueMicrotask(() => {
				if (this._editor) this._emit("pd-ready", { editor: this._editor });
			});
		}

		disconnectedCallback(): void {
			if (this._editor) this._value = this._editor.getValue();
			this._editor?.textarea.removeEventListener("focus", this._onFocus);
			this._editor?.textarea.removeEventListener("blur", this._onBlur);
			this._editor?.destroy();
			this._editor = null;
			this._container?.remove();
			this._container = null;
		}

		attributeChangedCallback(
			name: string,
			oldValue: string | null,
			newValue: string | null,
		): void {
			if (oldValue === newValue) return;
			if (name === "value") {
				this._value = newValue ?? "";
				this._editor?.setValue(this._value);
				this._syncFormValue();
				return;
			}
			if (name === "shadow") return; // 模式在 connectedCallback 时固定
			if (!this._editor) return;
			this._syncOptions();
			if (name === "language") {
				this._emit("pd-language-change", { value: this.language });
			}
		}

		// ---- 表单关联 ----
		formResetCallback(): void {
			this.value = this._defaultValue ?? "";
		}
		formDisabledCallback(disabled: boolean): void {
			this._formDisabled = disabled;
			this._editor?.setDisabled(disabled || this.disabled);
		}
		formStateRestoreCallback(state: string | File | FormData | null): void {
			if (typeof state === "string") this.value = state;
		}

		// ---- 公共方法 ----
		setValue(v: string): void {
			this.value = v;
		}
		getValue(): string {
			return this.value;
		}
		setLanguage(lang: string): void {
			this.language = lang;
		}
		insertText(text: string): void {
			this._editor?.insertText(text);
		}
		getSelection(): { start: number; end: number } | null {
			return this._editor?.getSelection() ?? null;
		}
		setSelection(start: number, end?: number): void {
			this._editor?.setSelection(start, end);
		}
		undo(): void {
			this._editor?.undo();
		}
		redo(): void {
			this._editor?.redo();
		}
		focus(): void {
			this._editor?.focus();
		}
		blur(): void {
			this._editor?.blur();
		}

		// ---- 内部 ----
		private _upgradeProperties(): void {
			const props = [
				"value",
				"language",
				"placeholder",
				"readOnly",
				"disabled",
				"lineNumbers",
				"indentUnit",
				"tabBehavior",
				"maxLength",
				"name",
				"highlight",
			] as const;
			for (const prop of props) {
				if (Object.prototype.hasOwnProperty.call(this, prop)) {
					// SAFETY: "upgrade property" 模式——框架可能在元素定义前写入同名 own property，
					// 这里把它搬回原型上的 accessor；prop 均来自下方显式列表（类型检查覆盖）。
					const self = this as unknown as Record<string, unknown>;
					const v = self[prop];
					delete self[prop];
					self[prop] = v;
				}
			}
		}

		private _syncOptions(): void {
			this._editor?.update({
				language: this.language,
				placeholder: this.placeholder,
				readOnly: this.readOnly,
				disabled: this.disabled || this._formDisabled,
				lineNumbers: this.lineNumbers,
				indentUnit: this.indentUnit,
				tabBehavior: this.tabBehavior,
				maxLength: this.maxLength,
				spellcheck: this.getAttribute("spellcheck") === "true",
				dir: this.getAttribute("dir") ?? "",
				ariaLabel: this.getAttribute("aria-label") ?? undefined,
				ariaLabelledby: this.getAttribute("aria-labelledby") ?? undefined,
				ariaDescribedby: this.getAttribute("aria-describedby") ?? undefined,
				highlight: this._highlight ?? undefined,
			});
			this._applyInputHints();
		}

		/** 移动端输入提示：inputmode / enterkeyhint 原样转发到内部 textarea */
		private _applyInputHints(): void {
			const ta = this._editor?.textarea;
			if (!ta) return;
			for (const name of ["inputmode", "enterkeyhint"]) {
				const value = this.getAttribute(name);
				if (value) ta.setAttribute(name, value);
				else ta.removeAttribute(name);
			}
		}

		private _handleValueChange(value: string): void {
			this._value = value;
			this._syncFormValue();
			this._emit("pd-input", { value });
		}

		private _syncFormValue(): void {
			// jsdom / 老浏览器可能没有 ElementInternals.setFormValue：能力检测后再调用
			if (typeof this._internals?.setFormValue === "function") {
				this._internals.setFormValue(this._value);
			}
		}

		private _onFocus = (): void => {
			this._focusValue = this._value;
			this._emit("pd-focus", { value: this._value });
		};
		private _onBlur = (): void => {
			if (this._value !== this._focusValue) {
				this._emit("pd-change", { value: this._value });
			}
			this._emit("pd-blur", { value: this._value });
		};

		private _emit(type: string, detail?: unknown): void {
			this.dispatchEvent(
				new CustomEvent(type, { detail, bubbles: true, composed: true }),
			);
		}
	}

	customElements.define(tagName, PdEditorElementImpl);
	// SAFETY: PdEditorElementImpl 实现了 PdEditorElement 接口；此处只需擦除局部类名，
	// 让调用方拿到的构造器返回公共接口类型（而不是函数内局部类）。
	return PdEditorElementImpl as unknown as PdEditorElementConstructor;
}

// 元素入口：definePdEditor() 延迟定义；模块 import 在 Node/SSR 下安全。
