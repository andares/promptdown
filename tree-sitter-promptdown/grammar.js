/**
 * tree-sitter grammar for promptdown (.pd)
 *
 * 行级语法：所有"行首 token"由 external scanner（src/scanner.c）分类
 * （SECTION/SEPARATOR/FENCE/KEY_NAME/ITEM_DASH/TEXT_LINE）。
 * 每行从行首状态驱动，任何行首 token 归约后回到 _line 起始——external
 * token 的 valid 状态跨行稳定，不存在词法/状态失效问题。
 *
 * 高亮结构：
 * - key_value = KEY_NAME（含 ':'，scanner）+ optional(value)
 * - value / item_text 为正则 token（行尾），LR 状态正常
 *
 * 限制（文档注明）：
 * - fence 不做完整围栏结构，只高亮 ``` 行本身；围栏内行按 TEXT_LINE 处理
 * - value 内引用（:refname）不高亮
 * - 键名不能以 '-' 开头（"- 项" 归 item；"-x: v" 边缘场景归文本）
 */
module.exports = grammar({
	name: "promptdown",

	externals: ($) => [
		$.section,
		$.separator,
		$.fence_line,
		$.key_name,
		$.item_dash,
		$.text_line,
	],

	rules: {
		// 文档 = 行序列（空行由框架跳过空白处理）
		document: ($) => optional($._lines),
		_lines: ($) => seq($._line, optional($._lines)), // 右递归：行首 token 后状态仍含全部行首 token

		_line: ($) =>
			choice(
				prec(2, $.key_value),
				prec(2, $.item),
				prec(2, $.section),
				prec(2, $.separator),
				prec(2, $.fence_line),
				prec(1, $.text_line),
			),

		// //!pd <name> 段标记（整行）
		// key: value —— KEY_NAME 已含 ':'（scanner 消费）；value 吞行尾；空值可选
		key_value: ($) =>
			seq(field("key", $.key_name), optional(field("value", $.value))),

		// 值：ref（:引用名）与文本片段交替（v4：value 位置的 _line 分支会失败，无 GLR 歧义）
		value: ($) =>
			prec.right(1, repeat1(choice(prec(2, $.ref), $.text_fragment))),

		ref: (_) => token(prec(2, /:[^\s-][^\s]*/)),

		// 文本片段：非空白/非冒号开头，到空白停（可含冒号——URL 等整体匹配，
		// ref 只在冒号开头且前面无紧贴文本时参与）
		text_fragment: (_) => token(prec(1, /[ \t]*[^\s:][^\s]*/)),

		// - 序列项（ITEM_DASH = "- "，scanner；可嵌套键值）
		item: ($) => seq($.item_dash, choice(prec(1, $.key_value), $.item_text)),

		// 序列项兜底内容（- 后非键值文本，正则行尾）
		item_text: (_) => token(prec(1, /[^\n]+/)),

		// 普通文本行（scanner 整行）
	},
});
