import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { jsonToPdText } from "../src";
import { format } from "../src";
import { expand, splitSections } from "../src/parser/expand";
import { lex } from "../src/parser/lexer";
import { parse } from "../src/parser/parser";
import { toJson } from "../src/parser/toJson";

const FIX = join(import.meta.dirname, "fixtures");

/** 解析 pd 文本（按段；空段名 → 不指定，单段直接取）→ JSON 对象 */
function toJsonObj(pd: string, section?: string): unknown {
	const doc = parse(lex(expand(pd, section || undefined)));
	assert.equal(
		doc.errors.length,
		0,
		doc.errors.map((e) => e.message).join("；"),
	);
	return toJson(doc);
}

/**
 * 回环固定点：pd → JSON → pd → JSON → pd，断言两次渲染的 pd 完全一致。
 * （冒号转义会改变内容项文本——`a: b` → `a:- b`——因此不再断言 JSON 内容相等；
 * 渲染收敛到固定点即证明转换稳定、结构可回环。）
 */
function assertRoundtrip(pd: string, section?: string): string {
	const json1 = toJsonObj(pd, section);
	const pd2 = format(jsonToPdText(JSON.stringify(json1)).pd);
	const json2 = toJsonObj(pd2);
	const pd3 = format(jsonToPdText(JSON.stringify(json2)).pd);
	assert.equal(
		pd2,
		pd3,
		`渲染未收敛。\npd1=${JSON.stringify(pd)}\npd2=${JSON.stringify(pd2)}\npd3=${JSON.stringify(pd3)}\njson2=${JSON.stringify(json2)}`,
	);
	return pd2;
}

// ---- 值类型规则 ----

test("字符串折叠互逆：简单键值", () => {
	assert.equal(
		jsonToPdText('{"name1": "value1", "name2": "value2"}').pd,
		"name1: value1\nname2: value2",
	);
});

test("对象 → 键块；空对象 → 裸键", () => {
	assert.equal(
		jsonToPdText('{"K": {"a": "1", "b": "2"}}').pd,
		"K:\n- a: 1\n- b: 2",
	);
	assert.equal(jsonToPdText('{"K": {}}').pd, "K:");
});

test("嵌套子块：缩进 2 起步", () => {
	assert.equal(
		jsonToPdText('{"K": {"child": {"grand": "g"}}}').pd,
		"K:\n- child:\n  - grand: g",
	);
});

test("数字/布尔/null 转文本（带警告）", () => {
	const r = jsonToPdText('{"a": 42, "b": true, "c": null}');
	assert.equal(r.pd, "a: 42\nb: true\nc: null");
	assert.deepEqual(r.warnings, [
		"a: 42 已转文本",
		"b: true 已转文本",
		"c: null 已转文本",
	]);
});

test("InfoN → 内容行；Info 段被键打断", () => {
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["a", "b"], "child": "x", "Info2": ["c"]}}').pd,
		"K:\n- a\n- b\n- child: x\n- c",
	);
});

test("CodeN → 围栏（仅顶层块）", () => {
	assert.equal(
		jsonToPdText(
			'{"K": {"Info1": ["a"], "Code1": {"lang": "js", "body": "x\\ny"}, "Info2": ["b"]}}',
		).pd,
		"K:\n- a\n```js\nx\ny\n```\n- b",
	);
});

// ---- 空行规则（用户指定；jsonToPd 已不输出空行，统一由 format 负责） ----

function fmt(json: string): string {
	return format(jsonToPdText(json).pd);
}

test("空行规则：简单键值之间不空行", () => {
	assert.equal(
		fmt('{"name1": "value1", "name2": "value2"}'),
		"name1: value1\nname2: value2",
	);
});

test("空行规则：带子域键值后跟任何顶层内容都空一行", () => {
	assert.equal(
		fmt(
			'{"name1": {"Info1": ["value1", "value2"]}, "name2": {"Info1": ["value3", "value4"]}}',
		),
		"name1:\n- value1\n- value2\n\nname2:\n- value3\n- value4",
	);
});

