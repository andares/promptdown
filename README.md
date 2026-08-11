<div align="center">

# 📄 promptdown

**极简标记语言 · 兼容 Markdown 风格 · 一键转 JSON**

为提示词（prompt）组织而生的 `.pd` 格式 —— 只用一个 `:` 和一个 `-`，
就能写出结构清晰、AI 友好、可直接转 JSON 的文本。

[![npm version](https://img.shields.io/npm/v/@andares/promptdown?color=4fc08d&label=npm)](https://www.npmjs.com/package/@andares/promptdown)
[![license](https://img.shields.io/npm/l/@andares/promptdown?color=orange)](./LICENSE)
[![vscode](https://img.shields.io/badge/VSCode-Extension-007acc?logo=visualstudiocode&logoColor=white)](https://github.com/andares/promptdown)
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
| ✨ **自动格式化** | CLI `pdformat` + VSCode 格式化程序，全角冒号/引用空格/顶层缩进一键规范 |
| 🤖 **AI 友好** | 内置 skill：看到 `//!pd` 即按 pd 格式解析 |
| 📝 **兼容 Markdown** | 内联 `**粗体**`、`` `代码` `` 等保留原文，混输无压力 |

## 🚀 快速开始

```bash
pnpm add -g @andares/promptdown
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

### ✨ 格式化

```bash
pdformat <file.pd> [-w|--write]   # 默认输出 stdout；-w 写回原文件
```

格式化规则：

- 全角冒号 `：` → 半角 `:`（键值/引用位置）
- 键值冒号后恰好一个空格（`key: value`）
- 引用 ` :refname ` 前后各一个空格
- 顶层 `-` 缩进自动修正
- 行尾空白清理

## 🎨 VSCode 扩展

安装 `.vsix` 后，`.pd` 文件自动获得高亮：

- 🏷️ 段标记 `//!pd <name>`
- ➖ 分隔线 `---`
- 🔑 键值 `key:` / `- key:` 与 Info 默认键
- 🔗 引用 `:refname`
- 📋 `-` 序列项

纯声明式扩展（无 LSP），不会产生任何诊断红线。

```bash
code --install-extension promptdown-<version>.vsix
```

### ✨ 格式化程序（已注册）

扩展内置文档格式化程序（`DocumentFormattingEditProvider`）：

- 按默认格式化热键 **`Shift+Alt+F`**（或你自定义的 keybinding）即可格式化当前 `.pd` 文件
- 也可右键 → **Format Document**
- 想保存时自动格式化：设置 `"editor.formatOnSave": true`（或仅对 pd：`"[promptdown]": { "editor.formatOnSave": true }`）

格式化规则与 `pdformat` CLI 一致（全角冒号→半角、键值冒号后单空格、引用前后空格、顶层 `-` 缩进修正、行尾空白）。

### 📁 文件图标

扩展附带图标主题 **promptdown Icons**（继承 Seti，只替换 `.pd` 图标）：

- `Ctrl+Shift+P` → **File Icon Theme** → 选 `promptdown Icons`
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
promptdown/
├── src/parser/          # 语法引擎（lexer → parser → toJson → expand）
├── src/cli.ts           # pd2json CLI
├── syntaxes/            # TextMate 语法高亮
├── docs/SPEC.md         # ⭐ 语法规范（唯一事实来源）
├── skill/SKILL.md       # AI skill
└── test/fixtures/       # 测试基准（含全部用户范例）
```

## 📄 License

[MIT](./LICENSE)
