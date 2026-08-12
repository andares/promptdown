#include <tree_sitter/parser.h>
#include <wctype.h>

/**
 * tree-sitter-promptdown external scanner（行分类器）
 *
 * 所有"行首 token"由本 scanner 分类（SECTION/SEPARATOR/FENCE/KEY_NAME/
 * ITEM_DASH/TEXT_LINE），每行从行首状态驱动，external valid 跨行稳定。
 *
 * 关键规则：
 * - scanner 自行跳过前导空白（含换行）；跳过时记录 crossed_line/skipped
 *   → line_start = 跳过换行 或 未跳过任何空白（文档开头）
 * - TEXT_LINE 只在"行首 且 _line 起始状态"（valid[ITEM_DASH] 存在）返回，
 *   否则 value/item_text 正则接管
 * - KEY_NAME 含 ':'（匹配到 ':' 并消费）
 * - 前缀分支（///---/```）从当前位置完整匹配，不预 advance
 */

enum TokenType {
	SECTION,
	SEPARATOR,
	FENCE,
	KEY_NAME,
	ITEM_DASH,
	TEXT_LINE,
	TOKEN_COUNT,
};

void *tree_sitter_promptdown_external_scanner_create(void) {
	return NULL;
}

void tree_sitter_promptdown_external_scanner_destroy(void *payload) {
	(void)payload;
}

unsigned tree_sitter_promptdown_external_scanner_serialize(
	void *payload,
	char *buffer
) {
	(void)payload;
	(void)buffer;
	return 0;
}

void tree_sitter_promptdown_external_scanner_deserialize(
	void *payload,
	const char *buffer,
	unsigned length
) {
	(void)payload;
	(void)buffer;
	(void)length;
}

/** 从当前位置匹配字面前缀（命中则消费并 mark_end，失败位置已前进） */
static bool match_prefix(TSLexer *lexer, const char *prefix, size_t len) {
	size_t i = 0;
	for (; i < len; i++) {
		if (lexer->eof(lexer)) return false;
		uint32_t c = lexer->lookahead;
		if ((uint32_t)(unsigned char)prefix[i] != c) return false;
		lexer->advance(lexer, false);
	}
	lexer->mark_end(lexer);
	return true;
}

/** 消费到行尾（\n 前或 eof）并 mark_end */
static void consume_to_eol(TSLexer *lexer) {
	while (!lexer->eof(lexer) && lexer->lookahead != '\n') {
		lexer->advance(lexer, false);
	}
	lexer->mark_end(lexer);
}

bool tree_sitter_promptdown_external_scanner_scan(
	void *payload,
	TSLexer *lexer,
	const bool *valid_symbols
) {
	(void)payload;

	bool any_valid = false;
	for (int i = 0; i < TOKEN_COUNT; i++) {
		if (valid_symbols[i]) {
			any_valid = true;
			break;
		}
	}
	if (!any_valid) return false;

	// 跳过前导空白（external scanner 自行跳过，含换行）；记录行首信息
	bool crossed_line = false;
	size_t skipped = 0;
	while (!lexer->eof(lexer)) {
		uint32_t ws = lexer->lookahead;
		if (ws == '\n') crossed_line = true;
		if (ws != ' ' && ws != '\t' && ws != '\n') break;
		lexer->advance(lexer, true);
		skipped++;
	}

	uint32_t c = lexer->lookahead;
	if (c == 0) return false; // 文件尾
	bool line_start = crossed_line || skipped == 0;

	// 1. //!pd 段标记
	if (c == '/' && valid_symbols[SECTION]) {
		if (match_prefix(lexer, "//!pd", 5)) {
			consume_to_eol(lexer);
			lexer->result_symbol = SECTION;
			return true;
		}
		// 失败：位置已前进（部分匹配），继续通用分支
	}

	// 2. '-' 开头：--- 分隔线 或 "- " 序列项
	if (c == '-') {
		lexer->advance(lexer, false); // 消费第 1 个 '-'
		uint32_t c2 = lexer->lookahead;
		if (c2 == '-') {
			lexer->advance(lexer, false);
			if (!lexer->eof(lexer) && lexer->lookahead == '-' && valid_symbols[SEPARATOR]) {
				lexer->advance(lexer, false);
				lexer->mark_end(lexer);
				lexer->result_symbol = SEPARATOR;
				return true;
			}
			// "--x"：不匹配，位置在 "--" 后，继续通用
		} else if ((c2 == ' ' || c2 == '\t') && valid_symbols[ITEM_DASH]) {
			lexer->advance(lexer, false); // 消费空格
			lexer->mark_end(lexer);
			lexer->result_symbol = ITEM_DASH;
			return true;
		}
		// "-x"：位置在 x 处，继续通用
	}

	// 3. ``` 围栏行
	if (c == '`' && valid_symbols[FENCE]) {
		if (match_prefix(lexer, "```", 3)) {
			consume_to_eol(lexer);
			lexer->result_symbol = FENCE;
			return true;
		}
	}

	// 4. 通用：KEY_NAME（仅行首且行内有 ':'）或 TEXT_LINE（仅行首 + _line 起始）
	bool key_allowed = valid_symbols[KEY_NAME] && line_start;
	// TEXT_LINE 仅在 _line 起始状态（valid[ITEM_DASH] 存在）且行首时返回，
	// 否则由 value / item_text 正则接管
	bool text_allowed = valid_symbols[TEXT_LINE] && valid_symbols[ITEM_DASH] && line_start;

	if (!key_allowed && !text_allowed) return false;

	// KEY_NAME 首字符约束：非空白/非冒号/非 '-'（'-' 已在上面处理）
	if (key_allowed && (c == ':' || c == '-' || iswspace(c))) {
		key_allowed = false;
	}
	if (!key_allowed && !text_allowed) return false;

	// 读行找第一个 ':'（KEY_NAME 匹配到 ':' 含）
	bool found_colon = false;
	while (!lexer->eof(lexer)) {
		uint32_t cc = lexer->lookahead;
		if (cc == '\n') break;
		if (cc == ':') {
			found_colon = true;
			lexer->advance(lexer, false); // 消费 ':'（KEY_NAME 含冒号）
			lexer->mark_end(lexer);
			break;
		}
		lexer->advance(lexer, false);
	}

	if (found_colon && key_allowed) {
		lexer->result_symbol = KEY_NAME;
		return true;
	}

	if (text_allowed) {
		consume_to_eol(lexer);
		lexer->result_symbol = TEXT_LINE;
		return true;
	}

	return false;
}