test("空行规则：简单键值后不空行（即使后面是带子域键值）", () => {
	assert.equal(
		fmt('{"name1": "value1", "name2": {"Info1": ["value3"]}}'),
		"name1: value1\nname2:\n- value3",
	);
});

test("空行规则：带子域键值后跟文本块 → 空一行 + ---", () => {
	assert.equal(
		fmt('{"name1": {"Info1": ["value1"]}, "Subject1": {"Info1": ["text"]}}'),
		"name1:\n- value1\n\n---\ntext",
	);
});

// ---- Subject 还原 ----

test("Subject 还原：全 InfoN/CodeN → 裸文本块/代码块", () => {
	assert.equal(
		jsonToPdText('{"Subject1": {"Info1": ["散文", "继续"]}}').pd,
		"散文\n继续",
	);
	assert.equal(
		jsonToPdText('{"Subject1": {"Code1": {"lang": "js", "body": "x"}}}').pd,
		"```js\nx\n```",
	);
});

test("Subject 还原：相邻裸块之间输出 ---", () => {
	assert.equal(
		jsonToPdText('{"Subject1": {"Info1": ["a"]}, "Subject2": {"Info1": ["b"]}}')
			.pd,
		"a\n---\nb",
	);
});

test("Subject 还原：含命名子键 → 正常键块", () => {
	assert.equal(
		jsonToPdText('{"Subject1": {"name": "value"}}').pd,
		"Subject1:\n- name: value",
	);
});

test("Subject 还原：字符串值 → 显式键", () => {
	assert.equal(jsonToPdText('{"Subject1": "x"}').pd, "Subject1: x");
});

test("Subject 还原：空对象 → 裸键", () => {
	assert.equal(jsonToPdText('{"Subject1": {}}').pd, "Subject1:");
});

// ---- 丢弃规则 ----

test("丢弃：数组键/多行/空串/首尾空白", () => {
	const r = jsonToPdText(
		'{"a": [1, 2], "b": "x\\ny", "c": "", "d": " x", "e": "ok"}',
	);
	assert.equal(r.pd, "e: ok");
	assert.deepEqual(r.warnings, [
		"a: 数组，不符合 pd 结构，已丢弃",
		"b: 多行字符串，已丢弃",
		"c: 空字符串，已丢弃",
		"d: 首尾空白，已丢弃",
	]);
});

test("丢弃：顶层 InfoN 数组键", () => {
	assert.equal(jsonToPdText('{"Info1": ["a"]}').pd, "");
	assert.equal(jsonToPdText('{"Info2": ["a"], "ok": "x"}').pd, "ok: x");
});

test("根 CodeN 对象是合法键块（如 `Code1:\n- body: x` 的规范输出），按普通键块渲染", () => {
	const r = jsonToPdText('{"Code1": {"body": "x"}}');
	assert.equal(r.pd, "Code1:\n- body: x");
	assert.deepEqual(r.warnings, []);
});

test("尾随空格键名不符合严格键值规则，丢弃", () => {
	const r = jsonToPdText('{"bad key ": "value"}');
	assert.equal(r.pd, "");
	assert.deepEqual(r.warnings, ["bad key : 键名不符合规则，已丢弃"]);
});

test("无效根键（含冒号/空串）丢弃，含警告", () => {
	const r = jsonToPdText('{"a:b": "x", "": 1, "好": "ok"}');
	assert.equal(r.pd, "好: ok");
	assert.deepEqual(r.warnings, [
		"a:b: 键名不符合规则，已丢弃",
		": 键名不符合规则，已丢弃",
	]);
});

test("被丢弃的键不能打断 Info 段（否则静默合并），后续 InfoN 丢弃", () => {
	const r = jsonToPdText(
		'{"K": {"Info1": ["a"], "bad": [1, 2], "Info2": ["b"]}}',
	);
	assert.equal(r.pd, "K:\n- a");
	assert.deepEqual(r.warnings, [
		"K.bad: 数组，不符合 pd 结构，已丢弃",
		"K.Info2: Info 编号不连续或相邻段，已丢弃",
	]);
});

