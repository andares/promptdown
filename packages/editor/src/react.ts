import {
	createElement,
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	type HTMLAttributes,
} from "react";
import {
	definePdEditor,
	type PdEditorElement,
	type PdHighlighter,
} from "./element";

export type { PdEditorElement, PdHighlighter } from "./element";
export { definePdEditor } from "./element";
export {
	format,
	highlightPd,
	jsonToPdText,
	pdToJsonText,
} from "./element";

const useIsoLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface PdEditorProps
	extends Omit<
		HTMLAttributes<HTMLElement>,
		"value" | "defaultValue" | "onChange" | "onInput" | "children"
	> {
	value?: string;
	defaultValue?: string;
	language?: string;
	placeholder?: string;
	readOnly?: boolean;
	disabled?: boolean;
	lineNumbers?: boolean;
	indentUnit?: string;
	tabBehavior?: "indent" | "focus";
	maxLength?: number;
	/** BYO 高亮器（例如主入口导出的 prismHighlighter）；不传则 pd-only */
	highlight?: PdHighlighter | null;
	onValueChange?: (value: string) => void;
	onReady?: (element: PdEditorElement) => void;
}

/**
 * React 包装（React 17+）。自定义元素的复杂属性（函数/对象）在 React 18 会被
 * 字符串化，因此这里统一用 DOM property 赋值，而不是走 attribute。
 *
 * - 受控：传 `value` + `onValueChange`；`el.value` 与 prop 相同则不会回写（不打断光标/撤销）
 * - 非受控：传 `defaultValue`（只作初始值）
 * - SSR：import 安全；元素在 layout effect 中注册，SSR 端渲染为空标签
 */
export const PdEditor = forwardRef<PdEditorElement, PdEditorProps>(
	function PdEditor(props, forwardedRef) {
		const {
			value,
			defaultValue,
			language,
			placeholder,
			readOnly,
			disabled,
			lineNumbers,
			indentUnit,
			tabBehavior,
			maxLength,
			highlight,
			onValueChange,
			onReady,
			...rest
		} = props;
		const elRef = useRef<PdEditorElement | null>(null);
		const initialRef = useRef(true);
		const onValueRef = useRef(onValueChange);
		onValueRef.current = onValueChange;
		const onReadyRef = useRef(onReady);
		onReadyRef.current = onReady;
		const readyRef = useRef(false);

		useImperativeHandle(
			forwardedRef,
			() => elRef.current as PdEditorElement,
			[],
		);

		useIsoLayoutEffect(() => {
			definePdEditor();
			const el = elRef.current;
			if (!el) return;
			if (initialRef.current) {
				initialRef.current = false;
				const initial = value ?? defaultValue;
				if (initial !== undefined && el.value !== initial) el.value = initial;
			} else if (value !== undefined && el.value !== value) {
				// 受控回写：只在宿主 value 与 DOM 当前值不同时写，避免打断输入/撤销
				el.value = value;
			}
			if (language !== undefined && el.language !== language)
				el.language = language;
			if (placeholder !== undefined && el.placeholder !== placeholder)
				el.placeholder = placeholder;
			if (readOnly !== undefined) el.readOnly = readOnly;
			if (disabled !== undefined) el.disabled = disabled;
			if (lineNumbers !== undefined) el.lineNumbers = lineNumbers;
			if (indentUnit !== undefined && el.indentUnit !== indentUnit)
				el.indentUnit = indentUnit;
			if (tabBehavior !== undefined) el.tabBehavior = tabBehavior;
			if (maxLength !== undefined) el.maxLength = maxLength;
			if (highlight !== undefined) el.highlight = highlight;
		}, [
			value,
			defaultValue,
			language,
			placeholder,
			readOnly,
			disabled,
			lineNumbers,
			indentUnit,
			tabBehavior,
			maxLength,
			highlight,
		]);

		useEffect(() => {
			const el = elRef.current;
			if (!el) return;
			const handleInput = (event: Event) => {
				const detail = (event as CustomEvent<{ value?: string }>).detail;
				onValueRef.current?.(detail?.value ?? el.value);
			};
			const fireReady = () => {
				if (readyRef.current) return;
				readyRef.current = true;
				onReadyRef.current?.(el);
			};
			const handleReady = () => fireReady();
			el.addEventListener("pd-input", handleInput);
			el.addEventListener("pd-ready", handleReady);
			// pd-ready 可能在 layout effect 注册期间已经派发（微任务），补一次
			queueMicrotask(() => {
				if (el.editor) fireReady();
			});
			return () => {
				el.removeEventListener("pd-input", handleInput);
				el.removeEventListener("pd-ready", handleReady);
				readyRef.current = false;
			};
		}, []);

		return createElement("pd-editor", { ...rest, ref: elRef });
	},
);
