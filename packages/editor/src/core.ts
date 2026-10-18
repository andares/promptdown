import { debounce } from "es-toolkit";
import {
	pdListItem,
	pdTab,
	type Plugin,
	type PluginProps,
} from "./plugins";

/**
 * 语言标识。保留常用值补全，同时允许自定义语言名（BYO highlighter 场景）：
 * `language` 本身是字符串，内置高亮器只识别 pd/md/xml/json/yaml。
 */
export type EditorLang =
	| "pd"
	| "md"
	| "xml"
	| "json"
	| "yaml"
	| (string & {});

/** Tab 行为：indent = 插入/整行缩进（pd 编辑语义）；focus = 原生焦点移动（表单/无障碍优先） */
export type TabBehavior = "indent" | "focus";

export interface PdEditorOptions {
	value?: string;
	language?: EditorLang;
	lineNumbers?: boolean;
	/**
	 * 排版样式（camelCase 或 CSS 变量）。字体、行高、字距、padding 等几何样式
	 * 由引擎统一应用到覆盖层，**不要**再分别设置内部 textarea / pre。
	 * `padding` 类样式会同时应用到高亮层/输入层（不会被挂载点吞掉）。
	 */
	styles?: Record<string, string>;
	/** 缩进单位（Tab 整行缩进 / 续行 `- ` 用；默认两个空格） */
	indentUnit?: string;
	/** 外部注入的 highlighter（BYO，覆盖内置）——lang 参数由内部传入 */
	highlight?: (source: string, lang: EditorLang) => string;
	onValueChange?: (value: string) => void;
	/** 空值占位符（由覆盖层渲染；不依赖 textarea 的透明文字） */
	placeholder?: string;
	readOnly?: boolean;
	disabled?: boolean;
	maxLength?: number;
	/** 默认 false（代码/提示词输入不参与拼写检查） */
	spellcheck?: boolean;
	/**
	 * Tab 行为。默认 indent（保持 pd 编辑语义）；按下 Escape 后的下一次 Tab
	 * 会移动焦点（键盘用户的逃生通道）。focus = Tab 始终移动焦点。
	 */
	tabBehavior?: TabBehavior;
	/** 撤销记忆步数（不含初始值；默认 5） */
	historyLimit?: number;
	/** 撤销快照落栈防抖毫秒（默认 1000；连续打字合并为一步） */
	historyDebounce?: number;
	/** 超过该字符数降级为纯文本高亮（避免超大文档每键全量 tokenize；默认 100000） */
	highlightThreshold?: number;
	ariaLabel?: string;
	ariaLabelledby?: string;
	ariaDescribedby?: string;
	dir?: string;
}

export interface PdEditorInstance {
	setValue(value: string, options?: { resetHistory?: boolean }): void;
	getValue(): string;
	setLanguage(lang: EditorLang): void;
	setPlaceholder(text: string): void;
	setReadOnly(readOnly: boolean): void;
	setDisabled(disabled: boolean): void;
	setLineNumbers(enabled: boolean): void;
	/** 运行时更新选项（样式/padding/语言/只读/行号/缩进等） */
	update(options: Partial<PdEditorOptions>): void;
	focus(): void;
	blur(): void;
	undo(): void;
	redo(): void;
	insertText(text: string): void;
	getSelection(): { start: number; end: number };
	setSelection(start: number, end?: number): void;
	destroy(): void;
	/** 原生 textarea 元素（外部可自行监听事件） */
	textarea: HTMLTextAreaElement;
	/** 引擎根节点（宿主样式/事件挂载点；自定义元素据此暴露 part） */
	root: HTMLElement;
	/** 高亮覆盖层（调试/自定义渲染用） */
	pre: HTMLElement;
}

/** HTML 转义（纯文本高亮回退 / sizer / 各入口共用） */
export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