test("值/内容项首尾空白丢弃（pd 无法表示）", () => {
	assert.equal(jsonToPdText('{"a": "x "}').pd, "");
	assert.equal(
		jsonToPdText('{"K": {"Info1": [" x", "x ", "ok"]}}').pd,
		"K:\n- ok",
	);
});

test("丢弃：Info 编号不连续 / 相邻段 / 空数组", () => {
	assert.equal(jsonToPdText('{"K": {"Info2": ["a"]}}').pd, "K:");
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["a"], "Info2": ["b"]}}').pd,
		"K:\n- a",
	);
	assert.equal(jsonToPdText('{"K": {"Info1": []}}').pd, "K:");
});

test("嵌套 CodeN（深度 ≥ 2）不能作围栏 → 按命名键块渲染", () => {
	assert.equal(
		jsonToPdText('{"K": {"child": {"Code1": {"body": "x"}}}}').pd,
		"K:\n- child:\n  - Code1:\n    - body: x",
	);
});

test("键形内容项：第一个冒号转义（保留后续字符）——转回后仍是文本不是键值", () => {
	// `a: b` → `a:- b`（空格保留）；全角 `x：y` → `x：-y`；无空格 `e:f` → `e:-f`
	assert.equal(
		jsonToPdText('{"K": {"child": "x", "Info1": ["a: b", "ok"]}}').pd,
		"K:\n- child: x\n- a:- b\n- ok",
	);
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["x：y", "e:f"]}}').pd,
		"K:\n- x：-y\n- e:-f",
	);
	// 已含 `:-` 的项整行已安全，不再转义
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["a:- b 已转义"]}}').pd,
		"K:\n- a:- b 已转义",
	);
	// 行内代码段内的冒号不转义（整体字串）
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["用 `a: b` 写法"]}}').pd,
		"K:\n- 用 `a: b` 写法",
	);
	// 裸 Subject 中非内联位置的键形项（Code1 在前，Info1 不是首条目）→ 转义
	assert.equal(
		jsonToPdText(
			'{"Subject1": {"Code1": {"body": "x"}, "Info1": ["x: y", "ok"]}}',
		).pd,
		"```\nx\n```\nx:- y\nok",
	);
	// Info1 首条目键形 → 内联还原优先（精确回环，优于转义）
	assert.equal(
		jsonToPdText('{"Subject1": {"Info1": ["x: y", "ok"]}}').pd,
		"Subject1: x: y\n- ok",
	);
	// 空格在冒号前的条目 → 也转义（防 format 规范化成键值）
	assert.equal(jsonToPdText('{"K": {"Info1": ["x : y"]}}').pd, "K:\n- x :- y");
});

test("丢弃：段标记/分隔线/围栏形内容项", () => {
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["```js", "", "ok"]}}').pd,
		"K:\n- ok",
	);
	assert.equal(
		jsonToPdText('{"Subject1": {"Info1": ["//!pd z", "---", "ok"]}}').pd,
		"ok",
	);
});

test("名为 CodeN 的普通子键块不丢（无 body → 键块）", () => {
	const r = jsonToPdText('{"K": {"Code1": {"k": "v"}, "Code2": {"body": "x"}}}');
	assert.equal(r.pd, "K:\n- Code1:\n  - k: v\n- Code2:\n  - body: x");
	assert.deepEqual(r.warnings, []);
});

