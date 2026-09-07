import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isEmptyItemMarkerLine,
	shouldClearItemOnEnter,
} from "../src/enter";

// ---- isEmptyItemMarkerLine：严格 `- ` 场景 ----

test("isEmptyItemMarkerLine: 缩进 + `- ` 命中（含多空白缩进）", () => {
	assert.equal(isEmptyItemMarkerLine("- "), true);
	assert.equal(isEmptyItemMarkerLine("  - "), true);
	assert.equal(isEmptyItemMarkerLine("\t- "), true);
	assert.equal(isEmptyItemMarkerLine("    - "), true);
	assert.equal(isEmptyItemMarkerLine("  -\t"), true); // `-` 后任意空白串
});

test("isEmptyItemMarkerLine: 裸 `-`（无空白）不命中", () => {
	assert.equal(isEmptyItemMarkerLine("-"), false);
	assert.equal(isEmptyItemMarkerLine("  -"), false);
});

test("isEmptyItemMarkerLine: 有内容 / 非子项行不命中", () => {
	assert.equal(isEmptyItemMarkerLine("- x"), false);
	assert.equal(isEmptyItemMarkerLine("  - 被风吹得抖了几下"), false);
	assert.equal(isEmptyItemMarkerLine("- foo: bar"), false);
	assert.equal(isEmptyItemMarkerLine(""), false);
	assert.equal(isEmptyItemMarkerLine("key: value"), false);
	assert.equal(isEmptyItemMarkerLine("---"), false);
});

// ---- shouldClearItemOnEnter：空选区 + 行尾 + 空子项标记行 ----

test("shouldClearItemOnEnter: 三条件齐备才拦截", () => {
	assert.equal(shouldClearItemOnEnter("  - ", true, true), true);
	assert.equal(shouldClearItemOnEnter("  - ", false, true), false); // 有选区
	assert.equal(shouldClearItemOnEnter("  - ", true, false), false); // 光标不在行尾
	assert.equal(shouldClearItemOnEnter("  - x", true, true), false); // 非空子项行
	assert.equal(shouldClearItemOnEnter("  -", true, true), false); // 裸 `-`
});