/** 换行归一化：textarea 的 value setter 会把 CRLF/CR 归一为 LF，引擎内部保持一致 */
export function normalizeEol(s: string): string {
	return s.replace(/\r\n?/g, "\n");
}

/**
 * 写入可信 HTML（高亮层专用）。内置高亮器已转义全部用户文本；
 * BYO highlighter 的返回值由调用方担保。用 Range 解析而非 innerHTML 赋值，
 * 语义相同（同样不执行 script），同时避开“innerHTML 即注入”的静态检查噪音。
 */
function setTrustedHtml(node: HTMLElement, html: string): void {
	const range = document.createRange();
	range.selectNodeContents(node);
	node.replaceChildren(range.createContextualFragment(html));
}

/** 撤销/重做快照：值 + 光标选区（恢复时光标一并回到当时位置） */
interface HistorySnapshot {
	value: string;
	selStart: number;
	selEnd: number;
}

/** 公共前缀长度（O(n)，只在首次落栈推导初始光标时用一次） */
function commonPrefixLen(a: string, b: string): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
	return i;
}

const PADDING_KEYS = new Set([
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
]);

interface Padding {
	top: string;
	right: string;
	bottom: string;
	left: string;
}

/** 解析 padding（简写 1–4 值 + 四向覆盖）；无法解析的值按原样使用 */
function splitPadding(styles: Record<string, string>): Padding {
	const out: Padding = {
		top: "0px",
		right: "0px",
		bottom: "0px",
		left: "0px",
	};
	const shorthand = styles.padding?.trim();
	if (shorthand) {
		const p = shorthand.split(/\s+/);
		if (p.length === 1) {
			const v = p[0] ?? "0px";
			out.top = out.right = out.bottom = out.left = v;
		} else if (p.length === 2) {
			out.top = out.bottom = p[0] ?? "0px";
			out.right = out.left = p[1] ?? "0px";
		} else if (p.length === 3) {
			out.top = p[0] ?? "0px";
			out.right = out.left = p[1] ?? "0px";
			out.bottom = p[2] ?? "0px";
		} else {
			out.top = p[0] ?? "0px";
			out.right = p[1] ?? "0px";
			out.bottom = p[2] ?? "0px";
			out.left = p[3] ?? "0px";
		}
	}
	if (styles.paddingTop) out.top = styles.paddingTop;
	if (styles.paddingRight) out.right = styles.paddingRight;
	if (styles.paddingBottom) out.bottom = styles.paddingBottom;
	if (styles.paddingLeft) out.left = styles.paddingLeft;
	return out;
}