test("无法作围栏的 CodeN 落到键块渲染（body 含围栏/lang 含换行/类型不符）", () => {
	assert.equal(
		jsonToPdText('{"K": {"Code1": {"body": "a\\n```b"}}}').pd,
		"K:\n- Code1:",
	);
	assert.equal(
		jsonToPdText('{"K": {"Code1": {"lang": "a\\nb", "body": "x"}}}').pd,
		"K:\n- Code1:\n  - body: x",
	);
	assert.equal(
		jsonToPdText('{"K": {"Code1": {"body": 1}}}').pd,
		"K:\n- Code1:\n  - body: 1",
	);
	assert.equal(
		jsonToPdText('{"K": {"Code1": {"lang": 1, "body": "x"}}}').pd,
		"K:\n- Code1:\n  - lang: 1\n  - body: x",
	);
});

test("键形 Info 首项（来自键行内联值）还原为内联键值行", () => {
	// `a: a: b` + 内容行 → {"a": {"Info1": ["a: b", ...]}}，首项只能内联回环
	assert.equal(
		jsonToPdText('{"a": {"Info1": ["a: b", "y"]}}').pd,
		"a: a: b\n- y",
	);
	assert.equal(
		jsonToPdText('{"K": {"child": {"Info1": ["x: y", "z"]}}}').pd,
		"K:\n- child: x: y\n  - z",
	);
	assert.equal(
		jsonToPdText('{"Subject1": {"Info1": ["a: b", "y"]}}').pd,
		"Subject1: a: b\n- y",
	);
});

test("根非对象抛错", () => {
	assert.throws(() => jsonToPdText("[1, 2]"), /JSON 根必须是对象/);
	assert.throws(() => jsonToPdText('"x"'), /JSON 根必须是对象/);
	assert.throws(() => jsonToPdText("not json"), /不是有效的 JSON 文本/);
});

// ---- 回环不变量：所有 fixtures 均 pd → JSON → pd → JSON 一致 ----
// 多段 fixture 逐段跑（引用在段间展开后各自独立回环）

const FIXTURES = [
	"anon.pd",
	"colon.pd",
	"edge.pd",
	"flat.pd",
	"ref.pd",
	"ref-cn.pd",
	"subject.pd",
];

for (const f of FIXTURES) {
	test(`回环不变量: ${f}`, () => {
		const text = readFileSync(join(FIX, f), "utf8");
		const sections = splitSections(text);
		for (const s of sections) {
			assertRoundtrip(text, s.name);
		}
	});
}

test("回环不变量: 用户示例", () => {
	assertRoundtrip("name1: value1\nname2: value2");
	assertRoundtrip("name1:\n- value1\n- value2\n\nname2:\n- value3\n- value4");
});

test("回环不变量: 复杂混合（键块/围栏/Subject/子键/---）", () => {
	assertRoundtrip(
		[
			"分镜:",
			"- 镜头1:",
			"  - 场景: 雨夜",
			"- 镜头2:",
			"```js",
			"const x = 1;",
			"```",
			"---",
			"开场白",
			"- 第一项",
			"---",
			"结尾",
			"简单键: 值",
		].join("\n"),
	);
});

// ---- 转义边界（URL / 行内代码 / 多冒号） ----

test("转义：URL 内容项第一个冒号转义（防 format 拆键值）", () => {
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["https://a.com", "ok"]}}').pd,
		"K:\n- https:-//a.com\n- ok",
	);
});

test("转义：行内代码在前、冒号在代码后 → 只转代码外的冒号", () => {
	// 首项键形 → 内联（值含冒号精确回环）
	assert.equal(
		jsonToPdText('{"K": {"Info1": ["用 `x` 说: 好"]}}').pd,
		"K: 用 `x` 说: 好",
	);
	// 非首项 → 转义代码外的第一个冒号
	assert.equal(
		jsonToPdText('{"K": {"child": "c", "Info1": ["用 `x` 说: 好"]}}').pd,
		"K:\n- child: c\n- 用 `x` 说:- 好",
	);
});

test("转义：多冒号内容项非首项只转第一个", () => {
	assert.equal(
		jsonToPdText('{"K": {"child": "c", "Info1": ["a: b c: d"]}}').pd,
		"K:\n- child: c\n- a:- b c: d",
	);
});
