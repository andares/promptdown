/**
 * Enter 键行为的纯逻辑（不依赖 vscode API，可单测）。
 *
 * 场景：在空的序列子项行（`<缩进>- `，由 language-configuration 的 onEnterRules
 * 续行规则自动生成）行尾再按一次回车 → 清掉该行的子项标记（连同缩进整行清空），
 * 新行无缩进落在行首，光标定在新行 col 0 —— 方便立即开始写新的顶层项。
 *
 * 判定严格限定：整行恰好是 `<缩进>-<空白串>`（`-` 后必须带空白，即 `/\s*-\s/` 场景）；
 * 裸 `-`（无空白）不命中——那是 onEnterRules 规则 1 的兜底场景，走默认回车行为。
 */

/** 空子项标记行：行首空白 + `-` + 至少一个空白，且此外无任何内容 */
const EMPTY_ITEM_RE = /^[ \t]*-[ \t]+$/;

/** 一行是否为空的子项标记行（严格 `- ` 场景；裸 `-` 返回 false） */
export function isEmptyItemMarkerLine(line: string): boolean {
	return EMPTY_ITEM_RE.test(line);
}

/** Enter 拦截判定：空选区 + 位于该行行尾 + 整行为空子项标记行 */
export function shouldClearItemOnEnter(
	line: string,
	selectionEmpty: boolean,
	cursorAtLineEnd: boolean,
): boolean {
	return selectionEmpty && cursorAtLineEnd && isEmptyItemMarkerLine(line);
}
