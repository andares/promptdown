<div align="center">

# 📄 prompt-down

**极简标记语言 · 兼容 Markdown 风格 · 一键转 JSON**

为提示词（prompt）组织而生的 `.pd` 格式 —— 只用一个 `:` 和一个 `-`，
就能写出结构清晰、AI 友好、可直接转 JSON 的文本。

[![npm version](https://img.shields.io/npm/v/prompt-down?color=4fc08d&label=npm)](https://www.npmjs.com/package/prompt-down)
[![license](https://img.shields.io/npm/l/prompt-down?color=orange)](./LICENSE)
[![vscode](https://img.shields.io/badge/VSCode-Extension-007acc?logo=visualstudiocode&logoColor=white)](https://github.com/andares/prompt-down)
[![AI skill](https://img.shields.io/badge/AI-Skill-8b5cf6)](./skill/SKILL.md)

</div>

---

## ✨ 特性

| | |
| --- | --- |
| 🪶 **极简** | 核心符号只有 `:`（键值/引用）与 `-`（序列标记），没有标题层级、没有复杂语法 |
| 📦 **可转 JSON** | `pd2json` CLI 单向转换，输出稳定、可机读 |
| 🔗 **嵌套引用** | `:refname` 编译期内联展开，多段 `//!pd <name>` 混排复用 |
| 🎨 **VSCode 高亮** | TextMate grammar 纯声明式扩展，**无需 LSP**，零红线 |
| 🤖 **AI 友好** | 内置 skill：看到 `//!pd` 即按 pd 格式解析 |
| 📝 **兼容 Markdown** | 内联 `**粗体**`、`` `代码` `` 等保留原文，混输无压力 |

## 🚀 快速开始

```bash
pnpm add -g prompt-down
pd2json your-prompt.pd
```

写一个 `.pd` 文件：

```pd
name1:
- some
- name2: other words
- name3:
  - more
  - words
words
```

转出来的 JSON：

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

## 📖 语法一览

### 行类型

| 写法 | 含义 |
| --- | --- |
| `//!pd <name>` | 段标记（可省略）：声明 pd 内容开始；多段混排实现引用 |
| `---` | 分隔线：块边界，指针回根 |
| `key: content` | 裸键值：在根创建键，独立成父亲 |
| `- key: content` | 带 `-` 键值：按缩进找爸爸嵌套 |
| `- content` / `content` | 内容行：按缩进找爸爸，压入 Info 数组 |
| ` :refname ` | 引用：前后必须带空格，编译期内联展开 |

### 核心规则

| 规则 | 说明 |
| --- | --- |
| 🔑 **折叠** | 键内只有单条字串 → `"key": "value"`；多行或混排 → `{ "Info1": [...] }` |
| 📋 **Info** | 无 key 内容归默认键 `Info`（数组），编号每层独立（Info1/Info2...） |
| 🗂️ **Subject** | 顶层无 key 内容进匿名根 `Subject1/Subject2...` |
| 🌳 **找爸爸** | 裸键值行不找爸爸；带 `-` 行与内容行按缩进找爸爸；同缩进 → 平级 |
| 🔄 **引用** | 纯文字内联嵌入（保留前后空格）；带语法标记则断开转 `-` 项 + 块嵌入 |
| ⏳ **空行无视** | 没有 `---` 时空多少行都继续找爸爸 |

> 📚 完整语法规范见 [`docs/SPEC.md`](docs/SPEC.md)（唯一事实来源）

## 🔗 引用示例（多段混排）

```pd
//!pd base
name1:
- some: words

//!pd main
name3: no :base more
```

```bash
pd2json file.pd main
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

## 🖥️ CLI

```bash
pd2json <file.pd> [段名]
```

- 单段文件可省略段名；多段必须指定（`//!pd <name>` 的 name）
- 引用在编译期内联展开，支持嵌套与循环检测
- 语法错误（如顶层 `-` 缩进）会带行号报错退出

## 🎨 VSCode 扩展

安装 `.vsix` 后，`.pd` 文件自动获得高亮：

- 🏷️ 段标记 `//!pd <name>`
- ➖ 分隔线 `---`
- 🔑 键值 `key:` / `- key:` 与 Info 默认键
- 🔗 引用 `:refname`
- 📋 `-` 序列项

纯声明式扩展（无 extension.ts、无 LSP），不会产生任何诊断红线。

```bash
code --install-extension prompt-down-<version>.vsix
```

### 📁 文件图标

扩展附带图标主题 **prompt-down Icons**（继承 Seti，只替换 `.pd` 图标）：

- `Ctrl+Shift+P` → **File Icon Theme** → 选 `prompt-down Icons`
- 或 settings.json 里设 `"workbench.iconTheme": "promptdown-icons"`

> 注：VSCode 不允许扩展强制覆盖用户的图标主题，需要在设置里手动切换一次。
> 因为继承了 Seti，其他文件图标保持不变，只有 `.pd` 显示专属图标。

## 🤖 AI Skill

[`skill/SKILL.md`](skill/SKILL.md) 为 AI 工具提供 pd 语法知识：

- 输入中出现 **`//!pd`** → 后续内容按 pd 格式解析
- 处理 `.pd` 文件、转 JSON、语法纠错

安装到 AI 的 skill 目录即可（如 `~/.pi/agent/skills/` 或项目 `.agents/skills/`）。

## 🛠️ 开发

```bash
pnpm install
pnpm typecheck   # 类型检查
pnpm test        # node:test（12+ 用例覆盖全部语法规则）
pnpm build       # tsc → dist/
pnpm package     # 打包 .vsix
```

### 发布

```bash
pnpm release patch   # 0.1.0 → 0.1.1（也可用 minor / major）
pnpm release patch -- --dry-run   # 先预览计划
```

一键完成：门禁检查 → 版本 bump → `git commit + tag vX.Y.Z` → `pnpm publish` → `vsce package`。
设置 `VSCODE_MARKETPLACE_TOKEN` 后还会自动上传扩展市场。

## 📁 项目结构

```
prompt-down/
├── src/parser/          # 语法引擎（lexer → parser → toJson → expand）
├── src/cli.ts           # pd2json CLI
├── syntaxes/            # TextMate 语法高亮
├── docs/SPEC.md         # ⭐ 语法规范（唯一事实来源）
├── skill/SKILL.md       # AI skill
└── test/fixtures/       # 测试基准（含全部用户范例）
```

## 📄 License

[MIT](./LICENSE)
