# promptdown 1.0 正式版规划

> 状态：**1.0 就绪**（基线 v0.10.0，2026-09）
> 1.0 定义：**公共 API 冻结 + 核心功能完整 + 经真实使用验证**。1.0 之后不再接受破坏性变更（语法、寻址、API 签名均冻结；破坏性变更一律 2.0）。

## 1. 基线（v0.10.0 已完成）

| 领域 | 状态 |
| --- | --- |
| 语法规范（docs/SPEC.md） | ✅ 唯一事实来源；寻址/引用（%N、循环擦除）/行内代码/空行/转义规则定型 |
| 共享语义核心 `@andares/pdfoundation` | ✅ 零运行时依赖（ESM/CJS + d.ts + `sideEffects:false`），主包与 pdeditor 共同依赖，语义单一来源 |
| CLI ×3（pdtransform / pdcompile / pdformat） | ✅ stdout 输出、错误 stderr、统一 `--version` |
| VSCode 扩展 | ✅ 双向转换 + 编译 + 高亮 + 格式化 + 回车/Tab 行为 + nls 本地化 |
| Web 输入框组件 `@andares/pdeditor` | ✅ headless（Yace）；双入口（全量 / pd-only ~17 kB）；re-export 语义 API |
| 多端规则同步 | ✅ TextMate / tree-sitter 与 TS 核心对齐；降级项已标注（README「多端一致性」） |
| 性能基准 | ✅ perf/bench.ts（2099 行/150 段全链路 ~10 ms 级、GC 后零增长） |
| 测试 | ✅ **257 用例**（foundation 178 + 主包 26 + editor 53） |
| 发布工程 | ✅ `release-all`（foundation 同号绑定 + vsce）/ `release-editor`；CHANGELOG.dev.md 归档纪律 |

**架构（三层，依赖单向）**：

```text
@andares/promptdown   VSCode 扩展 + CLI 壳（bin ×3；不导出 JS 语义 API）
        └─► @andares/pdfoundation   语义核心（零依赖；版本与主包同号，release-all 一起发）
@andares/pdeditor     headless 输入框组件（独立版本线）
        └─► @andares/pdfoundation   （dependencies，自动安装）
```

## 2. API 冻结清单（1.0.0 生效，冻结后不可删除/改名/改签名）

### 2.1 `@andares/pdfoundation`（语义 API）

| 导出 | 说明 |
| --- | --- |
| `pdToJsonText(text, selector?, fileStem?)` | pd → 格式化 JSON；解析错误/多段未指定段时抛错 |
| `jsonToPdText(text)` | JSON → pd（宽容模式，`{pd, warnings}`） |
| `compilePdText(text, selector?, fileStem?)` / `compileSections(sections, selector?)` | 编译（引用内联展开 + format） |
| `format(text)` | 统一格式化（键值规范化 + 缩进修正 + 空行规则 + 豁免保护） |
| `detectTransformKind(fileName, text)` | 输入类型识别（扩展名 → 内容探针） |
| `splitSections / nameSections / hasSectionMarkers / findSection / resolveSection / selectSection / escapeSectionName` | 段切分与寻址（`Section` 接口冻结） |
| `expand / expandSectionText` | 引用展开 |
| `detectPdIntent / isPdMarkerLine / mayBeCommentLine` | pd 意图检测 |
| `isPdFileName / isJsonFileName / sectionNames / splitInlineCode` | 工具函数 |
| `JsonToPdResult`（类型） | `jsonToPdText` 返回类型 |

### 2.2 `@andares/pdeditor`（组件 API）

| 导出 | 说明 |
| --- | --- |
| `createPdEditor(el, options?)` | headless 编辑器工厂（两入口行为一致；`PdEditorInstance`：setValue/getValue/setLanguage/destroy/textarea） |
| `EditorLang / PdEditorInstance / PdEditorOptions`（类型） | `options` 键冻结（value/language/lineNumbers/styles/indentUnit/highlight/onValueChange） |
| `format / jsonToPdText / pdToJsonText`（re-export pdfoundation） | 语义 API 同源 |
| `highlightPd`（仅 `/pd` 入口） | 自研 pd 高亮 tokenizer（pd → 带 class 的 HTML） |

### 2.3 `@andares/promptdown`（主包：CLI 行为 + 扩展贡献点）

| 面 | 冻结内容 |
| --- | --- |
| CLI ×3 | 命令名（pdtransform / pdcompile / pdformat）、参数语义、stdout/stderr 分工、退出码、`--version` |
| VSCode 贡献点 | 命令 `pdtransform`/`pdcompile`、语言 id `promptdown`（`.pd`）、配置 `promptdown.autoDetect`、格式化程序、Tab/回车编辑行为、图标主题 |
| 说明 | 主包 **不导出 JS 语义 API**（在 pdfoundation）；`hx-install`/`wsl-install` 为辅助脚本，不在冻结面 |

