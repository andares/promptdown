import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	compilePdText,
	isPdFileName,
	pdToJsonText,
	sectionNames,
} from "../src";
import { detectTransformKind, isJsonFileName } from "../src";
import {
	findSection,
	nameSections,
	resolveSection,
	splitSections,
} from "../src/parser/expand";

const FIX = join(import.meta.dirname, "fixtures");

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
	assert.throws(() => pdToJsonText(text), /必须指定段/);
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

test("pdToJsonText: 两个未命名段按 %序号 选第 2 段（回归：修复前始终解析第 1 段）", () => {
	const text = "//!pd\n任务: 一\n\n//!pd\n任务: 二\n";
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%2")), { 任务: "二" });
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%1")), { 任务: "一" });
});

test("pdToJsonText: 混合命名/未命名段按 %序号 选（序号覆盖全部段）", () => {
	const text =
		"//!pd 甲\n任务: 甲\n\n//!pd\n任务: 未命名一\n\n//!pd\n任务: 未命名二\n";
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%2")), { 任务: "未命名一" });
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%3")), { 任务: "未命名二" });
});

test("pdToJsonText: 隐式段可用文件主名寻址", () => {
	assert.deepEqual(JSON.parse(pdToJsonText("任务: 甲\n", "first", "first")), {
		任务: "甲",
	});
});

test("pdToJsonText: 命名以 % 开头的段转义为 %%（与 %序号 区分）", () => {
	const text = "//!pd %p\n任务: 甲\n";
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%%p")), { 任务: "甲" });
	assert.throws(() => pdToJsonText(text, "%p"), /段不存在/);
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

// ---- resolveSection：段名或 %序号（新寻址规范） ----

const SECTIONS = splitSections("//!pd 甲\nx: 1\n//!pd\ny: 2\n//!pd 丙\nz: 3\n");

test("resolveSection: %N 序号（含匿名段）", () => {
	assert.equal(resolveSection(SECTIONS, "%1").name, "甲");
	assert.equal(resolveSection(SECTIONS, "%2").name, "");
	assert.equal(resolveSection(SECTIONS, "%3").name, "丙");
});

test("resolveSection: 字符模式匹配存储名（数字命名也是字符）", () => {
	assert.equal(resolveSection(SECTIONS, "丙").name, "丙");
	const s2 = splitSections("//!pd 甲\nx: 1\n//!pd 2\ny: 2\n");
	assert.equal(resolveSection(s2, "2").name, "2"); // 存在名为 2 的段 → 按名字（%2 才是序号）
	assert.equal(resolveSection(s2, "%1").name, "甲");
});

test("resolveSection: % 命名转义（首字符 % → %%）", () => {
	const s = splitSections("//!pd %p\nx: 1\n");
	assert.equal(s[0].name, "%%p");
	assert.equal(resolveSection(s, "%%p").name, "%%p"); // 存储名匹配
	assert.throws(() => resolveSection(s, "%p"), /段不存在/); // %p 是序号寻址（越界）
	assert.equal(resolveSection(s, "%1").name, "%%p"); // %1 序号找到该段
});

test("resolveSection: 匿名段只能 %N 访问（空 selector 报错）", () => {
	const s = splitSections("//!pd\na: 1\n");
	assert.throws(() => resolveSection(s, ""), /匿名段只能用 %N/);
});

test("resolveSection: 越界/不存在抛错", () => {
	assert.throws(
		() => resolveSection(SECTIONS, "%4"),
		/段不存在: 第 4 块（文件共 3 段）/,
	);
	assert.throws(() => resolveSection(SECTIONS, "%0"), /段不存在/);
	assert.throws(
		() => resolveSection(SECTIONS, "不存在的段"),
		/段不存在: 不存在的段/,
	);
});

test("findSection: 同名段先到先得（返回第一个；后段失去名字语义）", () => {
	const s = splitSections("//!pd 基础\na: 1\n//!pd 基础\nb: 2\n");
	assert.equal(findSection(s, "基础")?.name, "基础");
	assert.equal(resolveSection(s, "基础").lines[0], "a: 1"); // 先到先得：第一个
	assert.equal(findSection(s, "%2")?.lines[0], "b: 2"); // 后段只能 %N
});

test("nameSections: 隐式段赋文件主名；有标记的匿名段不赋名", () => {
	const implicit = splitSections("a: 1\n");
	nameSections("a: 1\n", implicit, "first");
	assert.equal(implicit[0].name, "first");

	const anon = splitSections("//!pd\na: 1\n");
	nameSections("//!pd\na: 1\n", anon, "first");
	assert.equal(anon[0].name, ""); // 不自动赋文件名
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

// ---- % 转义边界（命名首字符 % → 加倍；不判断是否已加倍） ----

test("findSection/resolveSection: % 转义与序号/字符区分（系统性）", () => {
	const s = splitSections("//!pd %p\nx: 1\n//!pd %%p\ny: 2\n//!pd 1\nz: 3\n");
	// 存储名逐级加倍
	assert.equal(s[0]!.name, "%%p");
	assert.equal(s[1]!.name, "%%%p");
	assert.equal(s[2]!.name, "1"); // 数字命名不转义
	// 寻址：字符模式匹配转义名；%N 永远是序号
	assert.equal(resolveSection(s, "%%p").name, "%%p");
	assert.equal(resolveSection(s, "%%%p").name, "%%%p");
	assert.equal(resolveSection(s, "%1").name, "%%p"); // %1 序号 = 第 1 段
	assert.equal(resolveSection(s, "%3").name, "1");
	assert.throws(() => resolveSection(s, "%p"), /段不存在/); // %p 是序号寻址（越界）
	// 字符 1 匹配命名 1 的段（%1 是序号）
	const s7 = splitSections("//!pd 1\nx: 1\n//!pd 2\ny: 2\n");
	assert.equal(findSection(s7, "1"), s7[0]);
	assert.equal(findSection(s7, "%1"), s7[0]);
	assert.equal(findSection(s7, "2"), s7[1]);
});

test("compilePdText: :%%p 转义名引用与 :%N 序号引用共存", () => {
	const r = compilePdText("//!pd %p\n内容甲\n//!pd\n任务: :%1 和 :%%p\n", "%2");
	assert.equal(r, "任务: 内容甲 和 内容甲");
	assert.throws(
		() => compilePdText("//!pd %p\n内容甲\n//!pd 主\n任务: :%p 完成\n", "主"),
		/引用段不存在: %p/,
	);
});
