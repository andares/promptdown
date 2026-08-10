# prompt-down 项目初始化规划

## Context

设计极简标记语言 **prompt-down（.pd）**：

- 极简，兼容 markdown 风格（不追求完全规范）
- 支持转 JSON（单向，不做反转）
- VSCode 语法高亮（TextMate grammar，不需要 LSP）
- 转 JSON 的 CLI 工具（`pd2json`，支持嵌套引用内联展开）
- pi skill 便于 AI 理解语法（skill/ 独立目录）
- 技术栈：TypeScript 单包（VSCode 扩展 + CLI 合一个 package.json）
- 仓库已建：`/home/andares/repos/andares/prompt-down`（git 已初始化，MIT，remote 已配）

## 语法设计（用户确认版）

### 行类型

| 行形态 | 语义 |
| --- | --- |
| `//!pd <name>` | **pd 段标记**（可省略）：① 提示词中混输时声明 pd 内容开始；② 多段 pd 混排实现引用。纯 pd 文本/文件可省略 |
| `---` | 分隔线：块边界，指针移回根（清掉之前所有父级） |
| `key: content?` | 裸键值：**在根对象创建键**（隐式回根），不找爸爸，自己独立成父亲 |
| `- key: content?` | 带 `-` 键值：**按缩进找爸爸**创建子键；找不到爸爸又是顶层 → 自己进 Subject |
| `- content` | 带 `-` 内容行：按缩进找爸爸，压入该块的 Info 数组 |
| `content` | 裸内容行：按缩进找爸爸，压入该块的 Info 数组 |
| ` :refname ` | 引用标记（`:` 第二种用法）：前后必须带空格，冒号后紧贴引用名；**编译期内联展开** |

### 核心规则（用户确认）

- **键值内容判定（折叠规则）**：
  - 键内只有**单条字串**（同行内容、无续行、无子键）→ 直接 `"key": "value"`（字符串叶子值）
  - 键内是**多行字串**或**键值/字串混排** → 套对象：`"key": { "Info1": [...] }`
  - **Info 的存在意义**：解决多行内容、键值与字串混排时，把无 key 字串记在对象里的问题
- **无 key 的内容 → 默认键 `Info`，值是数组**：连续无 key 的行压入同一数组；中间出现键值分隔 → 编号自增（Info1 → Info2），顺序保持
- **顶层匿名对象根叫 `Subject`**（后面跟数字 Subject1/Subject2...）：无 key 内容出现在根层级（尤其 `---` 清掉父级后忘写顶层键值）时，内容进 Subject。区分：Subject = 顶层匿名对象容器；Info = 块内匿名数组
- **裸键值行不找爸爸**（根下不带 `-` → 自己独立成父亲）；**带 `-` 的键值行死活找爸爸**（嵌套），找不到爸爸又是顶层 → 自己进 Subject
- **内容行（裸或带 `-`）都按缩进找爸爸**
- **顶层 `-` 不允许缩进**：缩进算语法错误，可不解析（忽略该行）
- 没有 `---` 时，空多少行都不算数，内容继续找爸爸
- **`-` 可选**：单层结构下裸行 = 数组项；`-` 在多层嵌套时明确层级
- **可以无限嵌套**（靠 `- key:` 链）
- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**
- 数组元素一行一个，无逗号分隔

### 缩进规则（用户确认）

**所有行（除裸键值行）严格按缩进找爸爸**：

```pd
- name:
- words
```

`- words` 与 `- name:` 缩进相同 → 平级 → words 进 name 的爸爸的 Info；**要进入 name 必须更深缩进**。

块栈模型（爸爸 = 栈中最近一个基准缩进 < 行缩进的块；同时弹出基准 ≥ 行缩进的块）：

- 根对象：基准缩进 -∞
- 裸键值块（`key:` 创建）：基准 -∞
- Subject 块（顶层匿名对象，键名 SubjectN）：基准 -∞
- 带 `-` 块（`- key:` 创建）：基准 = 行缩进

### 引用规则（用户确认）

- `:refname` 引用的内容若是**没有任何语法标记的纯文字** → 内联嵌入，**保留前后空格**（inline 形态）
- 引用的内容**带语法标记**（键值/序列等）→ 引用独立成行；该段按 `:refname` 位置前后断开，全部转为 `-` 开头的序列项
- **编译期内联展开**：不存在中间占位；v1 实现展开。被引用段内容作为块内联进引用位置，前后文本断开为独立 `-` 项
- **解析必须指定段名**：`//!pd a2` 里的 `:a1` 引用 a1 段；CLI 需指定转换哪个段

### 用户范例（测试基准）

范例 1（平级键 + 嵌套 + 无 key 归 Info + 单条折叠）：

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

范例 2（无 key 开头 → Subject）：

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

范例 3（`---` 清父级 + Subject 续 + 裸键值独立成父亲 + 带-键值进 Subject）：

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

