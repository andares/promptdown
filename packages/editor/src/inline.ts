/// <reference path="./foundation-types.d.ts" />
/**
 * 行内代码（`...`）/ `:-` 整行转义 / 严格键值判定——**单一来源**：
 * 直接复用共享语义包 @andares/pdfoundation 的 lexer 工具，组件不再保留副本
 * （历史教训：两套判定漂移后，`-\t`、`//!pd` 的边界行为在主包/组件间不一致）。
 */
export {
	findKeyValueSeparator,
	hasLiteralColon,
	matchKeyValue,
	splitInlineCode,
} from "@andares/pdfoundation";
