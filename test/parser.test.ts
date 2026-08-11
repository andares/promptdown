import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { expand } from "../src/parser/expand";
import { lex } from "../src/parser/lexer";
import { parse } from "../src/parser/parser";
import { toJson } from "../src/parser/toJson";

const FIX = join(__dirname, "fixtures");

function fromText(text: string, section?: string): unknown {
	const expanded = expand(text, section);
	const doc = parse(lex(expanded));
	assert.equal(doc.errors.length, 0, `解析错误: ${JSON.stringify(doc.errors)}`);
	return toJson(doc);
}

function fromFile(name: string, section?: string): unknown {
	return fromText(readFileSync(join(FIX, name), "utf8"), section);
}

test("范例1: 平级键 + 嵌套 + 无 key 归 Info + 单条折叠", () => {
	assert.deepEqual(fromFile("flat.pd"), {
		name1: {
			Info1: ["some"],
			name2: "other words",
			name3: { Info1: ["more", "words"] },
			Info2: ["words"],
		},
	});
});

test("范例2: 无 key 开头 → Subject", () => {
	assert.deepEqual(fromFile("anon.pd"), {
		Subject1: {
			Info1: ["some"],
			name2: "other words",
			name3: { Info1: ["more", "words"] },
			Info2: ["words"],
		},
	});
});

test("范例3: --- 清父级 + Subject 续 + 裸键值独立成父亲", () => {
	assert.deepEqual(fromFile("subject.pd"), {
		Subject1: { Info1: ["no man", "can"] },
		kill: "me",
		Subject2: { Info1: ["nobody"], like: "you" },
	});
});

test("范例4: 多段 + 引用内联展开（指定段名 a2）", () => {
	assert.deepEqual(fromFile("ref.pd", "a2"), {
		name3: {
			Info1: ["no"],
			name1: { some: "words" },
			Info2: ["more"],
		},
	});
});

test("键值仅以第一个冒号分隔，右值中的冒号原样进入 JSON", () => {
	const text = `title: first: second: third
- child: https://example.com:8443/path`;
	assert.deepEqual(fromText(text), {
		title: {
			Info1: ["first: second: third"],
			child: "https://example.com:8443/path",
		},
	});
});

test(":- / ：- 使整行不含键值，内容原样进入 Subject", () => {
	assert.deepEqual(fromText("clock:- 12:30"), {
		Subject1: { Info1: ["clock:- 12:30"] },
	});
	assert.deepEqual(fromText("clock：- 12:30"), {
		Subject1: { Info1: ["clock：- 12:30"] },
	});
	assert.deepEqual(fromText("name: value :- literal"), {
		Subject1: { Info1: ["name: value :- literal"] },
	});
});

test("冒号规则 fixture：首个键值 + 普通冒号标记", () => {
	assert.deepEqual(fromFile("colon.pd"), {
		title: "first: second: third",
		Subject1: { Info1: ["clock:- 12:30"] },
		Subject2: { Info1: ["clock：- 12:30"] },
	});
});

test(":- 转义不影响同一行后续引用", () => {
	const text = `//!pd base
hello world
//!pd main
clock:- 12:30 :base done`;
	assert.deepEqual(fromText(text, "main"), {
		Subject1: { Info1: ["clock:- 12:30 hello world done"] },
	});
});

test("多段文件不指定段名 → 报错", () => {
	assert.throws(() => fromFile("ref.pd"), /必须指定段名/);
});

test("引用段不存在 → 报错", () => {
	const text = "//!pd x\nname: :nope";
	assert.throws(() => expand(text, "x"), /引用段不存在: nope/);
});

test("循环引用 → 报错", () => {
	const text = "//!pd a\na: :b\n//!pd b\nb: :a";
	assert.throws(() => expand(text, "a"), /循环引用/);
});

test("顶层 - 缩进 → 语法错误", () => {
	const text = readFileSync(join(FIX, "err.pd"), "utf8");
	const doc = parse(lex(expand(text)));
	assert.ok(doc.errors.length > 0, "应产生语法错误");
	assert.match(doc.errors[0]?.message ?? "", /顶层 `-` 不允许缩进/);
});

test("内容行中的纯文字引用 → 内联嵌入（保留前后空格）", () => {
	const text = `//!pd base
hello world
//!pd main
msg:
- say :base please`;
	assert.deepEqual(fromText(text, "main"), {
		msg: { Info1: ["say hello world please"] },
	});
});

test("键值右值中的纯文字引用 → 内联嵌入（保留前后空格）", () => {
	const text = `//!pd base
hello world
//!pd main
msg: say :base please`;
	assert.deepEqual(fromText(text, "main"), {
		msg: "say hello world please",
	});
});

test("中文引用名：块嵌入展开（fixture ref-cn）", () => {
	assert.deepEqual(fromFile("ref-cn.pd", "任务"), {
		任务: {
			技术栈: "React",
			参考: { 语言: "TypeScript", 目标: "实现一个带防抖的搜索框" },
			额外要求: "防抖延迟 300ms",
		},
	});
});

test("中文引用名：纯文字引用 → 内联嵌入（保留前后空格）", () => {
	const text = `//!pd 设定
快走，别回头
//!pd 台词
台词: 她说 :设定 了吗`;
	assert.deepEqual(fromText(text, "台词"), {
		台词: "她说 快走，别回头 了吗",
	});
});

test("中文引用名：`:-` 普通冒号标记仍不被识别为引用，后续中文引用正常展开", () => {
	const text = `//!pd 设定
hello world
//!pd 台词
clock:- 12:30 :设定 done`;
	assert.deepEqual(fromText(text, "台词"), {
		Subject1: { Info1: ["clock:- 12:30 hello world done"] },
	});
});

test("空块 → 空对象", () => {
	assert.deepEqual(fromText("name:"), { name: {} });
});

test("多行内容 + 键值混排 → 对象套 Info", () => {
	const text = `name1: some
words
- sub:
  - x`;
	assert.deepEqual(fromText(text), {
		name1: {
			Info1: ["some", "words"],
			sub: { Info1: ["x"] },
		},
	});
});

test("混输 preamble 被丢弃，取第一个段", () => {
	const text = `这是普通提示词
不是 pd

//!pd main
name: value`;
	assert.deepEqual(fromText(text), { name: "value" });
});
