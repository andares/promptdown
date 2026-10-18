# CHANGELOG.dev.md

> 开发期变更日志：功能/修复提交时把条目追加到这里（**不写版本号**）；`pnpm release-all` 发布时自动归档为 `CHANGELOG.md` 最新章节并删除本文件。
> 条目格式：`- **要点**：说明`（可带缩进子条目）。

- **修复（语义）**：段标记严格整行——`lexLine` 与 `splitSections` 共用 `SECTION_RE`，`//!pdx` / `//!pd 名 字` 不再被 parser 当作 section 静默丢弃，按普通文本保留；`isPdMarkerLine` / `detectPdIntent` 同步为整行锚定（此前 `\b` 会误判含空格段名）。
- **新增（foundation 导出）**：`SECTION_RE` / `findKeyValueSeparator` / `hasLiteralColon` / `matchKeyValue` 从 lexer 公开导出；editor 直接复用，删除组件内重复的行内判定副本（消除 `-\t`、`//!pd` 等边界漂移）。
- **门禁**：`release-all` 的 typecheck/test/build 门禁加入 editor 包（foundation 改动会先验证 editor 的导出消费）。
- **工程**：新增 `pnpm typecheck:all` / `test:all` / `build:all`（三包聚合）与 GitHub Actions CI（三包 typecheck/test/build、单文件 demo、`npm pack --dry-run` 白名单）。
- **文档**：多端一致性表加入 pdeditor 列；根 README 新增「Web 输入框组件」章节；editor README 重写为低 UI 契约 / 五入口 / 元素 API / 主题 / 框架 / a11y / 浏览器支持；修正 `docs/ROADMAP-1.0.md` 为历史快照。
- **打包卫生**：主包 `.npmignore` 清理（`.github/`、`.pi-subagents/`、`.pi-lens.json`、`AGENTS.md`、`docs/`、`CHANGELOG.dev.md`、`icons/concepts/`、发布脚本等不再入 tarball；`npm pack` 从 61 文件 / 2.5 MB 降到 33 文件 / 372 KB）；editor/foundation 排除 sourcemap、补 LICENSE/repository/homepage，editor tarball 从 ~452 KB 降到 ~102 KB；editor `main` 指向 CJS 以兼容老工具。
- **Helix 安装脚本**：`languages.toml` 合并改为更宽容的 grammar 块匹配（不再因空白/顺序差异重复追加）、写前备份 `languages.toml.bak`、Windows 路径统一为 `/`（避免 TOML 把反斜杠当转义）。
- **仓库清理**：删除已完成的 `plans/*.md`（一次性产物，过程保留在 git 历史）；`.pi-lens.json` 禁用 Deno LSP（本仓库是 Node/pnpm 项目，避免 npm 包类型解析的误报）。
- **发布流程**：`release-editor` 在 bump 之前增加 foundation 目标版本的 npm 预检（未上 npm 直接中止，避免消费方 ETARGET 与“已 bump 未发布”的半成品）；`release-all` 计划文案与实际门禁对齐。
- **评审修复**：`<pd-editor>` 的 `maxLength` 负数/NaN 时不写入 maxlength（避免 IndexSizeError，JS property 与 maxlength 属性语义分离）。
