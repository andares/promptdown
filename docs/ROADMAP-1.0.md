# promptdown 1.0 正式版规划

> 状态：规划中（基于 v0.8.0，2026-08）
> 1.0 定义：**公共 API 冻结 + 核心功能完整 + 经真实使用验证**。1.0 之后不再接受破坏性变更（语法、寻址、API 签名均冻结）。

## 1. 当前基线（v0.8.0 已完成，不重复计入 1.0 任务）

| 领域 | 状态 |
| --- | --- |
| 语法规范（docs/SPEC.md） | ✅ 唯一事实来源；寻址规范、引用（%N/命名/循环擦除）、行内代码、空行/转义规则已定型 |
| TS 核心（parser/format/jsonToPd/expand） | ✅ 纯 TS 零 Node 依赖，可移植 Web |
| CLI（pdtransform / pdcompile / pdformat） | ✅ stdout 输出、错误 stderr |
| VSCode 扩展 | ✅ 双向转换 + 编译 + 高亮 + 格式化 + nls 本地化 |
| 多端规则同步 | ✅ tree-sitter 行内代码豁免已同步；降级项已标注（README「多端一致性」） |
| 性能基准 | ✅ perf/bench.ts（2099 行/150 段全链路 <10ms） |
| 测试 | ✅ 193 个（node:test + fixtures） |

## 2. API 冻结声明（1.0.0 发布时随 Release Notes 生效）

**npm 包 `@andares/promptdown` 的公共导出**（冻结后不可删除/改名/改签名）：

| 导出 | 说明 |
| --- | --- |
| `pdToJsonText(text, selector?, fileStem?)` | pd → 格式化 JSON 字符串；解析错误/多段未指定段时抛错 |
| `jsonToPdText(text)` | JSON → pd（含转义与丢弃警告，`{pd, warnings}`） |
| `compilePdText(text, selector?, fileStem?)` | 单文件选段编译（引用内联展开 + format） |
| `compileSections(sections, selector?)` | 编译核心（pdcompile CLI / VSCode / Web 组件共用） |
| `format(text)` | 统一格式化（键值规范化 + 缩进修正 + 空行规则 + 豁免保护） |
| `detectTransformKind(fileName, text)` | 输入类型识别（扩展名 → 内容探针） |
| `splitSections / nameSections / findSection / resolveSection / selectSection` | 段切分与寻址（`Section` 接口冻结） |
| `isPdFileName / isJsonFileName / sectionNames` | 工具函数 |
| `escapeSectionName` | 命名转义（`%` → `%%`） |

**语法规范冻结**（1.0 后 SPEC 只做非破坏性补充）：

- 行类型（键值/序列/段标记/分隔线/围栏/行内代码/引用）
- section 寻址：`%N` 序号 / 字符模式 / `%` 转义 / 隐式段文件主名 / 先到先得
- 引用：`:名称` 与 `:%序号`、编译期内联展开、循环静默擦除、嵌套上限 32
- 格式化：空行规则、`:-` 转义、转义/豁免矩阵
- 破坏性变更一律 bump 2.0（语义化版本承诺）

## 3. 全端对齐确认计划（1.0 发布前逐项验收）

| # | 端 | 验收项 | 状态 |
| --- | --- | --- | --- |
| 1 | TS 核心 | 语义唯一事实；193 测试全绿；性能基准达标 | ✅ 已完成 |
| 2 | CLI ×3 | 输出/错误/退出码行为与 SPEC 一致（已由 compile.test.ts/format-cli.test.ts 覆盖） | ✅ 已完成 |
| 3 | VSCode（TextMate） | 语法高亮与 lexer 语义一致（行内代码漂色、info 顺序、section 锚定）；`:-` 代码段内保守差异已标注 | ✅ 已完成（显示层差异已文档化） |
| 4 | Helix（tree-sitter） | 行内代码豁免已同步；SECTION/SEPARATOR 锚定、ref 空格约束为降级项 | ✅ 已完成（降级标注见 README 多端一致性） |
| 5 | Web 输入框组件 | **1.0 前新增**：与核心共用同一 npm 导出（复用 pdToJsonText/jsonToPdText/format/splitSections）；高亮层与 TextMate 同规则（行内代码/围栏/键值）；组件 API 冻结 | ⏳ 0.9.0 |
| 6 | 文档 | SPEC ↔ 实现 ↔ README/TUTORIAL/skill×2/AGENTS 四方一致；多端差异表随语法改动同步更新 | ✅ 已完成（本轮） |

## 4. 1.0 前任务清单（按序）

### 0.9.0：Web 输入框组件（最后一块拼图）

- **组件库**：`@promptdown/editor`——framework-agnostic web component（custom element `<pd-editor>`），React/Vue/Svelte 薄封装可选
- **高亮层**：基于 CodeMirror 6（npm 包分发，无需源码）；pd 语言包复用 lexer 语义（行内代码/围栏/键值/引用/段标记）；md 高亮（@codemirror/lang-markdown）与 html（lang-html）按需加载
- **编辑能力**：格式化命令（复用 `format()`）、pd↔JSON 双向（复用 `pdToJsonText`/`jsonToPdText`）、段大纲（复用 `splitSections`）、`-` 续行与 Tab 缩进（移植 tab.ts 逻辑）
- **验证**：组件 ↔ CLI ↔ VSCode 三端同一核心（同一 npm 导出）的架构确认；浏览器环境测试（无 Node API 依赖验证）
- 发布 0.9.0（npm + VSCode 同步）

### 稳定期（0.9.0 发布后 2–4 周）

- 真实使用验证：寻址规范 / 循环擦除 / 空行规则的实战反馈；发现缺陷按 P0/P1 修复（不引入破坏性变更）
- 可选增强（不阻塞 1.0）：tree-sitter 剩余降级项重估（若 helix 反馈需要）、大文件上限压测（5 万行级）、Web 组件协同（Yjs）

### 1.0.0 发布

- API 冻结声明（第 2 节内容）写入 README 与 package.json 描述
- 全端对齐确认（第 3 节逐项验收）
- `pnpm release-all major`——npm + VSCode 同版本发布，GitHub Release 附冻结声明

## 5. 风险与决策点

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 0.9 组件高亮与 TextMate 规则转写偏差 | 显示层不一致 | 高亮规则从 TextMate 正则直接转写（本会话已验证正则行为），组件测试覆盖关键 case |
| 1.0 后发现寻址/引用设计缺陷 | 冻结后只能 2.0 | 稳定期足够长；缺陷按破坏性分级（P0 语法缺陷 → 2.0 预案） |
| 维护带宽（一人维护多端） | 更新滞后 | 降级标注机制已建立（差异表），helix 侧可接受"显示层降级" |

## 6. 发布节奏总结

```text
v0.8.0（已发布）──► v0.9.0（输入框组件）──► 稳定期 2–4 周 ──► v1.0.0（冻结声明 + 全端验收）
```
