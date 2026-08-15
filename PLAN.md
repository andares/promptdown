# pdcompile：多段编译指令 + section 寻址规范 + format 空行/转义重构

## Context

pdtransform 目前只能转单文件的选中段；多段文件"编译成单份完整 pd"（引用内联展开）没有独立命令。新增 `pdcompile`，同时**正式定义 section 寻址规范**（此前未定义清楚：字符/数字模式、`%` 序号前缀、隐式段文件主名），并重构两处格式化逻辑：

1. json→pd 的空行方案移入 `format()`（CLI pdformat + VSCode format 统一生效），compile/transform-to-pd 输出后统一 format，jsonToPd 移除自身空行逻辑
2. json→pd 的 `:-` 转义规则扩展（冒号 → `:-`/`：-`、保留空格），配合自动 format 防止内容项被格式化成键值
3. **代码块豁免**（新任务）：``` 围栏与 ` 行内代码内部的冒号不参与键值/引用判定——已确认 ``` 围栏内的 `:ref` 会被 expand 错误展开、围栏内 `//!pd` 行会被 splitSections 误切段（两个真实 bug）；行内代码（`` ` ``）在语法/format/lexer 各层均无豁免规则（需新增）

## Approach

### 1. section 寻址规范（核心定义）

**全局段列表**：所有输入文件的 section 按"文件参数顺序 → 文件内段顺序"依次压入一个全局列表，从 1 编号。无论文件是否有 `//!pd`、段是否命名，每个 section 都有序号。

| 规则 | 定义 |
| --- | --- |
| 字符模式（命名） | `//!pd <name>` 的 name；**命名是数字也算字符**（`//!pd 1` → 命名 `1`） |
| 数字模式（序号） | 全局 1-based 序号，**必须以 `%` 开头**：`%1` = 第 1 个 section |
| `%` 转义 | 命名第一个字符是 `%` → 存储名加倍为 `%%`（不判断是否已是 `%%`，`%%` 开头 → `%%%`）。寻址时字符模式直接与存储名比较 |
| 隐式段（无 `//!pd`） | 整个文件是一个 section，**文件主名（去扩展名）即段名**；有 `//!pd` 但未命名 → 匿名段，**不**自动赋文件名，只能序号访问 |
| 命名与序号并存 | 有命名的段既可用名字也可用 `%N` 指定；匿名段只能 `%N` |
| 跨文件重名（pdcompile） | **先到先得**：先出现的段拥有名字，后出现的同名段自动变匿名（只能 `%N` 访问）；引用 byName 同规则 |

**寻址解析**（`resolveSection(sections, selector)`）：

- selector 以 `%` 开头且其后为纯数字 → 序号模式（1-based，越界报错 `段不存在: 第 N 块（文件共 M 段）`）
- 否则 → 字符模式：匹配存储名（已转义）`name === selector`，找不到报错

**隐式段命名与 `%` 转义落在哪层**：`splitSections` 保持纯文本（不知道文件名）；新增 `nameSections(sections, fileStem)`（隐式段赋文件主名 + `%` 转义）由 CLI/VSCode 调用。

### 2. pdcompile CLI（新入口 `src/compile-cli.ts`，bin `pdcompile`）

```
pdcompile <section> <file>[...<file>]
```

- section 必填（没有 section 无从编译）
- 流程：读全部文件 → 各文件 `splitSections` + `nameSections`（文件主名）→ 全局合并（序号 + byName）→ `resolveSection` → 展开选中段（引用跨文件内联）→ `format()` → stdout
- 需要 expand 支持跨文件：重构 `expand.ts`，抽出 `expandSection(section, byName, ...)` 的跨文件入口（现有 `expand(text, target)` 保持单文件接口不变，内部复用）

### 3. format 空行规则（换行格式化）

- `format()` 增加结构化空行规则：**顶层带子域键值（`key:` 行 + 有子内容）后跟下一个顶层条目（键块/文本块/代码块）时中间空一行**；默认无空行
- 识别基于现有 `parse(lex())`（format 已在用，顶层缩进修正同款）；顶层条目按"键值行 / 内容行 / 围栏"分组；隐式段语义（`SubjectN` 自动键不算"带子域键值"，不触发）
- 幂等：已有空行不重复插入
- `src/jsonToPd.ts` 移除空行 push（保留 `---` 结构性逻辑）；`cli.ts` transform-to-pd 输出、`compile-cli.ts` 输出统一 `format()`

