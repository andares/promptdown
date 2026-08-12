import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isPdFileName, pdToJsonText, sectionNames } from "../src/pd2json";

const FIX = join(__dirname, "fixtures");

// ---- pdToJsonText：pd 文本 → 格式化 JSON 字符串 ----

test("pdToJsonText: 单段隐式段输出完整 JSON（与 parser 语义一致）", () => {
	const json = JSON.parse(
		pdToJsonText(readFileSync(join(FIX, "flat.pd"), "utf8")),
	);
	assert.deepEqual(json, {
		name1: {
			Info1: ["some"],
			name2: "other words",
			name3: { Info1: ["more", "words"] },
			Info2: ["words"],
		},
	});
});

test("pdToJsonText: 空文档输出 {}", () => {
	assert.equal(pdToJsonText(""), "{}");
});

test("pdToJsonText: 多段不指定段名抛错（保持 CLI 语义）", () => {
	const text = "//!pd a\n任务: 甲\n\n//!pd b\n任务: 乙\n";
	assert.throws(() => pdToJsonText(text), /必须指定段名/);
});

test("pdToJsonText: 多段指定段名只输出该段", () => {
	const text = "//!pd a\n任务: 甲\n\n//!pd b\n任务: 乙\n";
	const json = JSON.parse(pdToJsonText(text, "b"));
	assert.deepEqual(json, { 任务: "乙" });
});

test("pdToJsonText: 语法错误抛错，message 含行号与原因", () => {
	assert.throws(
		() => pdToJsonText("  - 顶层缩进\n"),
		/第1行.*顶层.*不允许缩进/,
	);
});

// ---- sectionNames：段名列表（供多段 QuickPick） ----

test("sectionNames: 无段标记 → 隐式段空名", () => {
	assert.deepEqual(sectionNames("任务: x\n"), [""]);
});

test("sectionNames: 两段", () => {
	assert.deepEqual(sectionNames("//!pd a\nx: 1\n//!pd b\ny: 2\n"), ["a", "b"]);
});

test("sectionNames: 裸 //!pd → 空名", () => {
	assert.deepEqual(sectionNames("//!pd\nx: 1\n"), [""]);
});

// ---- isPdFileName：宽松 PD 文件名判断 ----

test("isPdFileName: .pd 大小写不敏感", () => {
	assert.equal(isPdFileName("a.pd"), true);
	assert.equal(isPdFileName("A.PD"), true);
	assert.equal(isPdFileName("dir/b.pd"), true);
});

test("isPdFileName: 非 .pd 与边界", () => {
	assert.equal(isPdFileName("a.md"), false);
	assert.equal(isPdFileName("a.pd.txt"), false);
	assert.equal(isPdFileName("Untitled-1"), false);
	assert.equal(isPdFileName(""), false);
});
