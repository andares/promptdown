<p align="center">
  <img src="icons/pd-icon.png" alt="promptdown icon" width="96" height="96">
</p>

# Changelog

## 1.0.2 (2026-11-12)

- **修复（CI/门禁顺序）**：门禁固定为「先构建再校验」——三包的 typecheck/test 都经 foundation 的 `dist` 解析类型与运行时，全新 clone 没有 dist 时直接 typecheck 会误报 `Cannot find module '@andares/pdfoundation'`（CI 首跑即因此失败）。`build:all` 改为 foundation → 主包 → editor；CI 与 `release-all` 门禁统一为同序的 `build:all → typecheck:all → test:all`（少跑一遍重复构建）。AGENTS/README 记录该顺序。
- **CI 加固**：actions 固定到 commit SHA（checkout v7 / pnpm-action-setup v6 / setup-node v7），`permissions: contents: read` 最小权限，checkout `persist-credentials: false`（修 zizmor/Semgrep 告警：unpinned-uses / excessive-permissions / artipacked）。
- **发布链路迁移到 GitHub Actions + npm trusted publishing（OIDC）**：`pnpm release-all` / `pnpm release-editor` 不再直接写 npm registry——它们只做门禁、bump、CHANGELOG、commit、本地 tag，最后推 tag 触发 `.github/workflows/publish.yml`；CI 用 OIDC 发布（无 token、无 2FA、自动 provenance）。monorepo 按 tag 分流：`vX.Y.Z` → foundation + 主包（同号、先 foundation 后主包），`pdeditor-vX.Y.Z` → editor。CI 用 `pnpm pack` 打包（唯一会把 `workspace:^` 改写为实际版本的工具）再 `npm publish <tarball> --provenance`；发布前校验 tag == package version 且 tag 在默认分支上。本地 token 降级为读取 + 应急 staging。两个脚本新增 `--prepare-only`（停在 push 前）与 `--no-wait`（不轮询 npm）；`release-editor` 新增 commit + `pdeditor-vX.Y.Z` tag（原来不碰 git）；`tag-current` 支持 `--tag` 指定包级前缀、`--package` 指定目标包（修复 editor 误按根包版本校验）；新增对应 git 隔离回归测试。npm/provenance 未确认时发版脚本退出非零，且主包不再提前创建 GitHub Release / 发布 VSIX；editor CI 也校验目标 foundation 版本已在 npm。

## 1.0.1 (2026-10-18)

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
- **AI 集成指南（新）**：新增 skill `skill/pdeditor/SKILL.md`（`pdeditor-integration`）——给其他 agent 用的集成手册：选入口表、各框架可复制代码（React/Preact/Solid/Vue/Svelte/原生，含 React 18 自定义元素字符串化、Vue 需 `isCustomElement`）、低 UI 嵌入契约（高度/字体继承/CSS 变量主题/shadow-light）、事件与 API 速查、7 条禁止事项、集成后三步自测。随 npm 包发布（`skill/`），本机软链即可被自动发现；根 README「AI Skill」章节由两个 skill 更新为三个。
- **修复（发布内容）**：`.npmignore` 不再整体排除 `docs/`——`skill/promptdown` 与 `skill/pd-author` 里有 `../../docs/SPEC.md` 相对引用，agent 装包后靠它读唯一事实来源；改为逐文件排除内部文档（ROADMAP/TEST-CHECKLIST），SPEC/TUTORIAL 随包发布。
- **文档指针**：editor README 顶部与 AGENTS.md 组件章节补「其他 agent 集成先读 `skill/pdeditor/SKILL.md`」。

## 1.0.0 (2026-09-14)

- **API 冻结声明（1.0 起）**：README 新增「API 与稳定性」章节——三包公共面冻结（主包 = CLI 行为 + VSCode 贡献点；`@andares/pdfoundation` = 语义 API；`@andares/pdeditor` = 组件 API 与语义 re-export），`docs/SPEC.md` 语法规范冻结，破坏性变更一律 2.0
- **CLI 通用参数 `--version`**：`pdtransform` / `pdcompile` / `pdformat` 统一调用共享模块（`src/version.ts`）输出当前版本号（读包根 package.json），与其他参数共存时优先生效
- **变更日志纪律完善**：主包与 editor 统一纪律——开发期条目分别写 `CHANGELOG.dev.md` / `packages/editor/CHANGELOG.dev.md`（不预写版本号）；`release-all` / `release-editor` 在 bump 后自动归档为对应 CHANGELOG 顶部 `## X.Y.Z (YYYY-MM-DD)` 章节并删除 dev 文件（无条目提示跳过；缺 `# Changelog` 标题锚点中止）。主包 CHANGELOG 清理历史 "(未发布)" 标记并补全 0.9.0 / 0.9.1 / 0.10.0 章节；editor 建立独立 `packages/editor/CHANGELOG.md`（补录 0.1.0–0.4.1）