### 4. jsonToPd 转义规则扩展

- 现有：键形内容项第一个 `:` → `:-`（吞空格）
- 新：内容项第一个冒号转义——半角 `:` → `:-`、全角 `：` → `：-`，**冒号后字符保留**（`:` → `:-`）；覆盖 `a: b`、`a:b`、`a：b` 各 case，防自动 format 把内容项变成键值
- bare（裸 Subject）与嵌套两处统一

### 5. 代码块豁免（``` 围栏 + ` 行内代码）

**已确认的 bug（实测复现）**：

- `expandSection` 无围栏状态跟踪，``` 围栏内的 `:refname` 会被当引用展开
- `splitSections` 会把**围栏内的 `//!pd` 行**当段标记切段（围栏被破坏、Code 内容丢失）

- **``` 围栏**（各层现状/修复）：
  - splitSections（修复）：跟踪围栏状态，围栏内的 `//!pd`/`---` 等行一律归当前段，不切段
  - expand（修复）：围栏内行**不展开引用**（expandSection 跟踪围栏状态）
  - TextMate：已有 `code-block` + fenced 子语法高亮（冒号不会被当 pd 键值）✓ 确认无需改
  - format：已有 `inFence` 保护，围栏内完全原样（含行尾空白、全角冒号）✓ 确认无需改
  - lexer/parser：围栏内不参与行解析 ✓（parse 阶段已有）
  - jsonToPd：CodeN body 原样渲染 ✓；body 含 ``` 行丢弃（防围栏结构破坏，既有规则）✓
  - toJson：body 原样 ✓
- **` 行内代码**（各层新增）：
  - 定义：`` `...` `` 配对（单 backtick，markdown 风格整体理解）；**不支持换行**——未闭合 backtick 跨行即失效，后续内容当普通字符
  - lexer/键值判定：行内代码**内部**的 `:`/`：`/`-` 不参与该行键值/序列判定（找代码外的第一个冒号）；内部冒号也不参与 `:-` 整行转义判定
  - format：行内代码整体字串，内部**完全不做**任何处理（冒号/分号/空格/全角冒号转换均豁免），不会给内部 `:`/`：` 加 `-`；行尾空白清理照常（代码串外）
  - jsonToPd：内容项转义豁免行内代码内的冒号
  - TextMate：新增行内代码漂色规则（markdown 风格整体着色）；并确保行内代码内的 `:` 不高亮为键值/引用
  - expand/引用：行内代码内部的 `:xxx` 不识别为 refname

> tree-sitter（helix 侧）本次不新增行内代码规则（不在本次范围，文档注明）；``` 围栏内引用展开修复与 tree-sitter 无关（那是 expand 层）。

### 6. pdtransform 适配新寻址（CLI + VSCode）

- CLI：`pdtransform <file> [段名|%序号]`——旧 `2`（裸数字=序号）语义变更：现在 `2` 走字符模式（匹配命名 `2` 的段），序号必须 `%2`（按用户"同步重构避免遗留历史问题"直接改，文档同步）
- VSCode pdtransform QuickPick 显示规则统一：`<序号>[ <命名>]`——`%1 aaa`、`%2`、`%3 丙`；单段（隐式段或单段文件）直接转换不弹
- VSCode 隐式段（无 `//!pd` 的文档）：文件主名 = 段名，QuickPick 显示 `%1 <文件名主名>`

### 7. VSCode pdcompile 命令

- 命令 id `pdcompile`；英文名 **`PD Compile Sections`**；中文名 **`PD编译分段`**；nls 本地化（与 pdtransform 同机制）
- 行为：当前文件 → QuickPick 选段（同 pdtransform 显示规则）→ 编译（引用展开）→ format → 新开 untitled pd（preview + 侧边，不覆盖原文）
- 与 pdtransform 共用 section 解析与 QuickPick 构建逻辑

### 8. 文档全面更新

