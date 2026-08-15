import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isPdFileName, pdToJsonText, sectionNames } from "../src/pdtransform";
import {
	detectTransformKind,
	isJsonFileName,
	resolveSectionName,
} from "../src/pdtransform";
import { splitSections } from "../src/parser/expand";

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
	assert.throws(() => pdToJsonText("  - 顶层缩进\n"), /第1行.*顶层.*不允许缩进/);
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

// ---- isJsonFileName ----

test("isJsonFileName: .json 大小写不敏感", () => {
	assert.equal(isJsonFileName("a.json"), true);
	assert.equal(isJsonFileName("A.JSON"), true);
	assert.equal(isJsonFileName("dir/b.json"), true);
	assert.equal(isJsonFileName("a.jsonc"), false);
	assert.equal(isJsonFileName("a.pd"), false);
	assert.equal(isJsonFileName(""), false);
});

// ---- resolveSectionName：段名或 1-based 序号 ----

const SECTIONS = splitSections("//!pd 甲\nx: 1\n//!pd\ny: 2\n//!pd 丙\nz: 3\n");

test("resolveSectionName: 省略返回 undefined", () => {
	assert.equal(resolveSectionName(SECTIONS, undefined), undefined);
});

test("resolveSectionName: 按段名精确匹配", () => {
	assert.equal(resolveSectionName(SECTIONS, "丙"), "丙");
});

test("resolveSectionName: 数字名优先于序号", () => {
	const s2 = splitSections("//!pd 甲\nx: 1\n//!pd 2\ny: 2\n");
	assert.equal(resolveSectionName(s2, "2"), "2"); // 存在名为 2 的段 → 按名字
});

test("resolveSectionName: 1-based 序号（含未命名段）", () => {
	assert.equal(resolveSectionName(SECTIONS, "1"), "甲");
	assert.equal(resolveSectionName(SECTIONS, "2"), "");
	assert.equal(resolveSectionName(SECTIONS, "3"), "丙");
});

test("resolveSectionName: 越界/不存在抛错", () => {
	assert.throws(
		() => resolveSectionName(SECTIONS, "4"),
		/段不存在: 第 4 块（文件共 3 段）/,
	);
	assert.throws(() => resolveSectionName(SECTIONS, "0"), /段不存在/);
	assert.throws(
		() => resolveSectionName(SECTIONS, "不存在的段"),
		/段不存在: 不存在的段/,
	);
});

// ---- detectTransformKind：扩展名 → 内容探针 ----

test("detectTransformKind: 扩展名优先", () => {
	assert.equal(detectTransformKind("a.pd", ""), "pd");
	assert.equal(detectTransformKind("a.PD", ""), "pd");
	assert.equal(detectTransformKind("a.json", "任意内容"), "json");
});

test("detectTransformKind: 内容探针（无扩展名/未知扩展名）", () => {
	assert.equal(detectTransformKind("a.txt", "//!pd x\n任务: 1\n"), "pd");
	assert.equal(detectTransformKind("a.txt", '  {"a": 1}\n'), "json");
	assert.equal(detectTransformKind("a.txt", '//!pd\n{"a": 1}'), "pd"); // 段标记优先于 JSON
	assert.equal(detectTransformKind("a.txt", "随便写点什么\n"), null);
	assert.equal(detectTransformKind("a.txt", ""), null);
});

test("detectTransformKind: 大小写扩展名", () => {
	assert.equal(detectTransformKind("A.JSON", ""), "json");
});