## 0.10.0 (2026-09-07)

- **format 连续空行合并**：格式化最后一步把 2 个及以上连续空行压缩为 1 个（围栏内原样、末尾换行不丢）；全端生效（pdformat CLI / VSCode 格式化 / pdtransform / pdcompile / pdeditor）
- **VSCode 空子项行回车清标记**：在严格 `<缩进>- `（`-` 后带空白）的行尾再按回车，清掉原行标记与缩进、新行落行首（光标 col 0），一键脱离子项层级写顶层项；裸 `-` 与其他场景完整走默认回车行为
- **`@andares/pdeditor` 0.4.1 依赖修正**：`@andares/pdfoundation` 从 peerDependencies 归位 dependencies——产物直接外部 import 的运行时依赖必须自动安装（旧 peer 声明下消费方 `npm i @andares/pdeditor` 后 import 报 ERR_MODULE_NOT_FOUND）

## 0.9.1 (2026-08-20)

- **发布流程收敛为两个入口**：`release-foundation` 并入 `release-all`——foundation 版本与主包**同号绑定**、发布顺序固定（foundation → 主包 → vsce）；发布入口限 `release-all` / `release-editor`，`release` 旧形态与误敲被拦截提示
- release 流程评审修复：失败回滚提示补 foundation 已上 npm 不可撤回说明；editor 发布前置约束成文（目标 foundation 版本须已在 npm）

## 0.9.0 (2026-08-20)

- **新增 `@andares/pdeditor`**（packages/editor/，独立 workspace 包）：headless 提示词输入框组件
  - 基于 Yace（~2KB 零依赖），pd/md/xml/json/yaml 五格式语法高亮（pd 自研 tokenizer 与主包 lexer 语义一致；其余用 Prism）
  - 双入口：`@andares/pdeditor`（全量，含 Prism）/ `@andares/pdeditor/pd`（pd-only 精简，~17 kB）——选择入口即完成裁剪
  - headless：零样式零 chrome，语言切换为 API（setLanguage），外观完全外部定义；内置 Tab 缩进 / 回车续行 / 撤销重做（防抖合并）/ 中文 IME 组合期渲染
- **抽取共享语义包 `@andares/pdfoundation`**：parser（lexer/parser/toJson/expand/types）+ format + pdtransform + jsonToPd + auto-detect 独立成零运行时依赖包（ESM/CJS + d.ts + sideEffects:false）；主包与 pdeditor 共同依赖，语义单一来源消除漂移；测试随包迁移
- **主包壳层迁移 + 扩展 esbuild 自包含打包**：CLI / VSCode 扩展改依赖共享包；`dist/extension.js` 打包为单文件（bundle，仅 external vscode）——VSIX 按 `--no-dependencies` 打包不含 node_modules，散模块 require 外部包会导致安装后扩展无法激活
- **pdeditor re-export 语义 API**：两个入口均导出 `format` / `jsonToPdText` / `pdToJsonText`（pd 入口另含自研 `highlightPd`）
- **Bug 修复**：
  - untitled 输 `//!pd` 不切语言：`onDidOpenTextDocument` / `onDidChangeTextDocument` 作为 activationEvents 在 VSCode 1.75 已失效（冷启动下扩展未激活）→ 改用 `onStartupFinished` + 激活时补扫已打开文档
  - 引用展开把代码块卷进序列项：围栏行与围栏内容改顶层原样嵌入（`CodeN.body` 不再被 `- ` 前缀污染）
- pdeditor demo 实装格式化 / JSON↔PD 转换按钮（外部框架接入语义包的参考实现）
- 新增 `docs/TEST-CHECKLIST.md`（VSCode / npm / editor / CLI / Helix 六层人工回归清单）
- `release-editor` 改为纯 npm 流程（无 git 操作，bump 留工作区）

## 0.8.0 / 0.8.1 (2026-08-16)