范例 4（多段 + 引用内联展开）：

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

## 目录结构（定稿）

```
prompt-down/
├── package.json                  # VSCode 扩展 manifest + bin: pd2json + 类型/入口
├── tsconfig.json
├── .vscodeignore                 # vsce 打包排除
├── .gitignore
├── README.md                     # 简介 + 用法
├── CHANGELOG.md
├── LICENSE                       # ✅ 已有
├── docs/
│   ├── SPEC.md                   # ⭐ 语法规范 —— 唯一事实来源（CLI/skill/grammar 都引用它）
│   └── DESIGN.md                 # 设计决策记录（为什么不用 toon/plf/LangGPT/cpf）
├── syntaxes/
│   └── pd.tmLanguage.json        # TextMate 语法（VSCode 高亮）
├── language-configuration.json   # 括号匹配等
├── src/
│   ├── cli.ts                    # pd2json CLI 入口（读文件 → 选段 → 展开引用 → parser → JSON）
│   └── parser/
│       ├── lexer.ts              # 行分类（段标记/分隔线/键值/带-键值/内容/引用）
│       ├── parser.ts             # 块栈构建（缩进找爸爸 + Subject + 顶层-缩进报错）
│       ├── expand.ts             # 引用内联展开（编译期，按段名）
│       ├── toJson.ts             # 树 → JSON（含单条折叠规则）
│       └── types.ts              # 行类型/AST 定义
├── skill/
│   └── SKILL.md                  # pi skill：//!pd 触发，语法速查 + 引用 SPEC.md
└── test/
    ├── fixtures/
    │   ├── flat.pd               # 范例 1
    │   ├── anon.pd               # 范例 2
    │   ├── subject.pd            # 范例 3
    │   ├── ref.pd                # 范例 4（多段 + 引用）
    │   └── err.pd                # 顶层 - 缩进语法错误样例（忽略）
    └── parser.test.ts            # node:test，断言转 JSON 结果
```

设计要点：

- **纯声明式 VSCode 扩展**：高亮只需 package.json 的 `contributes.languages` + `contributes.grammars` + grammar 文件，**不需要 extension.ts**（零 JS，最简）。后续要加命令面板再补
- **CLI**：`"bin": { "pd2json": "./dist/cli.js" }`，tsc 编译到 dist/，dev 用 tsx；参数：`pd2json <file.pd> <段名>`（单段可省略段名）
- **skill 独立目录**：随项目发布；SKILL.md 引用 `../docs/SPEC.md` 作为详细规范，避免内容重复
- **docs/SPEC.md 是唯一事实来源**：语法规则只写一份，grammar/parser/skill 都照它实现
- **测试**：node:test（Node 内置，零依赖）+ fixtures

## 实施步骤

- [ ] 1. pnpm init + tsconfig（strict）+ .gitignore + .vscodeignore
- [ ] 2. 写 docs/SPEC.md（语法规范，含全部用户范例）
- [ ] 3. 实现 parser：types.ts → lexer.ts（行分类）→ parser.ts（块栈/缩进找爸爸/Subject/顶层-缩进忽略）→ toJson.ts（单条折叠）
- [ ] 4. 实现 expand.ts（引用内联展开，段名定位）
- [ ] 5. 实现 cli.ts（文件 + 段名参数），注册 bin
- [ ] 6. test/fixtures + parser.test.ts，跑通范例 1/2/3/4
- [ ] 7. 写 syntaxes/pd.tmLanguage.json（高亮：段标记/分隔线/键值/`-` 项/引用/Info 键）
- [ ] 8. language-configuration.json + package.json contributes 注册 .pd 语言
- [ ] 9. 写 skill/SKILL.md（//!pd 触发词 + 语法速查 + 引用 SPEC.md）
- [ ] 10. 打包 .vsix（vsce）+ pnpm 发布准备
- [ ] 11. 初始提交

## 验证

- `pd2json test/fixtures/flat.pd <段名>` 输出与范例 1 JSON 一致；anon.pd 与范例 2 一致；subject.pd 与范例 3 一致；ref.pd 与范例 4 一致
- `pnpm test` 通过（node:test）
- VSCode 打开 .pd 文件：高亮正常、无红线（无 LSP 无拼写干扰）
- pi 中提问含 `//!pd` 时加载 skill 正确解析

## 待确认

1. 折叠规则的精确判定：`key: value` 同行有内容 + 之后无续行内容/无子键 → 字符串；否则套对象。边界情况：`key: value` 后跟空行再 EOF，算单条还是多条？（默认：单条）
2. 顶层 `-` 缩进的语法错误：v1 忽略该行，后续是否要报错/警告输出
3. 范例 4 展开时 `some: words` 的归属已由用户确认（`"some": "words"`），但展开过程中缩进调整的通用算法实现时需对照用户范例验证
