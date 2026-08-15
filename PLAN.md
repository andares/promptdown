# pdtransform：pd2json 升级为双向转换 CLI + VSCode 命令

## Context

pd 语法是"pd → JSON"单向设计的：`toJson` 输出稳定 JSON（折叠规则、InfoN/CodeN 编号、Subject 匿名根）。但该 JSON 结构实际是可逆的——规范 JSON（toJson 可产出的结构）可以转回 pd。计划：

1. CLI 命令 `pd2json` → **`pdtransform`**（`src/cli.ts` + `package.json` bin + VSCode 命令改名）
2. CLI 自动识别输入是 pd 还是 json，双向转换
3. VSCode 命令同步改双向：PD 文档 → 新开 Untitled JSON；JSON 文档 → 新开 Untitled PD
4. JSON→PD 输出空行规则：默认无空行；**唯一例外**：顶层的带子域键值后跟顶层内容（键值/文本块/代码块）时，中间空一行
5. VSCode 命令 UX（用户指定）：查询关键字 **`pdtransform`**、命令名 **`Promptdown格式转换`**、说明文字 **`.pd格式与JSON互相转换`**（灰色第二行）

## Approach

### 1. 类型识别（CLI + VSCode 共用纯逻辑）

优先级：**扩展名 → 内容探针**（新增 `detectTransformKind(fileName, text)`，放 `src/pdtransform.ts`）：

| 输入 | 判定 | 方向 |
| --- | --- | --- |
| `*.pd`（大小写不敏感） | 扩展名 | pd → JSON |
| `*.json`（大小写不敏感） | 扩展名 | JSON → pd |
| 其他/无扩展名 | 探针①：前 50 行含 `//!pd` 段标记（复用 `detectPdIntent`）→ pd | pd → JSON |
| 其他/无扩展名 | 探针②：trim 后 `JSON.parse` 成功 → json | JSON → pd |
| 都不匹配 | 报错退出（CLI） / showErrorMessage（VSCode） | — |

VSCode 方向判定优先看 `languageId`（promptdown / json），再走上述逻辑。扩展名优先于内容探针（.json 文件里写 pd 按 json 处理，parse 失败即报错）。

### 2. pd → JSON 方向（现有逻辑，基本不动）

`expand(text, section)` → `lex` → `parse` → `toJson` → stdout。引用 `:refname` 编译期内联展开、多段选择逻辑保留。

**段选择器升级**（新增 `resolveSection(sections, selector)`）：位置参数第二个：

- 先按**段名**精确匹配
- 匹配不上且是正整数 → **1-based 序号**（`2` = 第 2 块；裸 `//!pd` 未命名段也能按序号选）
- 序号越界/段名不存在 → 文本提示后退出（`段不存在: xxx` / `段不存在: 第 N 块`）
- 多段不指定 → 报错列出段名（现状保留）

### 3. JSON → pd 方向（新增渲染器 `src/jsonToPd.ts`）

`jsonToPdText(jsonText)` → `{ pd: string, dropped: string[] }`。根必须是对象（否则报错）；逐键按 JSON 插入序渲染，递归子块。

**值类型规则**（toJson 反向；**已确认**：非文本标量一律转文本，不丢）：

| JSON 值 | 渲染 | 说明 |
| --- | --- | --- |
| 字符串（单行、无前导空白、非空） | `key: value` | 与 toJson 折叠规则互逆 |
| number / boolean / null | `key: ${value}` 文本 | 42 → `key: 42`、true → `key: true`、null → `key: null`；**黄字警告**（类型已转文本） |
| 对象 | `key:` + 子内容（见下） | 空对象 → 裸 `key:` |
| 对象内 `InfoN`（N 连续递增、值为数组） | 内容行 | 嵌套块：`- item`；顶层 Subject：裸文本行（见 §4）；元素为标量（含数字/bool/null）→ `${v}` 文本（黄字警告）；元素为对象/数组 → 丢该元素（黄字警告） |
| 对象内 `CodeN`（N 连续递增、值为 `{lang?, body}`） | ```` ```lang```` 围栏 | 仅顶层块可挂（parser 简化规则：围栏只归属 stack[1]） |
| 数组键（命名键直接挂数组）、多行字符串、空串、前导空白字符串 | **丢弃 + 黄字警告** | 结构性不符合，见丢弃规则 |

**丢弃规则**（toJson 不可产出的结构，丢弃后仍可回环；丢弃与转文本**逐条警告**）：

- 数组作为命名键的值（只有 InfoN 的值可以是数组）
- 字符串含 `\n`、前导空白、为空串
- `InfoN` / `CodeN` 编号不连续（Info2 无 Info1）、值为空数组、元素含 `\n`
- `CodeN` 出现在深度 ≥ 2（围栏只会挂到顶层块，无法表示）
- 顶层（根）出现 `InfoN`/`CodeN`（toJson 根只输出命名键；根键 `InfoN` 会歧义，丢）
- 相邻两个 InfoN 段（中间无键值，pd 中会合并为一段）
- 内容项若解析后会变成键值/序列/段标记（如 `- foo`、`foo: bar`、`//!pd`、`---`、```` ``` ````）——裸渲染会改变结构，丢