/** camelCase → kebab-case（CSS 变量 `--x` 原样保留） */
function kebab(key: string): string {
	if (key.startsWith("--")) return key;
	return key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * 排版不变量（覆盖层方案的全部前提）：
 * - 两层（高亮 pre / 透明 textarea）+ 行号层必须使用完全相同的字体度量与盒模型；
 * - 只改颜色/字重/字形的 token 样式不能改变宽度或盒模型（README 已文档化）；
 * - font-variant-ligatures:none——跨 span 的连字会破坏宽度一致性（textarea 没有 span 边界）；
 * - scrollbar-gutter:stable（textarea/pre/lines/placeholder）保证“滚动条出现前后”
 *   两层内容宽度一致（Chromium 实测 clientWidth 相同）。
 *
 * 高度模型：默认 pre 在文档流内 → root 高 = 内容高（纯 CSS 自适应）；
 * 当宿主高度（height/max-height/flex）小于内容时，updateLayout 切换到“内滚模式”：
 * pre 绝对铺满、root 显式高度、textarea 内部滚动 + pre/行号层 scrollTop 同步。
 * 两种模式都不修改宿主样式，也不引入 sizer 副本（避免每键两次文本布局）。
 */
const BASE_ROOT =
	"position:relative;display:block;box-sizing:border-box;width:100%;" +
	"height:auto;max-height:inherit;overflow:hidden;text-align:start;margin:0;border:0;" +
	"font-family:var(--pd-font-family,inherit);font-size:var(--pd-font-size,inherit);" +
	"line-height:var(--pd-line-height,1.5);letter-spacing:var(--pd-letter-spacing,inherit);" +
	"color:var(--pd-color,inherit);background:var(--pd-background,transparent);tab-size:4;" +
	"font-variant-ligatures:none;font-kerning:normal;";

const BASE_TEXTAREA =
	"position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;" +
	"margin:0;border:0;outline:none;resize:none;background:transparent;" +
	"-webkit-text-fill-color:transparent;caret-color:var(--pd-caret-color,currentColor);" +
	"overflow:auto;scrollbar-gutter:stable;white-space:pre-wrap;overflow-wrap:break-word;" +
	"word-break:normal;font:inherit;line-height:inherit;letter-spacing:inherit;" +
	"tab-size:inherit;z-index:2;";

const BASE_PRE =
	"position:relative;left:auto;top:auto;width:100%;height:auto;box-sizing:border-box;" +
	"margin:0;border:0;overflow:hidden;scrollbar-gutter:stable;pointer-events:none;" +
	"user-select:none;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;" +
	"font:inherit;line-height:inherit;letter-spacing:inherit;tab-size:inherit;" +
	"color:inherit;z-index:1;";

const BASE_LINES =
	"position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;" +
	"margin:0;border:0;overflow:hidden;scrollbar-gutter:stable;pointer-events:none;" +
	"user-select:none;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;" +
	"font:inherit;line-height:inherit;letter-spacing:inherit;tab-size:inherit;" +
	"color:inherit;z-index:0;";

const BASE_PLACEHOLDER =
	"position:absolute;left:0;top:0;width:100%;height:100%;box-sizing:border-box;" +
	"margin:0;border:0;overflow:hidden;scrollbar-gutter:stable;pointer-events:none;user-select:none;" +
	"white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;" +
	"font:inherit;line-height:inherit;letter-spacing:inherit;tab-size:inherit;" +
	"color:inherit;opacity:var(--pd-placeholder-opacity,0.5);z-index:1;";

function createPart<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
	part: string,
	css: string,
	attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = className;
	node.setAttribute("part", part);
	node.style.cssText = css;
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
	return node;
}

/**
 * Headless 低 UI 编辑器核心——DOM/排版/输入管线。
 *
 * 设计：
 * - **不修改挂载点样式**：只在挂载点内追加 `.pd-root`，宿主布局/边框/padding 全归宿主；
 * - **纯 CSS 自适应高度**：in-flow 的隐藏 sizer 决定 root 高度；textarea/pre 绝对铺满。
 *   宿主给 `height/max-height` 时自动切换为“内滚 + 覆盖层同步”，无需 JS 测高；
 * - **低 UI 默认**：字体/字号/颜色全部 inherit，只有 line-height 1.5 是温和默认值；
 * - **主题**走 CSS 变量（--pd-caret-color / --pd-placeholder-opacity / --pd-gutter-color），
 *   token 配色由外部 CSS 决定（element 入口提供中性默认主题）。
 */