### 2.4 语法规范冻结（SPEC.md）

- 行类型（键值/序列/段标记/分隔线/围栏/行内代码/引用）
- section 寻址：`%N` 序号 / 字符模式 / `%` 转义 / 隐式段文件主名 / 先到先得
- 引用：`:名称` 与 `:%序号`、编译期内联展开、循环静默擦除、嵌套上限 32
- 格式化：空行规则（含连续空行合并）、`:-` 转义、转义/豁免矩阵
- 1.0 后 SPEC 只做非破坏性补充

## 3. 全端对齐验收（1.0 发布前逐项复核）

| # | 端 | 验收项 | 状态 |
| --- | --- | --- | --- |
| 1 | TS 核心（pdfoundation） | 语义唯一事实；257 测试全绿；性能基准达标 | ✅ |
| 2 | CLI ×3 | 输出/错误/退出码/--version 行为与 SPEC 一致 | ✅ |
| 3 | VSCode（TextMate） | 高亮与 lexer 语义一致；显示层差异已文档化 | ✅ |
| 4 | Helix（tree-sitter） | 行内代码豁免已同步；降级项标注（README 多端一致性） | ✅ |
| 5 | Web 组件（pdeditor） | 与核心共用同一 npm 语义导出；两入口 API 一致；0.4.1 依赖修正（dependencies） | ✅ |
| 6 | 文档 | SPEC ↔ 实现 ↔ README/TUTORIAL/skill×2/AGENTS 一致；差异表随改动同步 | ✅ |

## 4. 1.0 发布清单

- [x] API 冻结清单成文（本文件第 2 节）
- [x] README 增「API 与稳定性」章节（三包冻结面 + 语义化版本承诺）；package.json description 更新（2026-09 已完成）
- [ ] 全端对齐逐项复核（第 3 节，发布前最后一遍）
- [ ] `pnpm release-all major` → v1.0.0（npm + VSCode 同版本；GitHub Release 附冻结声明）
- [ ] 发布后复核：CHANGELOG 归档（自动）、README 安装命令、npm 三包可安装性

## 5. 明确不阻塞 1.0 的未实现项

**成品输入框 UI 层**（headless 核心已就绪，UI 层不急）：

- 格式切换器（复用 `detectTransformKind`）、Ctrl+G 放大模式（大输入切专用编辑器）、历史记录（localStorage/IndexedDB）、工具栏（格式化 / 转 JSON / 段大纲）

**其他未来方向**：主题系统（CSS 变量）、移动端/触屏适配、协同（Yjs）

**可选增强**（不阻塞）：tree-sitter 剩余降级项重估（等 Helix 反馈）、大文件压测（5 万行级；当前基准 2099 行）

## 6. 历史决策记录（与初版规划的差异）

| 初版计划 | 实际落地 | 原因 |
| --- | --- | --- |
| 0.9.0 做 CodeMirror 6 + custom element `<pd-editor>` + React/Vue/Svelte 封装 | Yace headless 组件 `@andares/pdeditor`（无 UI chrome，BYO 高亮） | 体积/控制复杂度；"精确优先"定位（纯代码文本，高亮服务精确）；排除富文本引擎 |
| 包名 `@promptdown/editor` | `@andares/pdeditor` | 统一 `@andares` scoped 命名 |
| 组件"复用主包 npm 导出" | 抽 `@andares/pdfoundation` 共享语义包 | 主包 main=extension.js（拉 vscode）不可浏览器 import；共享包实现语义单一来源 + 组件 external 引用零漂移 |
| 段大纲 / 格式切换器 / React 封装 | 未做（归入第 5 节未来方向） | UI 层复杂度高，不影响核心能力 |

## 7. 风险与决策点

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 1.0 后发现寻址/引用/格式化设计缺陷 | 冻结后只能 2.0 | 0.9.0 → 0.10.0 稳定期约 3 周已发现并修复多个真实缺陷（untitled 激活、引用展开代码块、依赖语义）；缺陷按破坏性分级 |
| 三层包版本一致性 | 依赖脱节（曾发生：peer ^0.1.0 指向不存在的版本） | foundation 与主包**同号绑定**（release-all 自动同步）；pdeditor 依赖归位 dependencies；发布前置校验成文 |
| 维护带宽（一人维护多端） | 更新滞后 | 降级标注机制（差异表）已建立；Helix 侧接受显示层降级 |

## 8. 发布节奏

```text
v0.10.0（已发布 2026-09-07）
   └─► v1.0.0（API 冻结声明 + 全端对齐复核 + release-all major）
```
