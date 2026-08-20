<div align="center">

<img src="icons/pd-icon.png" alt="promptdown icon" width="128" height="128">

# promptdown

**极简标记语言 · 兼容 Markdown 风格 · PD ↔ JSON 双向转换**

为提示词（prompt）组织而生的 `.pd` 格式 —— 只用一个 `:` 和一个 `-`，
就能写出结构清晰、AI 友好、可直接转 JSON 的文本。

[![npm version](https://img.shields.io/npm/v/@andares/promptdown?color=4fc08d&label=npm)](https://www.npmjs.com/package/@andares/promptdown)
[![license](https://img.shields.io/npm/l/@andares/promptdown?color=orange)](./LICENSE)
[![vscode](https://img.shields.io/badge/VSCode-Extension-007acc?logo=visualstudiocode&logoColor=white)](https://github.com/andares/promptdown)
[![AI skill](https://img.shields.io/badge/AI-Skill-8b5cf6)](./skill/promptdown/SKILL.md)

</div>

---

## ✨ 特性

| | |
| --- | --- |
| 🪶 **极简** | 核心符号只有 `:`（键值/引用）与 `-`（序列标记），没有标题层级、没有复杂语法 |
| 📦 **PD ↔ JSON 双向** | `pdtransform` CLI 自动识别输入类型：`.pd` → JSON，`.json` → pd；输出稳定、可机读 |
| 🔗 **嵌套引用** | `:refname` / `:%序号` 编译期内联展开（序号引用匿名段也可用），多段 `//!pd <name>` 混排复用 |
| 🧩 **多段编译** | `pdcompile` 跨文件合并段列表：段名 / `%序号` 寻址，隐式段 = 文件主名，引用跨文件展开编译为单份完整 pd |
| 🎨 **VSCode 高亮** | TextMate grammar 纯声明式扩展，**无需 LSP**，零红线 |
| ✨ **自动格式化** | CLI `pdformat` + VSCode 格式化程序，首个/后续冒号判定与顶层缩进一键规范 |
| ⚡ **编辑器命令** | 命令面板搜 `pdtransform`（`PD格式转换`）/ `pdcompile`（`PD编译分段`）：pd→JSON 新开 Untitled、JSON→pd 直接变更当前文档（可撤销）、编译新开 Untitled；`-` 列表自动续行，序列项行按 Tab 整体缩进 |
| 🔍 **自动检测** | untitled / 纯文本出现 `//!pd` 段标记即自动切换 pd 语言（高亮 + 格式化，可关） |
| 🤖 **AI 友好** | 内置 skill：看到 `//!pd` 即按 pd 格式解析 |
| 📝 **兼容 Markdown** | 内联 `**粗体**`、`` `代码` `` 等保留原文，混输无压力 |

## ❓ Why

提示词越写越多，如何"自然地结构化"就成了问题——简单场景用自然语言就够了，复杂需求（开发、媒体制作）下，现成方案都不太合适：

- **JSON/YAML 等数据格式**：为机器精确表意而设计，书写繁琐或过于严格
- **Markdown**：偏"格式化"（加粗、链接，目标是渲染成 HTML），不是单纯表意
- **新兴 AI 格式**：要么基于 YAML 堆特性显得厚重，要么为省 token 牺牲可读性

`promptdown` 追求符合人类与 AI 直觉的表达：无论 `.pd` 原文还是转换后的 JSON，AI 无需额外提示即可理解。同时语法对空行与书写极度宽容，不会因结构要求过严而在 VSCode 里到处冒黄线。

## 🚀 快速开始

```bash
npm install -g @andares/promptdown
pdtransform your-prompt.pd        # pd → JSON（输出到 stdout）
pdtransform output.json           # JSON → pd（输出到 stdout）
```

写一个 `.pd` 文件——比如给影视 AI 描述一段分镜：

```pd
分镜:
- 镜头1:
  - 场景: 雨夜小巷
  - 运镜: 低角度跟拍
  - 时长: 5秒
- 镜头2:
  - 场景: 天台
  - 运镜: 无人机环绕
  - 时长: 8秒
```

转出来的 JSON：

```json
{
  "分镜": {
    "镜头1": {
      "场景": "雨夜小巷",
      "运镜": "低角度跟拍",
      "时长": "5秒"
    },
    "镜头2": {
      "场景": "天台",
      "运镜": "无人机环绕",
      "时长": "8秒"
    }
  }
}
```

## 📖 语法一览

### 行类型

| 写法 | 含义 |
| --- | --- |
| `//!pd <name>` | 段标记（可省略）：声明 pd 内容开始；多段混排实现引用 |
| `---` | 分隔线：块边界，指针回根 |
| `key: content` | 裸键值：严格判定（键名不以空白结尾、冒号后跟空白或行尾；`a : b`、`a:b` 均不是键值）；仅第一个冒号分隔键和值；在根创建键，独立成父亲 |
| `- key: content` | 带 `-` 键值：同裸键值的严格判定；按缩进找爸爸嵌套 |
| `- content` / `content` | 内容行：按缩进找爸爸，压入 Info 数组 |
| ` :refname ` / ` :%序号 ` | 引用：前后必须带空格，编译期内联展开（`%N` 序号引用匿名段也可用） |
| `:-` / `：-` | 普通冒号标记：整行不识别键值，标记本身也不是引用 |

### 核心规则

| 规则 | 说明 |
| --- | --- |
| 🔑 **折叠** | 键内只有单条字串 → `"key": "value"`；多行或混排 → `{ "Info1": [...] }` |
| `:` **首个分隔** | 严格键值判定：键名不以空白结尾、冒号后跟空白或行尾；每行仅第一个冒号有键值语义；后续冒号不会再开启键值，` :ref ` 仍按引用规则处理 |
| `:-` **普通冒号** | 行内出现 `:-` 或 `：-` 时整行不含键值，但不影响后续引用 |
| 📋 **Info** | 无 key 内容归默认键 `Info`（数组），编号每层独立（Info1/Info2...） |
| 🗂️ **Subject** | 顶层无 key 内容进匿名根 `Subject1/Subject2...` |
| 🌳 **找爸爸** | 裸键值行不找爸爸；带 `-` 行与内容行按缩进找爸爸；同缩进 → 平级 |
| 🔄 **引用** | 纯文字内联嵌入（保留前后空格）；带语法标记则断开转 `-` 项 + 块嵌入 |
| ⏳ **空行无视** | 没有 `---` 时空多少行都继续找爸爸 |

> 📚 完整语法规范见 [`docs/SPEC.md`](docs/SPEC.md)（唯一事实来源）
> 🍳 新手教程见 [`docs/TUTORIAL.md`](docs/TUTORIAL.md)（从纯文本到引用/代码块，喂饭式示例，复制即跑）

## 🔗 引用示例（多段混排）

以编程任务为例：`任务` 段引用 `基础设定` 段（引用名支持中文），编译期自动内联展开——

```pd
//!pd 基础设定
- 语言: TypeScript
- 目标: 实现一个带防抖的搜索框

//!pd 任务
任务:
- 技术栈: React
- 参考: :基础设定
- 额外要求: 防抖延迟 300ms
```

```bash
pdtransform file.pd 任务
```

```json
{
  "任务": {
    "技术栈": "React",
    "参考": {
      "语言": "TypeScript",
      "目标": "实现一个带防抖的搜索框"
    },
    "额外要求": "防抖延迟 300ms"
  }
}
```

## 🖥️ CLI

```bash
pdtransform <file> [段名|%序号]
pdcompile <section> <file>[...<file>]
```

自动识别输入类型（扩展名 → 内容探针）：

- **`.pd` 文件 → JSON**：单段文件可省略段名；多段必须指定——按**段名**，或 **1-based 序号**（`pdtransform file.pd %2` = 第 2 块，未命名段也能选；裸数字 `2` 是字符模式，匹配命名 `2` 的段）；段不存在/序号越界会报错退出
- **`.json` 文件 → pd**：JSON 必须是对象；不符合 pd 规则的条目——非文本标量（数字/布尔/null）自动转文本，结构性不符合的丢弃，**逐条黄字警告**（stderr）；内容项（仅 InfoN 数组内字串）第一个冒号转义（半角 `:` → `:-`、全角 `：` → `：-`，冒号后字符保留，行内代码内不转），转回后仍是文本不是键值
- **其他扩展名**按内容探测：含 `//!pd` 段标记 → pd；可解析为 JSON → json；都不是 → 报错退出
- 引用（`:refname` 或 `:%序号`）在编译期内联展开，支持嵌套与循环检测；``` 围栏内与 `` ` `` 行内代码内的引用不展开
- 语法错误（如顶层 `-` 缩进）会带行号报错退出

**`pdcompile` 多段编译为单份完整 pd**（section 必填，输出到 stdout）：多个文件按"文件参数顺序 → 文件内段顺序"合并为全局段列表（从 1 编号）；无 `//!pd` 的文件 = 隐式段，段名 = 文件主名；`%` 开头的段名转义为 `%%`；跨文件重名段先到先得（后出现的同名段自动匿名，只能 `%序号` 访问）：

```bash
pdcompile %1 first.pd                    # 编译第 1 个 section
pdcompile first first.pd second.pd       # 编译 first.pd 的隐式段（段名 = 文件主名）
pdcompile 任务 tasks.pd base.pd          # 按段名选段，跨文件引用内联展开
```

JSON → pd 的**空行规则**（已移入 format，pdformat / VSCode 格式化 / compile 输出统一生效）：默认无空行；唯一例外——顶层**带子域键值**后跟下一个顶层条目（键值/文本块/代码块）时，中间空一行：

```pd
name1:
- value1
- value2

name2:
- value3
- value4
```

> 文本块/代码块（匿名 Subject）前还会输出 `---` 分隔线——pd 语法里只有 `---` 能把内容从上一个键块中分离出来。

### ✨ 格式化

```bash
pdformat <file.pd> [-w|--write]   # 默认输出 stdout；-w 写回原文件
```

格式化规则：

- 首个全角冒号不论两侧空格均格式化为 `:`；无空格的首个半角冒号补右侧空格
- 后续全角冒号仅在左侧有空格时转半角；后续半角冒号不处理
- `:-` / `：-` 所在行不识别键值，但后续引用仍有效
- 顶层 `-` 缩进自动修正
- 行尾空白清理
- `` ` `` 行内代码整体原样（内部冒号/全角冒号不处理）；``` 围栏内完全原样
- 空行规则：顶层带子域键值后跟下一个顶层条目时空一行（多段按段应用，幂等）

## 🎨 VSCode 扩展

安装 `.vsix` 后，`.pd` 文件自动获得完整的编辑体验——**纯声明式扩展（无 LSP）**，不会产生任何诊断红线：

```bash
code --install-extension promptdown-<version>.vsix
```

### 🏷️ 语法高亮

- 🏷️ 段标记 `//!pd <name>`
- ➖ 分隔线 `---`
- 🔑 键值 `key:` / `- key:` 与 Info 默认键
- 🔗 引用 `:refname` / `:%序号` / `:%序号`
- 📋 `-` 序列项

扩展详情页、扩展列表和 `.pd` 语言均使用 `icons/pd-icon.png` 作为品牌图标。

### 🔍 `//!pd` 自动检测

在 **untitled / 未知扩展名等弱语法文件**（默认 plaintext，如 `.txt`、`.log`）中，出现 `//!pd` 段标记行时自动切换为 promptdown 语言，立即获得高亮与格式化：

- **打开时**：扫描前 50 行，发现段标记即切换
- **输入时**：逐键分层预筛（行首 `//` 特征 → 段标记判定，几乎零开销），敲完 `//!pd` 即刻切换
- 每文档每会话最多切换一次；**不覆盖用户显式选择的语言**（`.md`/`.js` 等有自身语法的文件不受影响）
- 可用设置关闭：`"promptdown.autoDetect": false`

### ✨ 格式化程序

扩展内置文档格式化程序（`DocumentFormattingEditProvider`）：

- 按默认格式化热键 **`Shift+Alt+F`**（或你自定义的 keybinding）即可格式化当前 `.pd` 文件
- 也可右键 → **Format Document**
- 想保存时自动格式化：设置 `"editor.formatOnSave": true`（或仅对 pd：`"[promptdown]": { "editor.formatOnSave": true }`）

格式化规则与 `pdformat` CLI 一致（首个键值冒号、后续全角冒号、`:-` 普通冒号标记、顶层 `-` 缩进、行尾空白、行内代码/围栏保护、空行规则）。

### 📦 pdtransform 命令

`Ctrl+Shift+P` 打开命令面板，输入 **`pdtransform`**（面板条目：`PD格式转换` / 灰色注释 `PD Transform to/from JSON`）回车，即可把当前文档在 PD 与 JSON 之间转换：

> 🌐 **多语言**：命令名走 VSCode nls 本地化（`package.nls*.json`）——中文界面显示 `PD格式转换` + 灰色英文注释；英文界面自动显示 `PD Transform to/from JSON`。

- **PD 文档 → JSON**：多段文件（多个 `//!pd` 段）会弹出 QuickPick 让你选择要转换的段，显示 `%序号 <段名>`（如 `%1 aaa`、`%2`；无 `//!pd` 的文档 = 隐式段，显示 `%1 <文件名>`）；**单段文档不弹窗直接转换**；结果**新开 untitled JSON 文件**（侧边预览打开），原文档不动
- **JSON 文档 → pd**：**直接变更当前文档**（WorkspaceEdit 可撤销，保存由你控制），语言自动切到 promptdown 获得正确高亮；不符合规则的条目（标量转文本 / 结构性丢弃）在转换结束后弹一次错误消息窗逐条提示
- 文档类型判断宽松：语言为 promptdown/json、文件名 `.pd`/`.json`、或内容探针（`//!pd` 段标记 / 可解析 JSON）均可
- 无活动编辑器 / 无法识别类型 / 语法错误都会用 VSCode 通知提示，无副作用
- **无默认快捷键**（命令面板搜 `pdtransform` 即可调出）

### 🧩 pdcompile 命令

命令面板搜 **`pdcompile`**（`PD编译分段` / 英文 `PD Compile Sections`）——把当前文档的选中段**编译为单份完整 pd**（引用内联展开 + 统一 format）：

- 多段文档弹出 QuickPick 选段（显示规则与 pdtransform 相同：`%序号 <段名>`）
- 单段文档不弹窗直接编译；无 `//!pd` 的文档段名 = 文件主名
- 结果新开 untitled pd 文件（不覆盖原文）

### ⌨️ 列表续行

在 `-` 序列条目行尾按回车，新行自动补上 `-`（保持原行缩进，与 Markdown 习惯一致）：

| 场景 | 行为 |
| --- | --- |
| `- foo` 行尾回车 | 新行补 `-`，缩进与原行一致 |
| `- key: value` 行尾回车 | 同上（带-键值也是序列条目） |
| `-`（空条目）回车 | 退出列表（新行无标记） |
| `---`（分隔线）回车 | 不续行 |

> 生效条件：`editor.autoIndent` 开启（默认开启）。

### ⇥ Tab 缩进

在序列项行（行首为 `-`，`-` 后可有可无空白，可带缩进）按 **Tab**，整行向右缩进一个 tab —— 快速调整嵌套层级（pd 的缩进即父子关系），而不是在光标处插入 tab 字符。缩进时若 `-` 后不是单个半角空格（裸 `-`、`-   x` 等多空白），会自动规范化为 `- x`：

| 场景 | Tab 行为 |
| --- | --- |
| 光标在 `- foo`、裸 `-`、`-   x` 等序列项行上 | 整行右缩进一个 tab，并把 `-` 后规范化为单个半角空格 |
| 其他行（键值行、内容行等） | 还原默认：插入 tab（遵循 `editor.insertSpaces` / `editor.indentSize` / `editor.tabSize`） |
| 跨行多选 | 所有选中行整体右缩进（序列项行同样规范化） |
| 补全列表 / 行内联补全（ghost text）/ 片段导航中 | 不拦截，保持 VSCode 原生行为 |

### 📁 文件图标

扩展附带图标主题 **promptdown Icons**（继承 Seti，只替换 `.pd` 图标）：

- `Ctrl+Shift+P` → **File Icon Theme** → 选 `promptdown Icons`
- 或 settings.json 里设 `"workbench.iconTheme": "promptdown-icons"`

> 注：VSCode 不允许扩展强制覆盖用户的图标主题，需要在设置里手动切换一次。
> 因为继承了 Seti，其他文件图标保持不变，只有 `.pd` 显示 `icons/pd-icon.png`。扩展也提供了语言图标回退，但最终是否展示仍由当前文件图标主题决定；选择 `promptdown Icons` 可确保资源管理器与编辑器标签页显示专属图标。

### ⚙️ 设置一览

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `promptdown.autoDetect` | `true` | 弱语法文件（untitled/txt/log 等）中出现 `//!pd` 段标记时，自动切换文档语言为 promptdown（获得高亮与格式化） |

## 🦀 Helix 支持

helix 语法高亮只用 tree-sitter（无 TextMate），项目附带一份 `tree-sitter-promptdown/` grammar（**helix / neovim 通用**）。

**一键安装**（repo 或 npm 全局包均可）：

```bash
pnpm hx-install        # repo 内：检测 hx → 写 languages.toml → 装 queries → hx --grammar build
hx-install             # npm 全局包（@andares/promptdown）自带此命令，用法相同
```

脚本自动：检测 hx → 写/合并 `~/.config/helix/languages.toml`（`source.path` 指向**当前来源**的 grammar——repo 装链 repo，npm 装链包内，来源切换自动更新）→ 拷 queries → `hx --grammar build`。验证：`hx --health promptdown`。

**高亮配色**（`queries/highlights.scm`，值不设色与正文同色）：

| 元素 | 颜色 |
| --- | --- |
| 键（含冒号） | 紫 `@keyword` |
| 引用 `:refname` | 橙 `@constant`（value 内拆分，URL 不误拆） |
| `---` 分隔线 / `-` 前缀 | 蓝 `@operator` |
| `//!pd` 段标记 | 标题色粗体 `@markup.heading` |
| ```` ``` ```` 围栏行 | 代码块底色 `@markup.raw.block` |
| 值 / 普通文本 | 默认前景（无 capture） |

**缩进继承**（`queries/indents.scm`）：列表项内回车自动缩进到内容列（`- 模块A:` 后新行列 2，嵌套逐级继承）；顶层键值行回车回列 0。helix 无法自动补 `-` 前缀（平台限制，换行只输出空白），回车后手动输入即可。

**写提示词工作流**（config.toml 建议，脚本会输出）：

```toml
[editor]
clipboard-provider = "wayland"   # WSLg 默认已自动检测；显式声明更稳

[keys.normal]
F5 = ":set-language promptdown"   # 一键激活 pd 语言（空 buffer / 未存盘场景）
F6 = ["select_all", "yank"]       # 一键全选复制全文到系统剪贴板（WSLg → Windows 剪贴板）
```

- `hx 提示词.pd`：`.pd` 后缀自动识别，直接写（不 `:w` 即不落盘）
- 写完 `F6` 复制全文 → Windows 端 `Ctrl+V` 粘贴（WSLg 与系统剪贴板同步，已实测）
- 手动安装：`languages.toml` 加 `[[language]]` + `[[grammar]]`（`source.path` 指向 grammar 目录）→ `hx --grammar build` → 拷 `queries/*.scm` 到 `~/.config/helix/runtime/queries/promptdown/`（⚠️ grammar 配置不管 queries，必须手动拷）
- 限制：围栏只高亮 ```` ``` ```` 行本身（围栏内行按普通文本）；键名不能以 `-` 开头（`-` 前缀归列表项）

## 🧩 多端一致性（语法规则同步状态）

pd 语法在四端实现，语义以 **TS 核心**（`packages/pdfoundation/` 共享包 @andares/pdfoundation，解析/转换/格式化的唯一事实）为准，其余各端为**显示层**：

| 规则 | TS 核心 | VSCode（TextMate） | Helix（tree-sitter） |
| --- | --- | --- | --- |
| 严格键值判定（`a : b`/`a:b` 非键值） | ✅ | ✅ | ✅ |
| `:-`/`：-` 整行转义 | ✅ | ✅ | ✅ |
| 行内代码内冒号不参与键值/转义判定 | ✅ | ✅ | ✅（0.8 同步） |
| 行内代码整体漂色 | ✅（语义） | ✅ | ⚠️ 仅语义豁免，无漂色 |
| `:-` 行内代码内不触发整行转义 | ✅ | ⚠️ 保守（代码内 `:-` 也整行不识别键值） | ✅ |
| SECTION 整行锚定（`//!pd 名 字` 非段标记） | ✅ | ✅ | ⚠️ 降级：前缀匹配 |
| SEPARATOR 整行锚定（`---x` 非分隔线） | ✅ | ✅ | ⚠️ 降级：`---` 前缀即匹配 |
| 引用前后空格约束（` :name `） | ✅ | ✅ | ⚠️ 降级：tree-sitter 正则无 lookahead |
| 未闭合反引号按普通字符 | ✅ | ✅ | ⚠️ 降级：近似处理 |
| ``` 围栏内原样/不切段/不展开引用 | ✅ | ✅（高亮） | ✅ |
| 寻址/引用解析（%N、%% 转义、先到先得） | ✅ | —（无寻址概念） | — |

**降级说明**（tree-sitter 外部 scanner 无法回退已消费字符 + 正则引擎不支持 lookahead，严格判定的失败分支会导致行内容丢失/误判；宽容前缀匹配在显示层更安全）：

- `//!pd 名 字`、`---x` 在 Helix 中会按段标记/分隔线高亮（TS 核心按普通文本解析）
- `` ` `` 行内代码在 Helix 中无整体漂色（仅内部冒号不参与键值判定）；`` `a: b` `` 这类行内代码内冒号不会误高亮为键值
- 未闭合反引号行（`` `a: b ``）在 Helix 按非键值显示（TS 核心按普通文本，可作键名）

> 以上差异均为**高亮显示层**差异，不影响解析/转换结果（语义以 TS 核心为准）。

## 🤖 AI Skill

两个 skill，按需安装：

**① 解析版 [`skill/promptdown/SKILL.md`](skill/promptdown/SKILL.md)** —— 提供 pd 语法知识（读）：

- 输入中出现 **`//!pd`** → 后续内容按 pd 格式解析
- 处理 `.pd` 文件、转 JSON、语法纠错

**② 作者版 [`skill/pd-author/SKILL.md`](skill/pd-author/SKILL.md)** —— 教 AI **写**结构化提示词（默认 pd，不用 markdown）：

- 结构化 prompt（角色/目标/约束/步骤/示例…）→ 默认输出 pd 结构，键替代 `#` 标题
- 含通用 prompt 骨架模板、领域范例、作者视角避坑清单
- 触发词：写提示词、组织提示词、提示词结构、用 pd 写

安装到 AI 的 skill 目录即可（如 `~/.pi/agent/skills/` 或项目 `.agents/skills/`，`pd-author/` 目录整体复制为独立 skill）。

## 🛠️ 开发

- **Web 输入框组件**：[packages/editor/](https://github.com/andares/promptdown/tree/master/packages/editor)（npm 包 @andares/pdeditor）——headless 提示词输入框（pd/md/xml/json/yaml 高亮），基于 Yace；含 pd-only 精简入口（`@andares/pdeditor/pd`，不含 Prism，~17 kB），该入口另 re-export 共享语义包（`format` / `jsonToPdText` / `pdToJsonText` / `highlightPd`）；`pnpm --filter @andares/pdeditor dev` 起 demo
- **性能基准**：`pnpm perf`（10 副本样本 2099 行/150 段全链路基准）；`pnpm perf:gen [份数]` 重新生成样本（`perf/generated/` 不入库）
- **1.0 路线**：见 [`docs/ROADMAP-1.0.md`](docs/ROADMAP-1.0.md)（API 冻结声明 + 全端对齐确认 + 发布节奏）

```bash
pnpm install
pnpm typecheck   # 类型检查
pnpm test        # node:test（壳层 + CLI 集成；语义规则 173 用例在 packages/pdfoundation）
pnpm build       # tsc → dist/
pnpm package     # 以 --no-dependencies 打包 .vsix
```

### 发布

```bash
pnpm release-all patch     # 唯一主包发布入口：foundation（同号）→ npm → push/tag → vsce
pnpm release-editor patch  # editor 独立发布（纯 npm）
pnpm release-all patch -- --dry-run  # 预览计划（不改动任何东西；旧 release 命令已移除）
pnpm tag-current          # 给当前版本打本地 tag vX.Y.Z（已存在则跳过，不推送）
```

- `pnpm release-all`（唯一主包入口）：sync（未提交改动自动 commit、本地领先自动 push、本地落后中止、没有则跳过）→ 门禁（含 foundation）→ 主包 + foundation **同号 bump** → `git commit + tag vX.Y.Z` → **先发 foundation 再发主包**（`workspace:^` 发布时自动改写为实际版本）→ push 分支 + tags → 创建 GitHub Release → vsce package + publish。npm 失败中止，vsce 失败降级为只发 npm。
- `pnpm release` / `pnpm release-foundation` 已移除（并入 release-all）：误敲会被拦截提示。

## 📁 项目结构

```text
promptdown/
├── icons/pd-icon.png   # 扩展品牌图标 + .pd 文件图标
├── src/cli.ts           # pdtransform CLI（自动识别 pd/json 双向转换）
├── src/compile-cli.ts   # pdcompile CLI（多段编译为单份完整 pd）
├── src/format-cli.ts    # pdformat CLI（格式化）
├── src/extension.ts     # VSCode 扩展（命令 + 格式化 + Tab）
├── packages/pdfoundation/  # ⭐ 共享语义核心 @andares/pdfoundation（parser/format/转换，主包与 pdeditor 共用）
├── packages/editor/     # headless 输入框组件 @andares/pdeditor
├── syntaxes/            # TextMate 语法高亮
├── docs/SPEC.md         # ⭐ 语法规范（唯一事实来源）
├── skill/               # AI skill（容器：promptdown/ 解析版 + pd-author/ 作者版）
└── test/fixtures/       # 测试基准（含全部用户范例）
```

## 📄 License

[MIT](./LICENSE)