export function createCoreEditor(
	el: HTMLElement,
	options: PdEditorOptions,
	getHighlighter: (lang: EditorLang) => (value: string) => string,
): PdEditorInstance {
	let opts: PdEditorOptions = { ...options };
	let lang: EditorLang = opts.language ?? "pd";
	let value = normalizeEol(opts.value ?? "");
	let committedValue = value;
	let destroyed = false;
	let composing = false;
	let escapeNextTab = false;
	let lineNumbersOn = opts.lineNumbers ?? false;
	let currentHighlighter = makeHighlighter();
	let gutter = "";
	let scrollMode = false;
	let layoutRaf = 0;
	let resizeObserver: ResizeObserver | null = null;

	const root = createPart("div", "pd-root", "root", BASE_ROOT);
	const pre = createPart("pre", "pd-highlight", "highlight", BASE_PRE, {
		"aria-hidden": "true",
	});
	const ta = createPart("textarea", "pd-input", "input", BASE_TEXTAREA);
	const placeholder = createPart("div", "pd-placeholder", "placeholder", BASE_PLACEHOLDER, {
		"aria-hidden": "true",
	});
	let lines: HTMLPreElement | null = null;

	ta.spellcheck = opts.spellcheck ?? false;
	ta.setAttribute("autocapitalize", "off");
	ta.setAttribute("autocorrect", "off");
	ta.setAttribute("autocomplete", "off");
	ta.setAttribute("wrap", "soft");
	ta.value = value;
	ta.readOnly = opts.readOnly ?? false;
	ta.disabled = opts.disabled ?? false;
	// maxLength 的 IDL 不接受负数（-1 在部分实现抛 IndexSizeError）；-1/undefined = 不限制
	const applyMaxLength = (n: number | undefined) => {
		if (n !== undefined && n >= 0) ta.maxLength = n;
		else ta.removeAttribute("maxlength");
	};
	applyMaxLength(opts.maxLength);
	if (opts.dir) ta.dir = opts.dir;
	applyAria();

	root.appendChild(pre);
	root.appendChild(placeholder);
	root.appendChild(ta);
	el.appendChild(root);

	applyStyles();
	updatePlaceholder();
	render();
	updateLayout();

	// ---- 事件：输入 / 组合 / 键处理 / 滚动 ----
	function syncScroll() {
		if (destroyed) return;
		pre.scrollTop = ta.scrollTop;
		pre.scrollLeft = ta.scrollLeft;
		if (lines) {
			lines.scrollTop = ta.scrollTop;
			lines.scrollLeft = ta.scrollLeft;
		}
	}

	// ---- 高度模式：流式自适应（pre in-flow）↔ 内滚（pre 铺满 + textarea 滚动） ----
	function availableHeight(): number {
		if (typeof getComputedStyle !== "function") return 0;
		const cs = getComputedStyle(el);
		const pt = Number.parseFloat(cs.paddingTop) || 0;
		const pb = Number.parseFloat(cs.paddingBottom) || 0;
		return Math.max(0, el.clientHeight - pt - pb);
	}
	function applyScrollMode() {
		if (scrollMode) {
			pre.style.position = "absolute";
			pre.style.left = "0";
			pre.style.top = "0";
			pre.style.height = "100%";
		} else {
			pre.style.position = "relative";
			pre.style.left = "auto";
			pre.style.top = "auto";
			pre.style.height = "auto";
		}
	}
	function updateLayout() {
		if (destroyed) return;
		const avail = availableHeight();
		// scrollHeight 在两种模式下都是“内容总高”（pre 高度 auto 或 100% 都不影响 scrollHeight）
		const content = pre.scrollHeight;
		if (!scrollMode) {
			if (avail > 0 && content > avail + 1) {
				scrollMode = true;
				applyScrollMode();
				root.style.height = `${avail}px`;
				syncScroll();
			}
			return;
		}
		if (avail <= 0 || content <= avail + 1) {
			scrollMode = false;
			applyScrollMode();
			root.style.height = "";
			ta.scrollTop = 0;
			return;
		}
		const current = Number.parseFloat(root.style.height) || 0;
		if (Math.abs(current - avail) > 0.5) root.style.height = `${avail}px`;
		syncScroll();
	}
	function scheduleLayout() {
		if (layoutRaf) return;
		if (typeof requestAnimationFrame !== "function") {
			updateLayout();
			return;
		}
		layoutRaf = requestAnimationFrame(() => {
			layoutRaf = 0;
			updateLayout();
		});
	}

	// 宿主尺寸变化（侧栏拖拽/弹窗/字体加载/显示切换）→ 重新判定高度模式
	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => scheduleLayout());
		resizeObserver.observe(el);
		resizeObserver.observe(root);
	}

	const onScroll = () => syncScroll();

	const commit = (next: string, selStart: number, selEnd: number) => {
		value = next;
		committedValue = next;
		scheduleHistory({ value: next, selStart, selEnd });
		opts.onValueChange?.(next);
	};

	const handleInput = (event?: Event) => {
		if (destroyed) return;
		const next = normalizeEol(ta.value);
		// 组合期：只同步渲染层（不提交、不通知、不入历史）
		if (composing || (event as InputEvent | undefined)?.isComposing) {
			value = next;
			render();
			return;
		}
		if (next !== value) {
			value = next;
			render();
		}
		if (next !== committedValue) {
			commit(next, ta.selectionStart, ta.selectionEnd);
		}
	};

	const onCompositionStart = () => {
		composing = true;
	};
	const onCompositionEnd = () => {
		composing = false;
		// 组合可能被取消（值回退）：先同步显示；提交交给随后的 input 事件。
		const next = normalizeEol(ta.value);
		if (next !== value) {
			value = next;
			render();
		}
	};

	// ---- 撤销 / 重做（双栈，快照含光标；初始快照恒在栈底） ----
	const historyLimit = Math.max(0, opts.historyLimit ?? 5);
	const historyDebounce = Math.max(0, opts.historyDebounce ?? 1000);
	const undoStack: HistorySnapshot[] = [
		{ value, selStart: -1, selEnd: -1 },
	];
	const redoStack: HistorySnapshot[] = [];

	const trimHistory = () => {
		if (undoStack.length > historyLimit + 1) undoStack.splice(1, 1);
	};
	const pushHistory = (snap: HistorySnapshot) => {
		const base = undoStack[0];
		if (base !== undefined && base.selStart < 0 && base.value !== snap.value) {
			const p = commonPrefixLen(base.value, snap.value);
			base.selStart = p;
			base.selEnd = p;
		}
		const top = undoStack.at(-1);
		if (top !== undefined && top.value === snap.value) return;
		redoStack.length = 0;
		undoStack.push(snap);
		trimHistory();
	};
	const debouncedCommit = debounce(pushHistory, historyDebounce);
	const scheduleHistory = (snap: HistorySnapshot) => {
		if (historyDebounce === 0) {
			pushHistory(snap);
		} else {
			debouncedCommit(snap);
		}
	};

	const applySnapshot = (snap: HistorySnapshot) => {
		const selStart =
			snap.selStart >= 0 ? snap.selStart : Math.min(snap.value.length, ta.selectionStart);
		const selEnd = snap.selEnd >= 0 ? snap.selEnd : selStart;
		value = snap.value;
		committedValue = snap.value;
		ta.value = snap.value;
		ta.setSelectionRange(
			Math.max(0, Math.min(selStart, snap.value.length)),
			Math.max(0, Math.min(selEnd, snap.value.length)),
		);
		render();
		syncScroll();
		opts.onValueChange?.(snap.value);
	};

	const undo = (): boolean => {
		debouncedCommit.flush();
		if (undoStack.length <= 1) return false;
		const cur = undoStack.pop();
		if (cur !== undefined) redoStack.push(cur);
		const prev = undoStack.at(-1);
		if (prev !== undefined) applySnapshot(prev);
		return true;
	};
	const redo = (): boolean => {
		debouncedCommit.flush();
		if (redoStack.length === 0) return false;
		const next = redoStack.pop();
		if (next === undefined) return false;
		undoStack.push(next);
		trimHistory();
		applySnapshot(next);
		return true;
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (destroyed) return;
		if (event.isComposing || composing) return;
		if (ta.readOnly || ta.disabled) return;

		const mod = event.ctrlKey || event.metaKey;
		const key = event.key.toLowerCase();
		if (mod && (key === "z" || key === "y")) {
			// 始终吃掉组合键：避免栈空时落到浏览器原生撤销，产生两套语义。
			event.preventDefault();
			const isRedo = key === "y" || (key === "z" && event.shiftKey);
			if (isRedo) redo();
			else undo();
			return;
		}

		// Escape 后的一次 Tab 让出焦点（键盘用户逃生通道）；Tab 行为为 focus 时始终让出。
		if (key === "escape") {
			if ((opts.tabBehavior ?? "indent") === "indent") escapeNextTab = true;
			return;
		}
		if (key === "tab" && (opts.tabBehavior ?? "indent") === "focus") return;
		if (key === "tab" && escapeNextTab) {
			escapeNextTab = false;
			return;
		}

		const base: PluginProps = {
			value,
			selectionStart: ta.selectionStart,
			selectionEnd: ta.selectionEnd,
		};
		let next = base;
		for (const plugin of plugins) {
			const patch = plugin(next, event);
			if (patch) next = { ...next, ...patch };
		}
		if (
			next.value !== base.value ||
			next.selectionStart !== base.selectionStart ||
			next.selectionEnd !== base.selectionEnd
		) {
			event.preventDefault();
			value = next.value;
			ta.value = next.value;
			ta.setSelectionRange(next.selectionStart, next.selectionEnd);
			committedValue = next.value;
			render();
			scheduleHistory({
				value: next.value,
				selStart: next.selectionStart,
				selEnd: next.selectionEnd,
			});
			opts.onValueChange?.(next.value);
			syncScroll();
		}
	};

	const onFocus = () => root.classList.add("pd-focused");
	const onBlur = () => root.classList.remove("pd-focused");

	ta.addEventListener("input", handleInput);
	ta.addEventListener("compositionstart", onCompositionStart);
	ta.addEventListener("compositionend", onCompositionEnd);
	ta.addEventListener("scroll", onScroll, { passive: true });
	ta.addEventListener("keydown", onKeyDown);
	ta.addEventListener("focus", onFocus);
	ta.addEventListener("blur", onBlur);

	// ---- 高亮 / 渲染 ----
	function makeHighlighter() {
		if (opts.highlight) {
			return (source: string) => opts.highlight?.(source, lang) ?? "";
		}
		return getHighlighter(lang);
	}

	function render() {
		if (destroyed) return;
		const threshold = opts.highlightThreshold ?? 100000;
		const html =
			value.length > threshold ? escapeHtml(value) : currentHighlighter(value);
		// 内置高亮器输出为可信 HTML（用户文本已全量转义）；BYO highlighter 由调用方担保。
		setTrustedHtml(pre, `${html}<br/>`);
		if (lineNumbersOn) renderLines();
		updatePlaceholder();
		// 不在输入热路径强制布局：高度/滚动同步交给 ResizeObserver、scroll 事件与
		// 程序化操作（setValue/undo/insertText）。无 RO 的旧环境才降级为 rAF 测高。
		if (!resizeObserver) scheduleLayout();
	}

	function renderLines() {
		if (!lineNumbersOn) return;
		if (!lines) {
			lines = document.createElement("pre");
			lines.className = "pd-lines";
			lines.setAttribute("part", "gutter");
			lines.setAttribute("aria-hidden", "true");
			root.insertBefore(lines, placeholder);
		}
		const split = value.split("\n");
		const digits = String(split.length).length;
		const nextGutter = `${digits + 1}ch`;
		const pad = splitPadding(opts.styles ?? {});
		const numStyle =
			`position:absolute;inset-inline-start:${pad.left};width:${nextGutter};text-align:end;` +
			"opacity:var(--pd-gutter-opacity,0.35);color:var(--pd-gutter-color,inherit)";
		const fragment = document.createDocumentFragment();
		split.forEach((line, i) => {
			const num = document.createElement("span");
			num.className = "pd-ln";
			num.style.cssText = numStyle;
			num.textContent = String(i + 1);
			const phantom = document.createElement("span");
			phantom.style.color = "transparent";
			phantom.textContent = line;
			fragment.append(num, phantom);
			if (i < split.length - 1) fragment.append(document.createTextNode("\n"));
		});
		fragment.append(document.createElement("br"));
		lines.replaceChildren(fragment);
		if (nextGutter !== gutter) {
			gutter = nextGutter;
			applyStyles();
			lines.style.cssText = linesCss(pad);
		}
	}

	function updatePlaceholder() {
		const text = opts.placeholder ?? "";
		placeholder.textContent = text;
		placeholder.style.display = text && value.length === 0 ? "block" : "none";
		if (text) ta.setAttribute("aria-placeholder", text);
		else ta.removeAttribute("aria-placeholder");
	}

	// ---- 样式（root / 各覆盖层统一） ----
	function layerPadding(pad: Padding): string {
		const left = gutter ? `calc(${pad.left} + ${gutter})` : pad.left;
		return `padding:${pad.top} ${pad.right} ${pad.bottom} ${left};`;
	}
	function layersCss(pad: Padding, base: string): string {
		return base + layerPadding(pad);
	}
	function linesCss(pad: Padding): string {
		return BASE_LINES + layerPadding(pad);
	}

	function applyStyles() {
		const styles = opts.styles ?? {};
		const pad = splitPadding(styles);
		const extra = Object.entries(styles)
			.filter(([k]) => !PADDING_KEYS.has(k))
			.map(([k, v]) => `${kebab(k)}:${v};`)
			.join("");
		root.style.cssText = BASE_ROOT + extra;
		pre.style.cssText = layersCss(pad, BASE_PRE);
		ta.style.cssText = layersCss(pad, BASE_TEXTAREA);
		placeholder.style.cssText = layersCss(pad, BASE_PLACEHOLDER);
		if (lines) lines.style.cssText = linesCss(pad);
		applyScrollMode();
		if (opts.dir) {
			root.dir = opts.dir;
			ta.dir = opts.dir;
			pre.dir = opts.dir;
			placeholder.dir = opts.dir;
			if (lines) lines.dir = opts.dir;
		}
	}

	function applyAria() {
		if (opts.ariaLabel) ta.setAttribute("aria-label", opts.ariaLabel);
		else ta.removeAttribute("aria-label");
		if (opts.ariaLabelledby)
			ta.setAttribute("aria-labelledby", opts.ariaLabelledby);
		else ta.removeAttribute("aria-labelledby");
		if (opts.ariaDescribedby)
			ta.setAttribute("aria-describedby", opts.ariaDescribedby);
		else ta.removeAttribute("aria-describedby");
		if (opts.readOnly) ta.setAttribute("aria-readonly", "true");
		else ta.removeAttribute("aria-readonly");
		if (opts.disabled) ta.setAttribute("aria-disabled", "true");
		else ta.removeAttribute("aria-disabled");
	}

	// 首帧已渲染；lineNumbers 开启时补一次（render 内已处理）
	if (lineNumbersOn) renderLines();

	const plugins: Plugin[] = [pdListItem(), pdTab(opts.indentUnit ?? "  ")];

	return {
		setValue(next, setOptions) {
			if (destroyed) return;
			if (composing) return;
			let v = normalizeEol(next);
			if (opts.maxLength !== undefined && opts.maxLength >= 0) {
				v = v.slice(0, opts.maxLength);
			}
			debouncedCommit.cancel();
			value = v;
			committedValue = v;
			ta.value = v;
			ta.setSelectionRange(v.length, v.length);
			if (setOptions?.resetHistory ?? true) {
				undoStack.length = 0;
				undoStack.push({ value: v, selStart: -1, selEnd: -1 });
				redoStack.length = 0;
			}
			render();
			syncScroll();
		},
		getValue() {
			return value;
		},
		setLanguage(next) {
			lang = next;
			opts = { ...opts, language: next };
			currentHighlighter = makeHighlighter();
			render();
		},
		setPlaceholder(text) {
			opts = { ...opts, placeholder: text };
			updatePlaceholder();
		},
		setReadOnly(readOnly) {
			opts = { ...opts, readOnly };
			ta.readOnly = readOnly;
			applyAria();
		},
		setDisabled(disabled) {
			opts = { ...opts, disabled };
			ta.disabled = disabled;
			applyAria();
		},
		setLineNumbers(enabled) {
			if (lineNumbersOn === enabled) return;
			lineNumbersOn = enabled;
			if (!enabled && lines) {
				lines.remove();
				lines = null;
				gutter = "";
			}
			applyStyles();
			render();
		},
		update(next) {
			if (destroyed) return;
			opts = { ...opts, ...next };
			if (next.indentUnit !== undefined) {
				plugins.splice(0, plugins.length, pdListItem(), pdTab(next.indentUnit));
			}
			if (next.language !== undefined) lang = next.language;
			if (
				"highlight" in next ||
				next.language !== undefined
			) {
				currentHighlighter = makeHighlighter();
			}
			if (next.lineNumbers !== undefined) {
				lineNumbersOn = next.lineNumbers;
				if (!lineNumbersOn && lines) {
					lines.remove();
					lines = null;
					gutter = "";
				}
			}
			if (next.value !== undefined) {
				value = normalizeEol(next.value);
				committedValue = value;
				ta.value = value;
				undoStack.length = 0;
				undoStack.push({ value, selStart: -1, selEnd: -1 });
				redoStack.length = 0;
			}
			if (next.readOnly !== undefined) ta.readOnly = next.readOnly;
			if (next.disabled !== undefined) ta.disabled = next.disabled;
			if (next.maxLength !== undefined) {
				if (next.maxLength >= 0) ta.maxLength = next.maxLength;
				else ta.removeAttribute("maxlength");
			}
			if (next.spellcheck !== undefined) ta.spellcheck = next.spellcheck;
			if (next.dir !== undefined) ta.dir = next.dir;
			applyAria();
			applyStyles();
			render();
			syncScroll();
		},
		focus() {
			ta.focus();
		},
		blur() {
			ta.blur();
		},
		undo() {
			undo();
		},
		redo() {
			redo();
		},
		insertText(text) {
			if (destroyed || ta.readOnly || ta.disabled) return;
			const start = ta.selectionStart;
			const end = ta.selectionEnd;
			let insert = normalizeEol(text);
			if (opts.maxLength !== undefined && opts.maxLength >= 0) {
				const room = opts.maxLength - (value.length - (end - start));
				if (room <= 0) return;
				if (insert.length > room) insert = insert.slice(0, room);
			}
			const next = value.slice(0, start) + insert + value.slice(end);
			value = next;
			committedValue = next;
			ta.value = next;
			const caret = start + insert.length;
			ta.setSelectionRange(caret, caret);
			render();
			scheduleHistory({ value: next, selStart: caret, selEnd: caret });
			opts.onValueChange?.(next);
			syncScroll();
		},
		getSelection() {
			return { start: ta.selectionStart, end: ta.selectionEnd };
		},
		setSelection(start, end = start) {
			const clamp = (n: number) =>
				Math.max(0, Math.min(value.length, Number.isFinite(n) ? n : 0));
			ta.setSelectionRange(clamp(start), clamp(end));
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			debouncedCommit.cancel();
			resizeObserver?.disconnect();
			if (layoutRaf && typeof cancelAnimationFrame === "function") {
				cancelAnimationFrame(layoutRaf);
			}
			ta.removeEventListener("input", handleInput);
			ta.removeEventListener("compositionstart", onCompositionStart);
			ta.removeEventListener("compositionend", onCompositionEnd);
			ta.removeEventListener("scroll", onScroll);
			ta.removeEventListener("keydown", onKeyDown);
			ta.removeEventListener("focus", onFocus);
			ta.removeEventListener("blur", onBlur);
			root.remove();
		},
		textarea: ta,
		root,
		pre,
	};
}
