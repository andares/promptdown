import assert from "node:assert/strict";
import { test } from "node:test";
import { isListItemLine, tabUnit } from "../src/tab";

// ---- isListItemLine：行首（允许空白）`- ` 序列项行 ----

test("isListItemLine: `- ` 开头（含缩进）", () => {
	assert.equal(isListItemLine("- foo"), true);
	assert.equal(isListItemLine("  - foo"), true);
	assert.equal(isListItemLine("\t- key: value"), true);
	assert.equal(isListItemLine("    - "), true);
});

test("isListItemLine: 非序列项行", () => {
	assert.equal(isListItemLine("foo"), false);
	assert.equal(isListItemLine("  key: value"), false);
	assert.equal(isListItemLine("-"), false);
	assert.equal(isListItemLine("-foo"), false);
	assert.equal(isListItemLine("  -foo"), false);
	assert.equal(isListItemLine(""), false);
});

// ---- tabUnit：默认 Tab 插入单位 ----

test("tabUnit: 遵循 insertSpaces / 缩进单位大小", () => {
	assert.equal(tabUnit(true, 4), "    ");
	assert.equal(tabUnit(true, 2), "  ");
	assert.equal(tabUnit(false, 4), "\t");
	assert.equal(tabUnit(false, 8), "\t");
});
