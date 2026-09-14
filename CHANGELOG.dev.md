# 开发期变更日志（CHANGELOG.dev.md）

> ⚠️ 临时文件：记录**尚未发布**的变更。版本号在 release-all 发布时才确定，
> 因此开发期一律写在这里，不预写进 CHANGELOG.md。
> `pnpm release-all` 会在 bump 版本后自动把本文件条目归档为
> CHANGELOG.md 顶部的新版本章节（`## X.Y.Z (YYYY-MM-DD)`），并删除本文件。
> 若某次发布无任何条目（纯依赖/内部提交），归档步骤会提示跳过。

- **API 冻结声明（1.0 起）**：README 新增「API 与稳定性」章节——三包公共面冻结（主包 = CLI 行为 + VSCode 贡献点；`@andares/pdfoundation` = 语义 API；`@andares/pdeditor` = 组件 API 与语义 re-export），`docs/SPEC.md` 语法规范冻结，破坏性变更一律 2.0
- **CLI 通用参数 `--version`**：`pdtransform` / `pdcompile` / `pdformat` 统一调用共享模块（`src/version.ts`）输出当前版本号（读包根 package.json），与其他参数共存时优先生效
- **变更日志纪律完善**：主包与 editor 统一纪律——开发期条目分别写 `CHANGELOG.dev.md` / `packages/editor/CHANGELOG.dev.md`（不预写版本号）；`release-all` / `release-editor` 在 bump 后自动归档为对应 CHANGELOG 顶部 `## X.Y.Z (YYYY-MM-DD)` 章节并删除 dev 文件（无条目提示跳过；缺 `# Changelog` 标题锚点中止）。主包 CHANGELOG 清理历史 "(未发布)" 标记并补全 0.9.0 / 0.9.1 / 0.10.0 章节；editor 建立独立 `packages/editor/CHANGELOG.md`（补录 0.1.0–0.4.1）
