import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { expand, splitSections } from "../src/parser/expand";
import { lex, lexLine } from "../src/parser/lexer";
import { parse } from "../src/parser/parser";
import { toJson } from "../src/parser/toJson";
import { compilePdText } from "../src/pdtransform";

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

test("严格键值判定：冒号前有空格/无空格写法都不是键值（转换非格式化）", () => {
	assert.deepEqual(fromText("a : b"), { Subject1: { Info1: ["a : b"] } });
	assert.deepEqual(fromText("a :"), { Subject1: { Info1: ["a :"] } });
	assert.deepEqual(fromText("a:b"), { Subject1: { Info1: ["a:b"] } });
	assert.deepEqual(fromText("- a : b"), { Subject1: { Info1: ["a : b"] } });
	// 标准写法与键名内空依旧有效
	assert.deepEqual(fromText("a: b"), { a: "b" });
	assert.deepEqual(fromText("bad key: v"), { "bad key": "v" });
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
	assert.throws(() => fromFile("ref.pd"), /必须指定段/);
});

test("引用段不存在 → 报错", () => {
	const text = "//!pd x\nname: :nope";
	assert.throws(() => expand(text, "x"), /引用段不存在: nope/);
});

test("循环引用 → 静默擦掉 :refname（不展开、不报错）", () => {
	const text = "//!pd a\na: :b\n//!pd b\nb: :a";
	assert.equal(expand(text, "a"), "a:\n- b:");
	assert.equal(expand(text, "b"), "b:\n- a:");
});

test("循环引用：自引用擦掉；纯文本行断开成 - 项", () => {
	assert.equal(expand("//!pd a\na: :a\n", "a"), "a:");
	assert.equal(expand("//!pd a\n内容 :a 结尾\n", "a"), "- 内容\n- 结尾");
});

test("循环引用：命名与 %序号 指向同一段时命中（引用链按实际 section 匹配）", () => {
	// b 用 :%1 指 a（a 在引用链中）→ 擦掉，不展开成残留
	const text = "//!pd a\na: :b\n//!pd b\nb: :%1\n";
	assert.equal(expand(text, "a"), "a:\n- b:");
	// 三连环 a→b→c→a
	const text3 = "//!pd a\na: :b\n//!pd b\nb: :c\n//!pd c\nc: :a\n";
	assert.equal(expand(text3, "a"), "a:\n- b:\n  - c:");
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

// ---- 行内代码（`...` 整体字串）豁免 ----

test("行内代码内冒号不参与键值判定", () => {
	assert.deepEqual(fromText("msg: 看 `a: b` 写法"), {
		msg: "看 `a: b` 写法",
	});
	assert.deepEqual(fromText("msg: `a：b` 全角"), { msg: "`a：b` 全角" });
});

test("行内代码内 `:-` 不算整行转义（行外冒号仍识别键值）", () => {
	assert.deepEqual(fromText("msg: 看 `x:- y` 和 z: ok"), {
		msg: "看 `x:- y` 和 z: ok",
	});
});

test("行内代码内 `:xxx` 非引用（不展开）", () => {
	assert.deepEqual(
		fromText("//!pd 主\n用 `:base` 写法\n//!pd base\n基础\n", "主"),
		{ Subject1: { Info1: ["用 `:base` 写法"] } },
	);
});

test("行内代码未闭合 → 当普通字符（不豁免）", () => {
	assert.deepEqual(fromText("msg: 看 `a: b"), { msg: "看 `a: b" });
});

// ---- 行内代码边界（回归：拆段误匹配 / 未闭合标记） ----

test("反引号后紧贴引用不展开（引用前必须是空白）", () => {
	// `` `x`:ref `` 冒号前是反引号 → 不是引用；` `x` :ref ` 才是
	assert.deepEqual(
		fromText("//!pd 主\n用 `x`:ref 写法\n//!pd ref\n被引用\n", "主"),
		{ Subject1: { Info1: ["用 `x`:ref 写法"] } },
	);
	assert.deepEqual(
		fromText("//!pd 主\n用 `x` :ref 写法\n//!pd ref\n被引用\n", "主"),
		{ Subject1: { Info1: ["用 `x` 被引用 写法"] } },
	);
});

test("未闭合反引号按普通字符（不豁免键值/转义判定）", () => {
	assert.deepEqual(fromText("`a: b"), { "`a": "b" }); // 键名 `a
	assert.deepEqual(fromText("clock:- 12:30"), {
		Subject1: { Info1: ["clock:- 12:30"] },
	});
	assert.equal(lexLine("`a:- b", 1).kind, "text"); // 未闭合的 `:-` 触发整行转义 → 文本
});

test("引用报错行号为段内 1-based 行号", () => {
	assert.throws(
		() => fromText("//!pd x\n任务: 甲\nname: :nope\n", "x"),
		/第2行/,
	);
});

// ---- 段标记边界 ----

test("段名含空格 → 整行不是段标记（当普通内容）", () => {
	const s = splitSections("//!pd 名 字\nx: 1\n");
	assert.deepEqual(
		s.map((x) => x.name),
		[""],
	); // 隐式段（preamble 被吞）
});

test("连续段标记 → 中间空段（编译输出空串）", () => {
	const s = splitSections("//!pd x\n//!pd y\n内容\n");
	assert.deepEqual(
		s.map((x) => x.name),
		["x", "y"],
	);
	assert.equal(compilePdText("//!pd x\n//!pd y\n内容\n", "%1"), "");
	assert.equal(compilePdText("//!pd x\n//!pd y\n内容\n", "%2"), "内容");
});

test("//!pd 行尾尾随空格 → 匿名段（trim 后判定）", () => {
	assert.deepEqual(
		splitSections("//!pd   \nx: 1\n").map((s) => s.name),
		[""],
	);
});

// ---- 围栏边界 ----

test("缩进围栏行与无缩进同规则（切段/展开/format 一致）", () => {
	assert.equal(
		compilePdText("//!pd 主\n  ```js\n  x: 1\n  ```\n完成\n", "主"),
		"  ```js\n  x: 1\n  ```\n完成",
	);
});

test("围栏内 --- 与 //!pd 行原样（不切段不解析）", () => {
	assert.equal(
		compilePdText("//!pd 主\n```\n---\n//!pd x\n```\n完成\n", "主"),
		"```\n---\n//!pd x\n```\n完成",
	);
});

test("围栏不支持嵌套：``` 逐个 toggle（开/关/再开 = 新围栏）", () => {
	const out = compilePdText(
		"//!pd 主\n```\na\n```\nb\n```\nc\n```\n完成\n",
		"主",
	);
	assert.equal(out, "```\na\n```\nb\n```\nc\n```\n完成"); // b 在围栏外但无引用，原样
});

// ---- 行内代码边界 ----

test("连续反引号段各自配对（键值判定跳过两段代码）", () => {
	assert.deepEqual(fromText("msg: `a``b` x"), { msg: "`a``b` x" });
});

test("未闭合反引号跨行即失效（下行 :- 整行转义生效）", () => {
	assert.deepEqual(fromText("msg: 看 `\nclock:- 12:30"), {
		msg: { Info1: ["看 `", "clock:- 12:30"] },
	});
});
