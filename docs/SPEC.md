# prompt-down 语法规范（SPEC）

> 本文档是 prompt-down 语法的**唯一事实来源**。VSCode grammar、parser、skill 均以本文档为准。

## 1. 概述

prompt-down（.pd）是一种极简标记语言：

- 兼容 markdown 风格（不追求完全规范）
- 支持单向转 JSON（不支持反转）
- 核心符号只有 `:`（键值/引用）与 `-`（序列标记）
- 对换行**极不敏感**：空行基本无视，爱换几行换几行

## 2. 行类型

| 行形态 | 语义 |
| --- | --- |
| `//!pd <name>` | pd 段标记（可省略）。作用：① 提示词中混输时声明 pd 内容开始；② 多段 pd 混排实现引用。纯 pd 文本/文件可省略 |
| `---` | 分隔线：块边界，指针移回根（清掉之前所有父级） |
| `key: content?` | 裸键值：在根对象创建键（隐式回根），不找爸爸，自己独立成父亲 |
| `- key: content?` | 带 `-` 键值：按缩进找爸爸创建子键；找不到爸爸又是顶层 → 自己进 Subject |
| `- content` | 带 `-` 内容行：按缩进找爸爸，压入该块的 Info 数组 |
| `content` | 裸内容行：按缩进找爸爸，压入该块的 Info 数组 |
| ` :refname ` | 引用标记（`:` 第二种用法）：前后必须带空格，冒号后紧贴引用名；编译期内联展开 |

## 3. 核心规则

### 3.1 键值内容判定（折叠规则）

- 键内只有**单条字串**（同行内容、无续行、无子键）→ 直接 `"key": "value"`（字符串叶子值）
- 键内是**多行字串**或**键值/字串混排** → 套对象：`"key": { "Info1": [...] }`
- 边界：`key: value` 后跟空行再 EOF，仍算单条（对换行极不敏感）

**Info 的存在意义**：解决多行内容、键值与字串混排时，把无 key 字串记在对象里的问题。

### 3.2 Info 数组

- 无 key 的内容 → 默认键 `Info`，值是数组
- 连续无 key 的行压入同一数组；中间出现键值分隔 → 编号自增（Info1 → Info2），顺序保持
- **Info 编号每层独立**（name.Info1 和顶层 Info1 都是 1）

### 3.3 Subject 顶层匿名根

- 顶层匿名对象根叫 `Subject`（Subject1、Subject2...）
- 无 key 内容出现在根层级（尤其 `---` 清掉父级后忘写顶层键值）时，内容进 Subject
- 区分：**Subject** = 顶层匿名对象容器；**Info** = 块内匿名数组

### 3.4 找爸爸规则

- **裸键值行不找爸爸**：根下不带 `-` → 自己独立成父亲
- **带 `-` 的键值行死活找爸爸**（嵌套），找不到爸爸又是顶层 → 自己进 Subject
- **内容行（裸或带 `-`）都按缩进找爸爸**
- 没有 `---` 时，空多少行都不算数，内容继续找爸爸

### 3.5 缩进规则

所有行（除裸键值行）严格按缩进找爸爸：

```pd
- name:
- words
```

`- words` 与 `- name:` 缩进相同 → 平级 → words 进 name 的爸爸的 Info；要进入 name 必须更深缩进。

**块栈模型**（爸爸 = 栈中最近一个基准缩进 < 行缩进的块；同时弹出基准 ≥ 行缩进的块）：

| 块 | 基准缩进 |
| --- | --- |
| 根对象 | -∞ |
| 裸键值块（`key:` 创建） | -∞ |
| Subject 块（顶层匿名对象，SubjectN） | -∞ |
| 带 `-` 块（`- key:` 创建） | 行缩进 |

### 3.6 语法错误

- **顶层 `-` 不允许缩进**：缩进算语法错误
  - 编译工具（pd2json）：直接报错
  - format 工具：自动修正顶层缩进（去掉缩进）

### 3.7 其他

- `-` 可选：单层结构下裸行 = 数组项；`-` 在多层嵌套时明确层级
- 可以无限嵌套（靠 `- key:` 链）
- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**
- 数组元素一行一个，无逗号分隔

## 4. 引用（编译期内联展开）

- `:refname` 引用的内容若是**没有任何语法标记的纯文字** → 内联嵌入，**保留前后空格**（inline 形态）
- 引用的内容**带语法标记**（键值/序列等）→ 引用独立成行；该段按 `:refname` 位置前后断开，全部转为 `-` 开头的序列项
- **编译期内联展开**：不存在中间占位；被引用段内容作为块内联进引用位置，前后文本断开为独立 `-` 项
- **解析必须指定段名**：`//!pd a2` 里的 `:a1` 引用 a1 段；CLI 需指定转换哪个段

## 5. 范例（测试基准）

### 范例 1：平级键 + 嵌套 + 无 key 归 Info + 单条折叠

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

### 范例 2：无 key 开头 → Subject

```pd
- some
- name2: other words
- name3:
  - more
  - words
words
```

```json
{
  "Subject1": {
    "Info1": ["some"],
    "name2": "other words",
    "name3": { "Info1": ["more", "words"] },
    "Info2": ["words"]
  }
}
```

### 范例 3：`---` 清父级 + Subject 续 + 裸键值独立成父亲 + 带-键值进 Subject

```pd
no man
can
kill: me
---
nobody
- like: you
```

```json
{
  "Subject1": { "Info1": ["no man", "can"] },
  "kill": "me",
  "Subject2": { "Info1": ["nobody"], "like": "you" }
}
```

### 范例 4：多段 + 引用内联展开

```pd
//!pd a1
name1:
- some: words

//!pd a2
name3: no :a1 more
```

对 a2 段解析（指定段名 a2），展开后等价于：

```pd
name3:
- no
- name1:
  - some: words
- more
```

```json
{
  "name3": {
    "Info1": ["no"],
    "name1": { "some": "words" },
    "Info2": ["more"]
  }
}
```

## 6. CLI

```
pd2json <file.pd> [段名]
pdformat <file.pd> [-w|--write]
```

- 单段文件可省略段名
- 多段文件必须指定段名（否则不知道转哪个）
- 引用（`:refname`）在编译期内联展开

## 7. 格式化（pdformat / VSCode 格式化程序）

格式化规则（`src/format.ts` 与 VSCode `DocumentFormattingEditProvider` 共用同一实现）：

1. **全角冒号 → 半角**：键值位置（`name1：some` → `name1: some`）与引用位置（` ：a1 ` → ` :a1 `）
2. **键值冒号后恰好一个空格**：`key:value` → `key: value`；`key:  value` → `key: value`；无值保持 `key:`
3. **引用前后各一个空格**：` :refname `（行首/行尾边界除外）
4. **顶层 `-` 缩进自动修正**：去缩进（与编译工具的报错规则一致，仅格式化时修正）
5. **行尾空白清理**

识别边界：半角冒号按 lexer 语义（键名可含空格，`name1 : some` 也是键值）；
全角冒号需紧贴键名才算键值（`no ：a1` 是内容行 + 引用，不视为键值）。
