import assert from "node:assert/strict";
import { test } from "node:test";
import {
	detectPdIntent,
	isPdMarkerLine,
	mayBeCommentLine,
} from "../src";

// ---- 打开时检测 detectPdIntent（前 maxLines 行内出现段标记行） ----

test("detectPdIntent: 单独 //!pd 行触发", () => {
	assert.equal(detectPdIntent("//!pd\n任务: x"), true);
});

test("detectPdIntent: 带段名触发", () => {
	assert.equal(detectPdIntent("//!pd 任务\n任务: x"), true);
});

test("detectPdIntent: 带缩进触发", () => {
	assert.equal(detectPdIntent("  //!pd 任务\n任务: x"), true);
});

test("detectPdIntent: 前 50 行内有标记触发", () => {
	const text = Array.from({ length: 49 }, () => "普通行").join("\n");
	assert.equal(detectPdIntent(`${text}\n//!pd 任务`), true);
});

test("detectPdIntent: 第 51 行才有标记 → false（maxLines 生效，不全文扫描）", () => {
	const text = Array.from({ length: 51 }, () => "普通行").join("\n");
	assert.equal(detectPdIntent(`${text}\n//!pd 任务`), false);
});

test("detectPdIntent: 无标记纯文本 → false", () => {
	assert.equal(detectPdIntent("你好\n世界\n这是普通文本"), false);
});

test("detectPdIntent: //!pdx 不是段标记（\\b 词边界）", () => {
	assert.equal(detectPdIntent("//!pdx 不是段标记"), false);
});

test("detectPdIntent: 行中的 //!pd 不算（必须行首）", () => {
	assert.equal(detectPdIntent("foo //!pd 不在行首"), false);
});

test("detectPdIntent: 空文档 → false", () => {
	assert.equal(detectPdIntent(""), false);
});

// ---- 输入时预筛 mayBeCommentLine（行首注释特征） ----

test("mayBeCommentLine: 行首 // 放行", () => {
	assert.equal(mayBeCommentLine("//!pd"), true);
	assert.equal(mayBeCommentLine("  // 普通注释"), true);
});

test("mayBeCommentLine: 普通文本/中文/空行直接跳过", () => {
	assert.equal(mayBeCommentLine("hello world"), false);
	assert.equal(mayBeCommentLine("你好世界"), false);
	assert.equal(mayBeCommentLine(""), false);
	assert.equal(mayBeCommentLine("  hello"), false);
});

test("mayBeCommentLine: 行中 // 不算（必须行首）", () => {
	assert.equal(mayBeCommentLine("foo // bar"), false);
});

// ---- 输入时完整判定 isPdMarkerLine ----

test("isPdMarkerLine: 完整标记行", () => {
	assert.equal(isPdMarkerLine("//!pd"), true);
	assert.equal(isPdMarkerLine("//!pd 任务"), true);
	assert.equal(isPdMarkerLine("  //!pd 任务"), true);
	assert.equal(isPdMarkerLine("//!pd "), true);
});

test("isPdMarkerLine: 非标记行", () => {
	assert.equal(isPdMarkerLine("//!pdx"), false);
	assert.equal(isPdMarkerLine("// 普通注释"), false);
	assert.equal(isPdMarkerLine("foo //!pd"), false);
	assert.equal(isPdMarkerLine("hello"), false);
});

test("detectPdIntent: 围栏内 //!pd 不算段标记（与 splitSections 同规则）", () => {
	assert.equal(detectPdIntent("```md\n//!pd 不是段\n```\n"), false);
	assert.equal(detectPdIntent("```md\n//!pd 不是段\n```\n//!pd 真段\n"), true);
	assert.equal(detectPdIntent("```\n```\n//!pd x\n"), true); // 围栏闭合后再触发
});