**Subject（`SubjectN` 根键）还原**（toJson 根键含自动生成的 Subject1..N）：

- 值为对象且**全部条目是 InfoN/CodeN**（无命名子键）→ 渲染为**顶层裸内容块**（文本行 + 代码围栏），不输出 `SubjectN:` 头——还原手写 pd 的散文/代码块观感
- 含命名子键（如 `- name: value` 生成的 Subject）→ 正常渲染 `SubjectN:` + 子内容（回环安全）
- 值为字符串 → `SubjectN: value`（显式键，回环安全）
- 空对象 → 渲染 `SubjectN:`（回环安全）

### 4. 空行规则（§ 顶层渲染）

- 默认**无空行**（块内、根键之间都不空）
- **唯一例外**：当前一个**顶层条目是"带子域键值"**（渲染为 `key:` + 缩进子内容，JSON 值为对象）时，与下一个顶层条目（键值/文本块/代码块）之间空一行。语义动机：带子域键的子内容与后续顶层内容都在缩进 0，需要空行区分
- 简单键值（`key: value`）后不空；文本块/代码块作为**前一个**条目时不触发空行（严格按用户规则：触发条件只写"带子域的键值"）

### 5. 输出与警告

- CLI：JSON→pd 结果打印 stdout；**逐条黄字警告**到 stderr（ANSI `\x1b[33m`），一条处理一条：类型转文本（`count: 42 数字已转文本`）与结构性丢弃（`tags: 数组，不符合 pd 结构，已丢弃`）都警告
- 全部被丢弃 → 输出空 pd + 警告；根非对象 → 报错退出（CLI）/ showErrorMessage（VSCode）
- VSCode：转换结束后，收集的警告**合并调用一次 `showErrorMessage`**（右下角弹窗，逐条列出）；无警告不弹。pd→json 新开 Untitled JSON（现状）；json→pd 新开 Untitled PD（preview + 侧边）

### 6. VSCode 命令面板 UX（已确认需求）

面板条目 = 第一行命令名 + 第二行灰色说明。机制（查 VSCode 源码确认）：灰色第二行是 QuickPick 的 `detail`，来源于命令标题的 **alias**（本地化标题 `{value, original}` 的 `original`），且仅当 UI 语言非默认（如中文 UI）时显示；面板搜索对 label/alias 模糊匹配、对命令 id **精确**匹配。

因此（`package.json` `contributes.commands`）：

```json
{
  "command": "pdtransform",
  "title": { "value": "Promptdown格式转换", "original": ".pd格式与JSON互相转换" }
}
```

- 第一行 = `Promptdown格式转换`；第二行灰色 = `.pd格式与JSON互相转换`（中文 UI 下生效）
- 查询关键字 `pdtransform`：命令 id 取**非命名空间裸 id** `pdtransform`（而非 `promptdown.pdtransform`），保证面板输入 `pdtransform` 精确命中（id 只有精确匹配才参与过滤；label/alias 模糊匹配里没有该字符串）。偏离 VSCode id 命名规范是刻意的，注释说明
- 英文 UI 下 alias 不显示（灰色行消失），第一行仍在——可接受的降级
- `activationEvents`：`onCommand:pdtransform`（去掉旧 `onCommand:promptdown.pd2json`）
- 多段 QuickPick 条目标签加序号：`(未命名段 #2)` 等

## Files to modify

