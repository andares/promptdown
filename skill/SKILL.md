---
name: promptdown
description: >-
  promptdown（pd）极简标记语言解析。当用户输入中出现 //!pd 标记时，
  其后的内容全部按 pd 格式解析；也用于处理 .pd 文件、pd 语法高亮与转 JSON。
  触发词：//!pd、promptdown、.pd 文件、pd 格式、pd2json。
  核心语法：key: value 键值（单条折叠为字符串）、无 key 内容归 Info 数组、
  顶层匿名根 Subject、带 - 序列按缩进嵌套、--- 分隔线、:refname 引用内联展开、
  //!pd <name> 段标记。
---

# promptdown 语法速查

极简标记语言：兼容 markdown 风格，可单向转 JSON。**完整规范见 `../docs/SPEC.md`（唯一事实来源），本文件与 SPEC 冲突时以 SPEC 为准。**

## 行类型

| 行 | 语义 |
| --- | --- |
| `//!pd <name>` | 段标记（可省略）：声明 pd 内容开始；多段混排实现引用。无段标记的纯 pd 文本/文件可省略 |
| `---` | 分隔线：块边界，指针回根（清掉之前所有父级） |
| `key:` | 裸键值：在根对象创建键，不找爸爸，独立成父亲 |
| `- key:` | 带 `-` 键值：按缩进找爸爸；找不到爸爸又是顶层 → 进 Subject |
| `- content` / `content` | 内容行：按缩进找爸爸，压入该块 Info 数组 |
| ` :refname ` | 引用：前后必须带空格，冒号后紧贴引用名；编译期内联展开 |

## 核心规则

1. **折叠**：键内只有单条字串（同行内容、无续行、无子键）→ `"key": "value"`；多行或混排 → `"key": { "Info1": [...] }`
2. **Info**：无 key 内容 → 默认键 `Info`（数组）；连续无 key 压入同一数组；中间出现键值分隔 → 编号自增（Info1 → Info2）；编号每层独立
3. **Subject**：顶层匿名对象根叫 Subject1/Subject2...（无 key 内容出现在根层级时）
4. **找爸爸**：裸键值行不找爸爸（根创建）；带 `-` 键值行与内容行按缩进找爸爸；`- words` 与 `- name:` 同缩进 → 平级
5. **空行无视**：没有 `---` 时空多少行都继续找爸爸
6. **语法错误**：顶层 `-` 不允许缩进
7. 内联 markdown（`**粗体**`、`` `代码` ``）保留原文
8. 数组元素一行一个，无逗号分隔

## 引用（编译期内联展开）

- 引用的内容是纯文字 → 内联嵌入（保留前后空格）：`msg: say :base please`
- 引用的内容带语法标记 → 独立成行：按 `:refname` 位置前后断开全部转为 `-` 项，被引用段作为块嵌入
- 解析必须指定段名（多段时）

## 范例

```pd
name1:
- some
- name2: other words
- name3:
  - more
  - words
words
```

```json
{
  "name1": {
    "Info1": ["some"],
    "name2": "other words",
    "name3": { "Info1": ["more", "words"] },
    "Info2": ["words"]
  }
}
```

## 转 JSON

- CLI：`pd2json <file.pd> [段名]`
- 规则：解析行类型 → 块栈按缩进找爸爸 → 键值单条折叠 → Info/Subject 编号 → 引用内联展开
