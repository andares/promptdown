# Changelog — @andares/pdeditor

> 独立版本线（与主包 `@andares/promptdown` / 语义核心 `@andares/pdfoundation` 的版本号无关）。
> **开发期条目写 `packages/editor/CHANGELOG.dev.md`**（不写版本号，条目格式 `- **要点**：说明`）；
> `pnpm release-editor` 在 bump 后自动归档为本文件最新章节（`## X.Y.Z (YYYY-MM-DD)`，最新在前）并删除 dev 文件。
> 本文件自 0.4.1 起按发布纪律维护；更早版本依据 npm 元数据与 git 历史补录。

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
