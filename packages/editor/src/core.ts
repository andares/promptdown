import { debounce } from "es-toolkit";
import { Yace, type Highlighter } from "yace";
import { pdListItem, pdTab } from "./plugins";

export type EditorLang = "pd" | "md" | "xml" | "json" | "yaml";

export interface PdEditorOptions {
	value?: string;
	language?: EditorLang;
	lineNumbers?: boolean;
	/**
	 * Yace 根节点样式。字体、行高、字距和 padding 等几何样式必须从根节点统一传入，
	 * 以保证透明 textarea 与高亮 pre 使用同一套排版参数。
	 */
	styles?: Record<string, string>;
	/** 缩进单位（Tab 整行缩进 / 续行 `- ` 用；默认两个空格） */
	indentUnit?: string;
	/** 外部注入的 highlighter（BYO，覆盖内置）——lang 参数由内部传入 */
	highlight?: (source: string, lang: EditorLang) => string;
	onValueChange?: (value: string) => void;
}

export interface PdEditorInstance {
	setValue(value: string): void;
	getValue(): string;
	setLanguage(lang: EditorLang): void;
	destroy(): void;
	/** 原生 textarea 元素（外部可自行监听事件） */
	textarea: HTMLTextAreaElement;
}

/** HTML 转义（纯文本高亮回退 / 各入口共用） */
export function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

/**
 * Headless 提示词输入框核心（基于 Yace）——各入口的公共实现。
 * 高亮管线由入口注入（getHighlighter）：全量入口 pd 自研 + 其余 Prism，
 * pd-only 入口仅 pd 高亮 + 其余纯文本——由此实现按入口裁剪依赖（Prism 隔离）。
 * - 只渲染输入框内容（高亮层 + 原生 textarea），无任何 UI/chrome
 * - 语言切换是 API 行为（setLanguage），不做 UI 切换器
 * - 核心维护覆盖层排版不变量；外部框架定义容器外观与 token 配色
 */
