import assert from "node:assert/strict";
import { test } from "node:test";
import { compilePdText, pdToJsonText } from "../src";

// ---- compilePdText：单文件编译（选段展开 + format） ----

test("compilePdText: 单段隐式段省略 selector 直接编译", () => {
	assert.equal(compilePdText("name1: some\n"), "name1: some");
});

test("compilePdText: 引用在编译期内联展开", () => {
	const text = "//!pd base\n基础内容\n//!pd main\n任务: :base 完成\n";
	assert.equal(compilePdText(text, "main"), "任务: 基础内容 完成");
});

test("compilePdText: %序号选段（含匿名段）", () => {
	const text = "//!pd\n任务: 一\n//!pd 乙\n任务: 二\n";
	assert.equal(compilePdText(text, "%2"), "任务: 二");
});

test("compilePdText: 隐式段用文件主名寻址", () => {
	assert.equal(compilePdText("任务: 甲\n", "first", "first"), "任务: 甲");
});

test("compilePdText: 输出统一 format（空行规则 + 规范化）", () => {
	const text = "//!pd a\n任务: 甲\n- 子项\n//!pd b\n任务: 乙\n";
	assert.equal(compilePdText(text, "a"), "任务: 甲\n- 子项");
	assert.equal(compilePdText("name1：some\n"), "name1: some");
});

test("compilePdText: 围栏内引用不展开、不切段", () => {
	const text =
		"//!pd 主\n```md\n参考 :base 写法\n//!pd 不是段\n```\n完成\n//!pd base\n基础\n";
	assert.equal(
		compilePdText(text, "主"),
		"```md\n参考 :base 写法\n//!pd 不是段\n```\n完成",
	);
});

test("compilePdText: 行内代码内引用不展开", () => {
	const text = "//!pd 主\n用 `:base` 写法\n//!pd base\n基础\n";
	assert.equal(compilePdText(text, "主"), "用 `:base` 写法");
});

test("compilePdText: 未命名段不自动赋文件名（只能 %N 访问）", () => {
	const text = "//!pd\n任务: 甲\n";
	assert.throws(() => compilePdText(text, "first", "first"), /段不存在: first/);
	assert.equal(compilePdText(text, "%1"), "任务: 甲");
});



test("compilePdText: :%N 序号引用匿名段（用户案例）", () => {
	const text = "//!pd\ndddd\n\n//!pd\naa: bbb :%1\n";
	assert.equal(compilePdText(text, "%2"), "aa: bbb dddd");
	assert.equal(compilePdText(text, "%1"), "dddd");
});

test("compilePdText: :%N 序号引用命名段；名字引用与序号引用并存", () => {
	const text = "//!pd 基础\n内容甲\n//!pd 主\n任务: :%1 和 :基础 都行\n";
	assert.equal(compilePdText(text, "主"), "任务: 内容甲 和 内容甲 都行");
});

test("compilePdText: :%N 越界报错", () => {
	const text = "//!pd\n任务: :%9 不存在\n";
	assert.throws(() => compilePdText(text, "%1"), /引用段不存在: %9/);
});

test("compilePdText: :%N 循环引用静默擦除", () => {
	const text = "//!pd\n甲: :%2\n//!pd\n乙: :%1\n";
	assert.equal(compilePdText(text, "%1"), "甲:\n- 乙:");
});

test("compilePdText: 循环与正常引用混一行（循环擦掉、正常展开）", () => {
	const text = "//!pd a\nA: :b :x\n//!pd b\nB: :a\n//!pd x\n正常内容\n";
	assert.equal(compilePdText(text, "a"), "A:\n- B:\n- 正常内容");
});

test("pdToJsonText: :%N 序号引用同样生效（transform 路径）", () => {
	const text = "//!pd\ndddd\n\n//!pd\naa: bbb :%1\n";
	assert.deepEqual(JSON.parse(pdToJsonText(text, "%2")), { aa: "bbb dddd" });
});


test("compilePdText: 引用段块嵌入的代码块永远顶层（不转 `- ` 序列项，用户案例）", () => {
	const text = [
		"//!pd",
		"dd: dd",
		"- dd: 44",
		"- ddd: 3333",
		"  - dddd",
		"",
		"---",
		"dddd: 111",
		"",
		"```ts",
		"let aaa = 100;",
		"```",
		"",
		"//!pd 222",
		"dddd :%1",
	].join("\n");
	const out = compilePdText(text, "%2");
	// 围栏行与围栏内容保持顶层原样（code 无视引用嵌入的前置序列上下文）
	assert.ok(out.includes("\n```ts\nlet aaa = 100;\n```"), out);
	assert.ok(!out.includes("- ```"), `围栏被转序列项:\n${out}`);
	assert.ok(!out.includes("- let aaa"), `围栏内容被转序列项:\n${out}`);
	// transform 路径同源验证：Code1.body 不带序列前缀
	const json = JSON.parse(pdToJsonText(text, "%2"));
	assert.equal(json.Subject2.Code1.body, "let aaa = 100;");
});
