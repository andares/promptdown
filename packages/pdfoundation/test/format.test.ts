import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../src";

test("全角冒号 → 半角（键值位置）", () => {
	assert.equal(format("name1：some"), "name1: some");
	assert.equal(format("kill：me"), "kill: me");
	assert.equal(format("name ：value"), "name: value");
	assert.equal(format("name ： value"), "name: value");
});

test("键值冒号后恰好一个空格", () => {
	assert.equal(format("name1:some"), "name1: some");
	assert.equal(format("name1:  some"), "name1: some");
	assert.equal(format("name1 : some"), "name1: some");
	assert.equal(format("name1 :some"), "name1 :some");
	assert.equal(format("name1:"), "name1:");
});

test("后续全角冒号左侧有空格才转半角，引用仍可使用", () => {
	assert.equal(format("msg:say ：a1 more"), "msg: say :a1 more");
	assert.equal(format("msg:say：a1 more"), "msg: say：a1 more");
	assert.equal(format("no  ：a1  more"), "no: a1  more");
});

test("键值只规范化首个分隔符，后续普通冒号不再识别键值", () => {
	assert.equal(
		format("title：first：second: third"),
		"title: first：second: third",
	);
	assert.equal(format("- title：first：second"), "- title: first：second");
	assert.equal(
		format("title:value ：ref next：stay"),
		"title: value :ref next：stay",
	);
	assert.equal(
		format("title:value  :ref  more:still"),
		"title: value  :ref  more:still",
	);
});

test(":- / ：- 使整行不含键值，同时不影响后续全角引用转换", () => {
	assert.equal(format("clock:-12:30"), "clock:-12:30");
	assert.equal(format("clock：-12：30 ：base ok"), "clock：-12：30 :base ok");
	assert.equal(format("name: value :- literal"), "name: value :- literal");
});

test("顶层 `- ` 缩进自动修正", () => {
	assert.equal(format("  - wrong\nname1:\n- ok"), "- wrong\nname1:\n- ok");
});

test("行尾空白清理", () => {
	assert.equal(format("name1: some  \n"), "name1: some\n");
});

test("分隔线/段标记/空行保持不变", () => {
	const src = "//!pd a1\n---\n\nname1: some";
	assert.equal(format(src), src);
});

test("正文无冒号行保持不变", () => {
	assert.equal(format("no man\ncan"), "no man\ncan");
});

test("幂等性：format(format(x)) === format(x)", () => {
	const cases = [
		"name1：some\n- name2:other\n  - x\n  -wrong\n",
		"no man\ncan\nkill： me\n---\nnobody\n- like:you",
		"msg:no ：a1 more",
		"clock：-12：30 ：base ok",
	];
	for (const c of cases) {
		const once = format(c);
		assert.equal(format(once), once);
	}
});

// ---- 行内代码（`...` 整体字串）保护 ----

test("行内代码内冒号不参与键值判定（整体原样）", () => {
	assert.equal(format("msg: 看 `a: b` 写法"), "msg: 看 `a: b` 写法");
	assert.equal(format("msg: `a：b` 全角"), "msg: `a：b` 全角");
	assert.equal(format("msg: `a : b` 空格"), "msg: `a : b` 空格");
	assert.equal(format("msg: `a:- b` 已转义"), "msg: `a:- b` 已转义");
});

test("行内代码内冒号不触发整行转义判定（:- 豁免）", () => {
	assert.equal(
		format("msg: 看 `x:- y` 写法和 z: ok"),
		"msg: 看 `x:- y` 写法和 z: ok",
	);
});

test("行内代码多个并存、与引用共存", () => {
	assert.equal(format("msg: `x` 和 `y: z` 多个"), "msg: `x` 和 `y: z` 多个");
	assert.equal(format("msg: `a: b` :ref 引用"), "msg: `a: b` :ref 引用");
});

test("行内代码内行尾空白保留（代码内容原样）", () => {
	assert.equal(format("msg: `a  ` 代码"), "msg: `a  ` 代码");
});

// ---- 围栏保护 ----

test("围栏内行原样（键形/全角冒号/行尾空白都不处理）", () => {
	assert.equal(
		format("```js\nconst a: b = 1;\nx：y\n```\nmsg: ok"),
		"```js\nconst a: b = 1;\nx：y\n```\nmsg: ok",
	);
});

// ---- 空行规则（顶层带子域键值后空一行；文本块不触发；幂等） ----

test("空行：带子域键值后跟键值 → 空一行", () => {
	assert.equal(format("name1:\n- a\nname2: b"), "name1:\n- a\n\nname2: b");
	assert.equal(
		format("name1:\n- a\n- b\n  - c\nname2: d"),
		"name1:\n- a\n- b\n  - c\n\nname2: d",
	);
});

test("空行：简单键值不触发；已有空行不重复（幂等）", () => {
	assert.equal(format("a: 1\nb: 2"), "a: 1\nb: 2");
	assert.equal(format("name1:\n- a\n\nname2: b"), "name1:\n- a\n\nname2: b");
});

test("空行：文本块（Subject）后跟键值不触发", () => {
	assert.equal(format("---\ntext\nname: x"), "---\ntext\nname: x");
	assert.equal(format("散文\n继续\nname: x"), "散文\n继续\nname: x");
});

test("空行：围栏块后跟键值不触发；围栏内键形行不算条目", () => {
	assert.equal(
		format("```js\nconst a: b = 1;\n```\nmsg: ok"),
		"```js\nconst a: b = 1;\n```\nmsg: ok",
	);
});

test("空行：多段按段独立应用（段末不插、段内照常）", () => {
	assert.equal(
		format("//!pd 甲\nk1:\n- a\n//!pd 乙\nk2:\n- b\nk3: c"),
		"//!pd 甲\nk1:\n- a\n//!pd 乙\nk2:\n- b\n\nk3: c",
	);
});

test("空行：带子域键块后跟 --- 分隔线 → 空一行", () => {
	assert.equal(format("name1:\n- a\n---\ntext"), "name1:\n- a\n\n---\ntext");
});

test("空行：item-key 子块（- sub:）也计入带子域", () => {
	assert.equal(
		format("name1:\n- sub:\n  - x\nname2: y"),
		"name1:\n- sub:\n  - x\n\nname2: y",
	);
});

test("空文档 / 纯分隔线文档原样", () => {
	assert.equal(format(""), "");
	assert.equal(format("---\n---"), "---\n---");
});

test("行首全角冒号 / 单字符冒号原样", () => {
	assert.equal(format("：x"), "：x");
	assert.equal(format(":"), ":");
});

test("裸 - 行规范化且幂等", () => {
	assert.equal(format("-"), "- ");
	assert.equal(format(format("-")), "- ");
});
