import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../src/format";

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
