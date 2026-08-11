import assert from "node:assert/strict";
import { test } from "node:test";
import { format } from "../src/format";
import { expand } from "../src/parser/expand";
import { lex } from "../src/parser/lexer";
import { parse } from "../src/parser/parser";
import { toJson } from "../src/parser/toJson";

function pd2json(text: string): unknown {
	const doc = parse(lex(expand(text)));
	assert.equal(doc.errors.length, 0, `解析错误: ${JSON.stringify(doc.errors)}`);
	return toJson(doc);
}

test("代码块：基本围栏（带 lang）→ Code1 { lang, body }", () => {
	assert.deepEqual(pd2json("name:\n```js\nconst x = 1;\n```"), {
		name: { Code1: { lang: "js", body: "const x = 1;" } },
	});
});

test("代码块：无 lang → 只有 body 字段", () => {
	assert.deepEqual(pd2json("name:\n```\nplain text\n```"), {
		name: { Code1: { body: "plain text" } },
	});
});

test("代码块：多行 body 保留换行（整个代码文本）", () => {
	assert.deepEqual(
		pd2json("name:\n```py\ndef f():\n    return 1\n```"),
		{ name: { Code1: { lang: "py", body: "def f():\n    return 1" } } },
	);
});

test("代码块：顶层无 key → 归 Subject1", () => {
	assert.deepEqual(pd2json("```js\nconst a = 1;\n```"), {
		Subject1: { Code1: { lang: "js", body: "const a = 1;" } },
	});
});

test("代码块：嵌套 `- sub:` 内出现 → 仍归顶层键（简化规则）", () => {
	assert.deepEqual(
		pd2json("name:\n- sub:\n  - x\n```js\nconst a = 1;\n```"),
		{
			name: {
				sub: { Info1: ["x"] },
				Code1: { lang: "js", body: "const a = 1;" },
			},
		},
	);
});

test("代码块：与 Info 混排保持顺序", () => {
	assert.deepEqual(
		pd2json("name:\n- some\n```\ncode\n```\nwords"),
		{
			name: {
				Info1: ["some"],
				Code1: { body: "code" },
				Info2: ["words"],
			},
		},
	);
});

test("代码块：有代码块时键值不折叠", () => {
	assert.deepEqual(pd2json("name: value\n```\ncode\n```"), {
		name: { Info1: ["value"], Code1: { body: "code" } },
	});
});

test("代码块：多个代码块编号递增 Code1/Code2", () => {
	assert.deepEqual(
		pd2json("name:\n```a\n1\n```\n```b\n2\n```"),
		{ name: { Code1: { lang: "a", body: "1" }, Code2: { lang: "b", body: "2" } } },
	);
});

test("代码块：未闭合围栏 → body 延伸到文件尾", () => {
	assert.deepEqual(pd2json("name:\n```js\nconst x = 1;"), {
		name: { Code1: { lang: "js", body: "const x = 1;" } },
	});
});

test("代码块：每层独立编号（name.Code1 与 Subject1.Code1）", () => {
	assert.deepEqual(
		pd2json("name:\n```\na\n```\n---\n```\nb\n```"),
		{
			name: { Code1: { body: "a" } },
			Subject1: { Code1: { body: "b" } },
		},
	);
});

test("format：围栏内行原样保留（不格式化冒号/缩进）", () => {
	const src = "name:\n```js\nconst x = {a : 1};\n  const y = 2;\n```";
	assert.equal(format(src), src);
});

test("format：围栏外的行照常格式化，幂等", () => {
	const src = "name：v\n```\ncode : here\n```\n-  x";
	const once = format(src);
	assert.equal(once, "name: v\n```\ncode : here\n```\n- x");
	assert.equal(format(once), once);
});
