import assert from "node:assert/strict";
import { test } from "node:test";
import { isListItemLine, listItemWsRun, tabUnit } from "../src/tab";

// ---- isListItemLine：行首（允许空白）`-` 序列项行（`-` 后可无空白） ----

test("isListItemLine: `- ` 开头（含缩进）", () => {
	assert.equal(isListItemLine("- foo"), true);
	assert.equal(isListItemLine("  - foo"), true);
	assert.equal(isListItemLine("\t- key: value"), true);
	assert.equal(isListItemLine("    - "), true);
});

test("isListItemLine: 裸 `-`（`-` 后无空白）也命中", () => {
	assert.equal(isListItemLine("-"), true);
	assert.equal(isListItemLine("  -"), true);
	assert.equal(isListItemLine("\t-"), true);
	assert.equal(isListItemLine("-foo"), true);
	assert.equal(isListItemLine("---"), true);
});

test("isListItemLine: 非序列项行", () => {
	assert.equal(isListItemLine("foo"), false);
	assert.equal(isListItemLine("  key: value"), false);
	assert.equal(isListItemLine(""), false);
});

// ---- listItemWsRun：`-` 后空白段区间与规范化标记 ----

test("listItemWsRun: 裸 `-` → 补单空格（normalize=true）", () => {
	assert.deepEqual(listItemWsRun("-"), {
		dash: 0,
		start: 1,
		end: 1,
		normalize: true,
	});
	assert.deepEqual(listItemWsRun("  -"), {
		dash: 2,
		start: 3,
		end: 3,
		normalize: true,
	});
	assert.deepEqual(listItemWsRun("\t-"), {
		dash: 1,
		start: 2,
		end: 2,
		normalize: true,
	});
});

test("listItemWsRun: 多空白 → 收拢为单空格（normalize=true）", () => {
	assert.deepEqual(listItemWsRun("-   foo"), {
		dash: 0,
		start: 1,
		end: 4,
		normalize: true,
	});
	assert.deepEqual(listItemWsRun("-\tfoo"), {
		dash: 0,
		start: 1,
		end: 2,
		normalize: true,
	});
	assert.deepEqual(listItemWsRun("- \t foo"), {
		dash: 0,
		start: 1,
		end: 4,
		normalize: true,
	});
	assert.deepEqual(listItemWsRun("  -    "), {
		dash: 2,
		start: 3,
		end: 7,
		normalize: true,
	});
});

test("listItemWsRun: 已是单空格或后直接跟内容 → 不动（normalize=false）", () => {
	assert.deepEqual(listItemWsRun("- foo"), {
		dash: 0,
		start: 1,
		end: 2,
		normalize: false,
	});
	assert.deepEqual(listItemWsRun("  - x"), {
		dash: 2,
		start: 3,
		end: 4,
		normalize: false,
	});
	assert.deepEqual(listItemWsRun("-foo"), {
		dash: 0,
		start: 1,
		end: 1,
		normalize: false,
	});
	assert.deepEqual(listItemWsRun("---"), {
		dash: 0,
		start: 1,
		end: 1,
		normalize: false,
	});
});

test("listItemWsRun: 非序列项行 → null", () => {
	assert.equal(listItemWsRun("foo"), null);
	assert.equal(listItemWsRun("  key: value"), null);
	assert.equal(listItemWsRun(""), null);
});

// ---- tabUnit：默认 Tab 插入单位 ----

test("tabUnit: 遵循 insertSpaces / 缩进单位大小", () => {
	assert.equal(tabUnit(true, 4), "    ");
	assert.equal(tabUnit(true, 2), "  ");
	assert.equal(tabUnit(false, 4), "\t");
	assert.equal(tabUnit(false, 8), "\t");
});