- SPEC：新增 section 寻址规范章节（字符/数字模式、`%` 转义、隐式段文件主名、命名与序号并存）；格式化章节补空行规则；JSON→pd 转义规则更新
- README / TUTORIAL / skill×2 / AGENTS / CHANGELOG：pdcompile 用法、pdtransform 新参数语法、format 空行、转义新规则
- 旧文档中 `pdtransform file.pd 2`（裸数字序号）类示例全部改为 `%2`

## Files to modify

- **`src/parser/expand.ts`**：`splitSections` 导出无标记判断 + **围栏状态跟踪（围栏内 `//!pd` 不切段）**；新增 `nameSections`（隐式段文件主名 + `%` 转义）；跨文件展开入口（byName 由调用方提供）；**围栏内引用展开豁免**（expandSection 围栏状态）
- **`src/pdtransform.ts`**：`resolveSectionName` → `resolveSection`（新寻址规范）；`pdToJsonText` 适配
- **`src/format.ts`**：空行规则（多段按段切分应用、幂等、围栏保护、与顶层缩进修正共存）
- **`src/jsonToPd.ts`**：移除空行逻辑；转义规则扩展（半角/全角、保留空格）
- **`src/compile-cli.ts`**（新）：pdcompile 入口
- **`src/cli.ts`**：pdtransform 参数新语法 + JSON→pd 输出统一 format
- **`src/extension.ts`**：pdcompile 命令 + 两端 QuickPick 显示规则统一
- **`package.json`**：bin `pdcompile`、command、activationEvents、nls 文案
- **`package.nls.json` / `package.nls.zh-cn.json`**：pdcompile 双语文案
- **测试**：`test/section.test.ts`（寻址规范）、`test/compile.test.ts`（pdcompile）、format 空行、转义新规则、QuickPick 显示逻辑；现有 resolveSectionName / format / jsonToPd 测试更新
- **文档**：SPEC / README / TUTORIAL / skill×2 / AGENTS / CHANGELOG

## Reuse

- `splitSections` / `selectSection` / `expandSection`（`src/parser/expand.ts`）——段切分与引用展开，重构出跨文件入口
- `format()`（`src/format.ts`）——空行规则加入后统一出口
- `lexLine` / `matchKeyValue`（`src/parser/lexer.ts`）——内容项转义判定
- `detectTransformKind` / `pdToJsonText`（`src/pdtransform.ts`）
- 现有 `%` 无；QuickPick 构建在 `src/extension.ts` 抽出复用

## Steps

^[x] section 寻址规范：`splitSections` 增强（围栏状态 + 无标记判断）+ `nameSections` + `resolveSection`（含测试）
^[x] expand 跨文件入口重构 + **围栏内引用展开豁免**（修复已确认 bug）
^[x] `src/compile-cli.ts`：pdcompile CLI（多文件合并 → 选段 → 展开 → format → stdout）
^[x] `src/format.ts`：空行规则（含幂等、围栏保护、与顶层缩进修正共存）
^[x] `src/jsonToPd.ts`：移除空行 + 转义规则扩展
^[x] `src/cli.ts` / `src/pdtransform.ts`：pdtransform 新参数语法 + 输出统一 format
^[x] `src/extension.ts`：pdcompile 命令 + QuickPick 显示规则统一（%1 命名）
^[x] `package.json` / nls：bin、命令、文案
^[x] 测试全套 + 现有用例更新
^[x] 文档全面更新（SPEC 寻址规范章节 + 各处语法变更）
^[x] 门禁：typecheck + test + build + vsce package

## Verification

- `pdcompile %1 first.pd` / `pdcompile first first.pd second.pd` / 多文件跨文件引用 / 越界 / `%` 命名转义 / 数字命名 / **跨文件重名先到先得**
- **围栏豁免回归**：围栏内 `:ref`、`//!pd`、`---`、行尾空白、全角冒号均原样（splitSections/expand/format 三层）
- format 空行幂等；多段文件按段应用；compile 与 transform-to-pd 输出经 format 后与旧 jsonToPd 空行行为一致
- 转义：`a: b` → `a:- b`、`a:b` → `a:-b`、`a：b` → `a：-b`，转回后仍是文本
- VSCode：pdtransform/pdcompile QuickPick 显示 `%1 aaa`；结果新开 Untitled
- 门禁全绿