- **`src/pd2json.ts` → `src/pdtransform.ts`**：改名 + 新增 `detectTransformKind`、`resolveSection`（段名/序号）；`pdToJsonText`、`sectionNames`、`isPdFileName` 保留，新增 `isJsonFileName`
- **`src/jsonToPd.ts`**（新）：纯渲染器 `jsonToPdText`（可单测，无 vscode 依赖），含空行规则与丢弃规则
- **`src/cli.ts`**：pdtransform 双向 CLI（USAGE 更新，stderr 警告）
- **`src/extension.ts`**：命令改名 `pdtransform` + 双向 `runPdTransform`（PD→JSON / JSON→PD）；多段 QuickPick 保留并加序号；转换后合并警告弹 `showErrorMessage`
- **`package.json`**：`bin.pd2json` → `bin.pdtransform`；`contributes.commands`：id `pdtransform`、title 本地化对象 `{value: "Promptdown格式转换", original: ".pd格式与JSON互相转换"}`；`activationEvents` 更新；description 更新
- **`test/pd2json.test.ts`** → `test/pdtransform.test.ts`（改名 + 补充 resolveSection / detectTransformKind 测试）
- **`test/jsonToPd.test.ts`**（新）：渲染规则、空行规则、丢弃规则、**回环不变量**（pd → JSON → pd → JSON 结果一致）
- **`README.md` / `docs/SPEC.md`（§6 CLI + 新增 JSON→pd 章节）/ `docs/TUTORIAL.md` / `skill/promptdown/SKILL.md` / `skill/pd-author/SKILL.md` / `CHANGELOG.md` / `AGENTS.md`**：pd2json → pdtransform 全部提及 + 双向用法

## Reuse

- `expand` / `splitSections` / `selectSection`（`src/parser/expand.ts`）— 段切分与引用展开；新增序号选择只需在 `selectSection` 外套一层 name-or-index 解析
- `toJson` / `blockToJson`（`src/parser/toJson.ts`）— 反向渲染的**结构对照基准**（折叠/InfoN/CodeN 规则镜像）
- `detectPdIntent`（`src/auto-detect.ts`）— 内容探针①（前 50 行 `//!pd`）
- `lexLine` / `matchKeyValue`（`src/parser/lexer.ts`）— 渲染后内容项是否会被误解析为键值/序列的判定
- 现有 `isPdFileName`、`sectionNames`（`src/pd2json.ts`）

## Steps

- [ ] `src/jsonToPd.ts`：渲染器（值类型规则 + Subject 还原 + 空行规则 + 丢弃规则），`jsonToPdText` 返回 `{pd, dropped}`
- [ ] `src/pd2json.ts` → `src/pdtransform.ts`：改名，新增 `detectTransformKind`、`resolveSection`、`isJsonFileName`
- [ ] `src/cli.ts`：pdtransform 双向 CLI（识别 → 方向分派 → 输出；stderr 警告）
- [ ] `src/extension.ts`：命令改名 `pdtransform` + 双向 `runPdTransform` + 警告合并弹窗 + QuickPick 序号
- [ ] `package.json`：bin / command（id `pdtransform` + 本地化 title）/ activationEvents / description
- [ ] 测试：`test/jsonToPd.test.ts`（含回环不变量）+ `test/pdtransform.test.ts` 改名补充
- [ ] 文档同步：README / SPEC / TUTORIAL / skill×2 / CHANGELOG / AGENTS.md
- [ ] 门禁：`pnpm typecheck && pnpm test && pnpm build`

## Verification

- 单测：用户两个空行示例精确断言（`name1: value1\nname2: value2` 无空行；带子域键值间空一行）；回环不变量（所有 fixtures：pd → JSON → pd → 再 JSON，两次 JSON deepEqual）；丢弃规则各分支断言
- 手工 CLI：`pdtransform file.pd` / `pdtransform file.pd 段名` / `pdtransform file.pd 2`（未命名多段） / `pdtransform file.json` / `pdtransform file.txt`（探针双向）/ 越界序号报错退出
- 手工 VSCode（F5）：PD 文档执行 pdtransform → Untitled JSON；JSON 文档执行 → Untitled PD；多段 QuickPick 保留；面板输入 `pdtransform` 能搜到，条目显示两行（`Promptdown格式转换` / 灰 `.pd格式与JSON互相转换`）；带非法条目的 JSON 转换后在右下角弹警告
- `pnpm release-all` 前门禁全绿（发布脚本不需要改——bin 映射来自 package.json）
