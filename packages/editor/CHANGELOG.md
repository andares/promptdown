# Changelog — @andares/pdeditor

> 独立版本线（与主包 `@andares/promptdown` / 语义核心 `@andares/pdfoundation` 的版本号无关）。
> **开发期条目写 `packages/editor/CHANGELOG.dev.md`**（不写版本号，条目格式 `- **要点**：说明`）；
> `pnpm release-editor` 在 bump 后自动归档为本文件最新章节（`## X.Y.Z (YYYY-MM-DD)`，最新在前）并删除 dev 文件。
> 本文件自 0.4.1 起按发布纪律维护；更早版本依据 npm 元数据与 git 历史补录。

## 0.5.0 (2026-10-18)

- **低 UI 引擎（替换 Yace）**：自研 overlay 引擎，移除对 yace 的依赖；不再改写挂载点内联样式，字体/字号/颜色默认 inherit，只有 `line-height:1.5` 为温和默认值。
- **任意高度**：auto-grow（pre 在文档流）与内滚模式（宿主 `height` / `max-height`）自动切换；`scrollbar-gutter: stable` 保证两层宽度一致；`scroll` 事件同步高亮层/行号层；`ResizeObserver` 处理宿主尺寸与显示切换。
- **可访问性**：覆盖层（高亮 / 行号 / placeholder）全部 `aria-hidden`；label/describedby 转发；焦点环（CSS 变量可关）；`Tab` 可配（`indent` / `focus`，indent 下 `Escape` 释放下一次 Tab）；placeholder 覆盖层（原生 placeholder 透明问题）。
- **编辑行为**：`setValue` 默认重置撤销历史（消除程序化回填后的撤销洞）；撤销栈空也吃掉 Ctrl+Z/Ctrl+Y（不落到原生撤销）；组合期屏蔽撤销；`historyLimit` / `historyDebounce` 可配；公开 `undo/redo/insertText/getSelection/setSelection`；`onValueChange` 在撤销/重做时也触发；CRLF/CR 归一为 LF。
- **新选项**：`placeholder` / `readOnly` / `disabled` / `maxLength` / `spellcheck` / `tabBehavior` / `historyLimit` / `historyDebounce` / `highlightThreshold` / `ariaLabel` / `ariaLabelledby` / `ariaDescribedby` / `dir`；`EditorLang` 允许自定义字符串（BYO highlighter）。
- **`<pd-editor>` 自定义元素**：`definePdEditor()`（SSR 安全）+ `/element` / `/element/auto` 入口；shadow 默认、`shadow="false"` light DOM；属性/property/事件（`pd-input`/`pd-change`/`pd-focus`/`pd-blur`/`pd-language-change`/`pd-ready`，均 composed）；parts（root/highlight/input/gutter/placeholder/container）；form-associated（`name`/`reset`/`disabled`）。
- **主题**：CSS 变量表（排版/光标/placeholder/行号/pd token/Prism token/焦点环/禁用）；默认 token 用 `currentColor` 派生（`color-mix`，不支持时退回透明度）；light 模式一次性注入 scoped 默认主题。
- **React 包装**：`@andares/pdeditor/react`（optional peer `react>=17`）；property 赋值（避开 React 18 自定义元素字符串化）、受控/非受控、`onValueChange`/`onReady` 事件桥接、SSR 安全（layout effect 注册）。
- **性能**：输入热路径不再读 textarea 布局（移除每键强制布局），2000 行 / 31k 字单次输入约 10–13 ms；超过 `highlightThreshold` 降级纯文本，避免超大文档卡顿。
- **一致性**：pd tokenizer 复用 foundation 的 `splitInlineCode` / `matchKeyValue` / `findKeyValueSeparator`，删除 `inline.ts` 副本；`-\t`（非 item）与 `//!pd` 严格整行对齐核心；主入口也导出 `highlightPd`（避免同时引两入口带两份核心）。
- **Demo**：重做为单文件 `demo-dist/index.html`（esbuild IIFE 内联，file:// 双击可用）；含低 UI 聊天框/侧栏/衬线嵌入、基础工具栏 UI（格式化/转换/语言/复制/清空/计数/撤销重做）、框架用法、浏览器几何自检（对齐/滚动/placeholder/aria/行号）。
- **移动端**：`inputmode` / `enterkeyhint` 转发到内部 textarea；README 补充 iOS 聚焦缩放的 `--pd-font-size` 建议。
- **测试**：53 → 82 用例（工厂低 UI 契约、元素、React、demo 冒烟、bundle-guard 覆盖五入口）；build 增加 element / element-auto / react 产物与 d.ts。

## 0.4.1 (2026-08-20)

- **依赖修正**：`@andares/pdfoundation` 从 peerDependencies 归位 **dependencies**——产物直接外部 import（vite external）的运行时依赖必须自动安装；旧声明下消费方 `npm i @andares/pdeditor` 不会带上 foundation，import 报 `ERR_MODULE_NOT_FOUND`

## 0.4.0 (2026-08-20)

- **peer 范围同步**：`@andares/pdfoundation` peer 由 `^0.1.0` 更新为 `^0.9.1`（跟随 foundation 与主包同号发布后的实际版本）

## 0.3.0 (2026-08-20)

- **语义 API re-export 首次发布**：两个入口均导出 `format` / `jsonToPdText` / `pdToJsonText`（re-export `@andares/pdfoundation`，vite external、产物零体积）；`/pd` 入口另含自研 `highlightPd`
- 声明 peer `@andares/pdfoundation: ^0.1.0`

## 0.2.1 (2026-08-20)

- 重发版本（dist 产物与 0.2.0 一致，仅版本号递增）

## 0.2.0 (2026-08-20)

- **首次发布到 npm**
- **双入口**：`@andares/pdeditor`（全量，含 Prism）/ `@andares/pdeditor/pd`（pd-only 精简，~17 kB）——选择入口即完成裁剪
- 自包含产物：yace / es-toolkit / Prism 全部内联（零运行时依赖）；`sideEffects: false`

## 0.1.0 (2026-08-19，未发布)

- 组件包首版（本地开发，未上 npm）：基于 Yace 的 headless 提示词输入框——pd/md/xml/json/yaml 高亮、Tab 缩进、回车续行、撤销重做（防抖合并）、中文 IME 组合期渲染