- 新增 **`pdcompile`** 命令（CLI + VSCode）：多段编译为单份完整 pd——跨文件合并段列表、引用内联展开、统一 format 输出
- **section 寻址规范**正式定义：`%序号`（1-based，如 `%2`）/ 字符模式（命名是数字也算字符）；`%` 开头的段名转义 `%%`；无 `//!pd` 的隐式段段名 = 文件主名；匿名段只能 `%序号` 访问；跨文件重名先到先得
- **序号引用**：` :%N ` 引用全局第 N 个段（与 `%N` 寻址同语义，匿名段也可引用）——修复 VSCode 编译 `%2` 时 `:%1` 报"段不存在"的 bug
- **寻址/引用统一解析规则**：`findSection` 唯一实现（`%N` 序号 / 字符模式匹配存储名、同名先到先得），`resolveSection`（寻址）与引用展开共用；删除 buildByName/RefContext 中间层
- **循环引用静默擦除**：引用链按实际 section 的索引 id 匹配（`:名称` 与 `:%序号` 指向同一段算同一段），命中即擦掉 `:refname` 不展开、不报错（原为抛错）
- **pdtransform 参数语法变更**：序号必须带 `%`（`pdtransform file.pd %2`）；裸数字 `2` 改走字符模式（匹配命名 `2` 的段）
- **代码块豁免修复**（两个真实 bug）：``` 围栏内 `:refname` 不再被错误展开；围栏内 `//!pd` 行不再被误切段
- 新增 **行内代码**（`` ` ``）豁免：内部冒号不参与键值/序列/`:-` 转义/引用判定；format 原样保护；TextMate 整体漂色
- **空行规则移入 format**：顶层带子域键值后空一行（多段按段应用、幂等），pdformat / VSCode 格式化 / compile / transform 输出统一生效
- **内容项转义扩展**：第一个冒号转义（半角 `:` → `:-`、全角 `：` → `：-`，冒号后字符保留，行内代码内不转），防自动 format 把内容项变键值
- VSCode 新增 `pdcompile` 命令（`PD编译分段` / 英文 `PD Compile Sections`）；QuickPick 统一显示 `%序号 <段名>`（如 `%1 aaa`）；单段文档不弹窗直接转换
- VSCode 转换行为分方向：pd→JSON 新开 Untitled（原文档不动）；JSON→pd 直接变更当前文档（可撤销、语言自动切 promptdown）；pdcompile 新开 Untitled
- 多端规则同步：tree-sitter 补齐行内代码豁免（内部冒号/`:-` 不参与键值判定）；SECTION/SEPARATOR 整行锚定与 ref 空格约束等无法实施项降级标注（README「多端一致性」章节 + SPEC/skill 注明）
- 性能基准：`pnpm perf`（perf/bench.ts）——10 副本样本（2099 行/150 段）全链路 <10ms（format 最重 ~9.4ms）；`pnpm perf:gen` 重新生成样本
- 1.0 规划：docs/ROADMAP-1.0.md（API 冻结声明、全端对齐确认计划、0.9 输入框组件 → 稳定期 → 1.0 节奏）

## 0.7.0 (2026-08-16)

- `pd2json` 升级为 **`pdtransform`**：pd ↔ JSON 双向转换（CLI + VSCode 命令）
- CLI 自动识别输入类型（扩展名 → 内容探针）；多段 pd 支持按段名或 1-based 序号选段
- JSON→pd 渲染器：标量转文本、结构性条目丢弃（黄字警告逐条）；顶层空行规则（带子域键值后空一行）
- VSCode 命令改名 `pdtransform`，面板显示 `PD格式转换` / 英文注释 `PD Transform to/from JSON`；结果一律新开 Untitled 文件，不覆盖原文

## 0.1.0 (2026-08-11)

> 0.1.1 – 0.6.2（2026-08-11 至 2026-08-16）为项目初期快速迭代期，未按版本留档；
> 主要变更（helix 支持、pd-author skill、VSCode 命令与自动检测、Tab 缩进、pdtransform 双向）见 git 历史与 0.7.0 章节。

- 初始版本：promptdown 语法 + `pd2json` CLI + VSCode 语法高亮 + AI skill
- 语法：键值折叠、Info/Subject 默认键、`-` 缩进嵌套、`---` 分隔线、`:refname` 引用内联展开、`//!pd` 段标记
