# @andares/pdeditor：headless 提示词输入框组件（基于 Yace）

## Context

promptdown 已有完整工具链（CLI/VSCode/语法规范），缺最后一块拼图：**Web 输入框组件**——在各平台框架（React/Vue/Svelte/原生）中嵌入一个支持多格式（pd/md/xml/json/yaml）的提示词输入框。

**方向已定（用户决策）**：

- **headless 优先**：纯背后控制，只渲染输入框内容；外观/样式由外部框架定义。**语言切换也是 API 行为**（`setLanguage()`），不做 UI 切换器。成品输入框（放大模式/历史/格式切换器）是未来可选方向，界面设计更复杂，往后放
- **不是富文本**：pd 是纯代码文本，要的是**精确**而非样式——高亮服务于精确；编辑模型必须保留原始文本
- **选型定 Yace**（<https://github.com/petersolopov/yace）：~2KB> gzipped、零依赖、插件化、BYO highlighter、框架无关
- 排除富文本引擎（ProseMirror/Lexical/Slate——文档模型破坏 pd 精确文本）；排除 CM6/Monaco 作为输入框本体（过重）
- **组件包名：`@andares/pdeditor`**（独立 workspace 包，独立版本）
- **同步做一个极简测试页**：headless 组件没有 UI，必须有 demo 页面引用库验证预览效果，否则没法看

## Approach

### 组件包：packages/editor/（发布 @andares/pdeditor）

- **高亮核心**：基于 Yace（BYO highlighter 接口）
  - pd 高亮函数：复用 `src/parser/lexer.ts` 的 token 逻辑 → 转成 yace 的 `highlight(source) → HTML`
  - md/xml/json/yaml 高亮：Prism.js（markup/markdown/json/yaml 语法现成）
  - 语言切换 = API（`setLanguage(lang)`），headless 无 UI
- **语义复用**：直接 import `@andares/promptdown` 核心（纯 TS 零 Node 依赖，已验证可移植）——`format()` / `pdToJsonText` / `jsonToPdText` / `splitSections` / `detectTransformKind`
- **headless API**（无 UI 假设）：

  ```ts
  createPdEditor(el: HTMLElement, opts: {
    value: string;
    language: "pd" | "md" | "xml" | "json" | "yaml";
    onValueChange?: (v: string) => void;
    highlight?: (source: string, lang: string) => string; // BYO 覆盖
  }): {
    setValue(v: string): void;
    getValue(): string;
    setLanguage(lang: Lang): void;   // 语言切换 = API
    destroy(): void;
  }
  ```

- **插件**（yace 插件化）：Tab 缩进（移植 `src/tab.ts` 的 listItemWsRun 逻辑）、`-` 续行、历史（可选，未来）

### 构建/发布（组件包）

- **vite lib mode**：产出 ESM/CJS/UMD + d.ts（浏览器生态标准）
- workspace：`pnpm-workspace.yaml` 加 `packages/*`；`@andares/promptdown` 作为 dependency
- 独立版本管理，独立 release 流程

### 主包发布流程重构（用户要求的清理）

- **问题**：`scripts/publish.mjs` 发布时临时 `pkg.name = "@andares/promptdown"` → publish → 恢复 `promptdown`（vsce 需要非 scoped 名，扩展 ID = `publisher.name`）
- **方案**：用 npm 官方 `publishConfig.name` 机制——package.json 保持 `name: "promptdown"`（vsce 硬约束：scoped 名会生成非法扩展 ID），加 `"publishConfig": { "name": "@andares/promptdown", "access": "public" }`——npm/pnpm publish 自动用 publishConfig.name，**删掉 publish.mjs 的临时改名逻辑**（两处 `pkg.name = ...`）
- **验证**：`pnpm publish --dry-run` 显示发布名为 @andares/promptdown；vsce package 仍产出 `promptdown-<ver>.vsix`

## Files to modify

- `packages/editor/`（新）：组件源码 + vite 构建 + 包配置
  - `packages/editor/src/index.ts`：headless API（createPdEditor）
  - `packages/editor/src/pd-highlight.ts`：pd tokenizer → HTML（复用 lexer 语义）
  - `packages/editor/src/highlighters.ts`：Prism 集成（md/xml/json/yaml）
  - `packages/editor/src/plugins/`：tab 缩进、`-` 续行
  - `packages/editor/demo/`：极简测试页（index.html + main.ts，验证高亮/切换/IME）
  - `packages/editor/vite.config.ts`、`package.json`、`tsconfig.json`
- `pnpm-workspace.yaml`：加 `packages/*`
- `package.json`：加 `publishConfig`（主包）；`scripts/publish.mjs`：删临时改名逻辑
- `AGENTS.md`：加"组件开发计划"章节（当前目标 + 未来方向）
- 测试：`packages/editor/test/*.test.ts`（vitest + jsdom）

## Reuse

- `src/parser/lexer.ts`：lexLine/splitInlineCode/matchKeyValue——pd 高亮 tokenizer 的语义来源
- `src/parser/expand.ts`：splitSections——段大纲（未来）
- `src/pdtransform.ts`：detectTransformKind/pdToJsonText——语言检测与转换
- `src/format.ts`：format()——格式化命令（未来）
- `src/tab.ts`：listItemWsRun——Tab 缩进插件
- `syntaxes/pd.tmLanguage.json`：高亮 scope/正则参考（TextMate 正则已验证）

## Steps

- [ ] 探索 Yace API（BYO highlighter、插件接口）并做 spike：pd 高亮函数接到 Yace 上，验证 IME/滚动/对齐（demo 页）
- [ ] 搭建 workspace：packages/editor/ + vite lib 配置 + vitest 环境
- [ ] 实现 headless API（createPdEditor + setLanguage/setValue/getValue/destroy）
- [ ] 实现 pd 高亮 tokenizer（复用 lexer 语义）
- [ ] 接入 Prism：md/xml/json/yaml 高亮
- [ ] 插件：Tab 缩进（移植 tab.ts）、`-` 续行
- [ ] demo 测试页（极简预览 + 语言切换 + 中文 IME 验证）
- [ ] 测试（vitest + jsdom）：高亮输出/语言切换/值回调
- [ ] 主包发布流程重构：publishConfig.name + 删 publish.mjs 临时改名（验证 dry-run）
- [ ] 文档 + AGENTS.md 计划章节 + 发布准备

## Verification

- demo 页：pd 输入 → 高亮正确（键值/序列/段标记/引用/行内代码/围栏）；md/xml/json/yaml 切换正常；中文 IME 无脱同步
- 组件测试：高亮函数输出、setLanguage/setValue 行为、onValueChange
- 主包：`pnpm publish --dry-run` 发布名为 @andares/promptdown；vsce package 正常
- 门禁：主包 typecheck + test；组件包 typecheck + vitest + vite build

## 未来可选方向（写入 AGENTS.md，不在本期实现）

- 成品输入框（headless 核心 + UI 层）：格式切换器（复用 detectTransformKind）、Ctrl+G 放大模式（大输入切 CM6 专用编辑器）、历史记录（localStorage/IndexedDB）、工具栏（格式化/转 JSON/段大纲）
- 主题系统（CSS 变量，参考 synesthesia）
- 移动端/触屏适配
- 协同（Yjs）
