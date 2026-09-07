# 开发期变更日志（CHANGELOG.dev.md）

> ⚠️ 临时文件：记录**尚未发布**的变更。版本号在 release-all 发布时才确定，
> 因此开发期一律写在这里，不预写进 CHANGELOG.md。
> `pnpm release-all` 会在 bump 版本后自动把本文件条目归档为
> CHANGELOG.md 顶部的新版本章节（`## vX.Y.Z`），并删除本文件。
> 若某次发布无任何条目（纯依赖/内部提交），归档步骤会提示跳过。

- **CLI 通用参数 `--version`**：`pdtransform` / `pdcompile` / `pdformat` 统一调用共享模块（`src/version.ts`）输出当前版本号（读包根 package.json），与其他参数共存时优先生效
- **变更日志方案重构**：开发期变更记录到根目录临时文件 `CHANGELOG.dev.md`（不预写版本号——版本号发布时才确定，禁止在 CHANGELOG.md 预写 "X.Y.Z (未发布)" 章节）；`release-all` 新增第 5 步 CHANGELOG 归档：dev 条目自动归档为 CHANGELOG.md 顶部 `## vX.Y.Z` 章节并删除 dev 文件（无条目提示跳过；缺 `# Changelog` 锚点中止）；约定写入 AGENTS.md；release-editor 不处理变更日志