export function createCoreEditor(
	el: HTMLElement,
	options: PdEditorOptions,
	getHighlighter: (lang: EditorLang) => Highlighter,
): PdEditorInstance {
	let lang: EditorLang = options.language ?? "pd";
	const onValueChange = options.onValueChange;
	let suppressCallback = false; // setValue / 组合期程序化更新时不触发 onValueChange
	const indentUnit = options.indentUnit ?? "  ";

	const editor = new Yace(el, {
		value: options.value ?? "",
		lineNumbers: options.lineNumbers ?? false,
		styles: options.styles ?? {},
		highlighters: [
			options.highlight
				? (v: string) => options.highlight?.(v, lang) ?? ""
				: getHighlighter(lang),
		],
		// 编辑行为：pd 语义插件（续行补 `- `/保留缩进、序列项行 Tab 整行缩进/缩出）。
		// 撤销/重做不在此接入 Yace history 插件（初始快照缺陷），由组件自实现（见下）。
		plugins: [pdListItem(), pdTab(indentUnit)],
	});

	editor.onUpdate((value: string) => {
		if (!suppressCallback) {
			scheduleHistory(value); // 用户输入入撤销栈（防抖合并；在声明之后执行，闭包引用安全）
			onValueChange?.(value);
		}
	});

	// 中文输入法（拼音/五笔等）组合期渲染：
	// Yace 在 isComposing 时跳过 input 事件，textarea 文字（透明）变化但 pre 覆盖层不更新
	// → 选字前的拼音/候选字符不可见。组件在组合期手动 update 触发渲染（抑制回调，
	// 避免宿主收到中间态值）；compositionend 后 Yace 恢复正常处理。
	const ta = editor.textarea;
	let composing = false;
	const onCompositionStart = () => {
		composing = true;
	};
	const onCompositionEnd = () => {
		composing = false;
	};
	const onInputDuringComposition = () => {
		if (!composing) return;
		suppressCallback = true;
		editor.update({
			value: ta.value,
			selectionStart: ta.selectionStart,
			selectionEnd: ta.selectionEnd,
		});
		suppressCallback = false;
	};
	ta.addEventListener("compositionstart", onCompositionStart);
	ta.addEventListener("compositionend", onCompositionEnd);
	ta.addEventListener("input", onInputDuringComposition);

	// 撤销/重做（自实现，5 步记忆，快照含光标）：
	// Yace 自带 history 插件有初始快照缺陷——首次 input 事件才记快照，初始值被覆盖，
	// 退不到初始内容。组件自维护栈：初始值恒在栈底（可退回初始态），
	// 用户输入经 onUpdate 压栈（suppress 的程序化 setValue / 撤销重做本身不入栈），
	// 新输入清空重做栈。保存节点有 1s 防抖：连续输入（逐字打字）合并为一步，
	// 避免逐字还原与浪费记忆步数（防抖实现 es-toolkit debounce，ESM 可树摇）。
	// Ctrl+Z 撤销 / Ctrl+Shift+Z 与 Ctrl+Y 重做；恢复时同步还原光标选区。
	const UNDO_LIMIT = 5; // 记忆步数（不含初始值）
	// 初始快照的光标位置未知（用户可能把光标放在任意位置后才开始编辑），存哨兵 -1；
	// 首次落栈时用「初始值与新值的公共前缀」推导首次变更点（即变更前光标位置），
	// 保证撤回到初始内容时光标回到编辑起点而非跳到末尾。
	const undoStack: HistorySnapshot[] = [
		{ value: editor.value, selStart: -1, selEnd: -1 },
	];
	const redoStack: HistorySnapshot[] = [];
	// 超出记忆步数时挤掉最旧的非初始快照（初始快照恒在栈底，可退回初始态）
	const trimHistory = () => {
		if (undoStack.length > UNDO_LIMIT + 1) undoStack.splice(1, 1);
	};
	const pushHistory = (snap: HistorySnapshot) => {
		// 首次落栈：补记初始快照的光标 = 首次变更点（公共前缀长度）。
		// 主场景（连续输入/中间插入/删除）推导精确；多次编辑后才落栈时取累计变更起点，近似合理。
		const base = undoStack[0];
		if (base !== undefined && base.selStart < 0 && base.value !== snap.value) {
			const p = commonPrefixLen(base.value, snap.value);
			base.selStart = p;
			base.selEnd = p;
		}
		const top = undoStack.at(-1);
		if (top !== undefined && top.value === snap.value) return; // 值未变化不占步数
		redoStack.length = 0; // 新输入使重做失效
		undoStack.push(snap);
		trimHistory();
	};
	// 保存节点防抖：停止输入 1s 后落栈；期间的中间态不占记忆步数。
	// 撤销/重做前 flush（进行中的输入先固化为节点）；destroy 时 cancel 丢弃。
	const debouncedCommit = debounce(pushHistory, 1000);
	const scheduleHistory = (value: string) => {
		const selStart = ta.selectionStart;
		const selEnd = ta.selectionEnd;
		// 防抖多次调用只在尾部执行，每次都带上最新光标
		debouncedCommit({ value, selStart, selEnd });
	};
	const applySnapshot = (snap: HistorySnapshot) => {
		// 兜底：光标未知（哨兵 -1，正常流程走不到——撤销前必 flush，初始快照已补记）
		const selStart = snap.selStart >= 0 ? snap.selStart : snap.value.length;
		const selEnd = snap.selEnd >= 0 ? snap.selEnd : snap.value.length;
		suppressCallback = true;
		editor.update({
			value: snap.value,
			selectionStart: selStart,
			selectionEnd: selEnd,
		});
		// jsdom 下 update 不落光标，双保险同步 textarea 选区
		if (ta.value === snap.value) {
			ta.setSelectionRange(selStart, selEnd);
		}
		suppressCallback = false;
	};
	// 双栈标准模型：undoStack 栈顶恒为当前状态（flush 保证），
	// 撤销 = pop 当前到 redo 栈；重做 = 从 redo 栈 pop 回 undo 栈。
	const onKeyDown = (e: KeyboardEvent) => {
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();
		if (!mod || (key !== "z" && key !== "y")) return;
		const isRedo = key === "y" || (key === "z" && e.shiftKey);
		if (isRedo) {
			// 重做（Ctrl+Shift+Z / Ctrl+Y）：待存输入落栈会清空重做栈，先 flush 再判断
			debouncedCommit.flush();
			if (redoStack.length === 0) return;
			e.preventDefault();
			const next = redoStack.pop();
			if (next !== undefined) {
				undoStack.push(next);
				trimHistory();
				applySnapshot(next);
			}
		} else {
			// 撤销（Ctrl+Z）：进行中的输入先固化为节点，再回退一步
			debouncedCommit.flush();
			if (undoStack.length <= 1) return;
			e.preventDefault();
			const cur = undoStack.pop();
			if (cur !== undefined) redoStack.push(cur);
			const prev = undoStack.at(-1);
			if (prev !== undefined) applySnapshot(prev);
		}
	};
	ta.addEventListener("keydown", onKeyDown);

	return {
		setValue(value: string) {
			suppressCallback = true;
			editor.update({ value });
			suppressCallback = false;
		},
		getValue() {
			return editor.value;
		},
		setLanguage(next: EditorLang) {
			lang = next;
			editor.updateOptions({
				highlighters: [
					options.highlight
						? (v: string) => options.highlight?.(v, lang) ?? ""
						: getHighlighter(lang),
				],
			});
		},
		destroy() {
			debouncedCommit.cancel();
			ta.removeEventListener("compositionstart", onCompositionStart);
			ta.removeEventListener("compositionend", onCompositionEnd);
			ta.removeEventListener("input", onInputDuringComposition);
			ta.removeEventListener("keydown", onKeyDown);
			editor.destroy();
		},
		textarea: ta,
	};
}
