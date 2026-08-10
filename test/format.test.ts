import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../src/format";

test("全角冒号 → 半角（键值位置）", () => {
	assert.equal(format("name1：some"), "name1: some");
	assert.equal(format("kill：me"), "kill: me");
});

test("键值冒号后恰好一个空格", () => {
	assert.equal(format("name1:some"), "name1: some");
	assert.equal(format("name1:  some"), "name1: some");
	assert.equal(format("name1 : some"), "name1: some");
	assert.equal(format("name1:"), "name1:");
});

test("引用前后各一个空格（全角转半角 + 空格规范化）", () => {
	assert.equal(format("msg:say ：a1 more"), "msg: say :a1 more");
	assert.equal(format("no  ：a1  more"), "no :a1 more");
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
	];
	for (const c of cases) {
		const once = format(c);
		assert.equal(format(once), once);
	}
});
