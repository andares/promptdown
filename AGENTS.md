# promptdown Project Guidelines

极简标记语言 promptdown（.pd）：兼容 markdown 风格，pd ↔ JSON 双向转换。
提供 `pdtransform` CLI、VSCode 语法高亮（TextMate grammar，无 LSP）与 AI skill。

## Package Management

**两条线，不要混淆（2025-08 起约定，勿改回）：**

- **用户层安装指导（对外文档）一律用 `npm`**：安装命令为 `npm install -g @andares/promptdown`。
  原因：pnpm 全局机制（store/hardlink 布局）是为开发期库依赖优化的，不适合管理全局 CLI 工具，
  本机全局工具安装已从 pnpm 换回 npm。改 README / docs / 教程里的安装示例时保持 npm，
  不要写成 `pnpm add -g`。
- **项目内开发工具链用 `pnpm`**（唯一包管理器）：
  - `pnpm install` / `pnpm add -D <pkg>` / `pnpm remove`
  - `pnpm pack`（发布打包；正常发版的 registry 写入由 CI 完成，本地不要跑 `pnpm publish`）
  - `pnpm dlx <pkg>` 或 `pnpm exec <pkg>` 替代 npx
  - `pnpm typecheck` / `pnpm test` / `pnpm build` 等脚本
- 不要在项目内跑 `npm install` / `npm publish` / `npx`——开发链路一律 pnpm 形式（应急 staging 例外，见 Release Flow）
- 发布入口限两个：`pnpm release-all <patch|minor|major> [--dry-run|--prepare-only|--no-wait]`（准备 + 推 `vX.Y.Z` tag；npm 发布由 CI 完成）与 `pnpm release-editor`（editor 独立版本线，tag `pdeditor-vX.Y.Z`）；`pnpm release` / `release-foundation` 已移除（保护：误敲会被拦截提示）
- 构建脚本白名单：`pnpm-workspace.yaml` 的 `allowBuilds`（esbuild、@vscode/vsce-sign；keytar 禁止）——新增依赖若被阻止构建，在此批准
- 本机 pi skill 注册：`~/.pi/agent/settings.json` 的 `skills` 数组指向 `~/.pi/agent/skills/promptdown`（软链到 npm 全局包 `@andares/promptdown` 的 `skill/` 目录，自动发现 `promptdown` 与 `pd-author` 两个 skill）。node 升级导致 fnm 版本路径变化时，只需重指该软链，不要改回 pnpm 路径。

## Commands

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` 类型检查（只主包；需 foundation 已构建） |
| `pnpm test` | node:test 跑 `test/*.test.ts`（tsx 执行；只主包） |
| `pnpm build:all` → `pnpm typecheck:all` → `pnpm test:all` | **三包门禁（顺序固定，与 CI 一致）**：先构建（foundation dist 提供类型与运行时）→ 再类型检查 → 再测试 |
| `pnpm perf` | 性能基准（10 副本样本 2099 行/150 段；`pnpm perf:gen [份数]` 重新生成，产物 `perf/generated/` 不入库） |
| `pnpm build` | tsc 编译到 `dist/` |
| `node dist/format-cli.js <file> [-w]` | 格式化 pd 文本（发布后为 `pdformat` 命令） |
| `node dist/cli.js <file> [段名\|%序号]` | 双向转换（发布后为 `pdtransform`；自动识别 pd/json） |
| `node dist/compile-cli.js <section> <file>...` | 多段编译为单份完整 pd（发布后为 `pdcompile`；跨文件合并段列表、引用内联展开、统一 format） |
| `pnpm exec vsce package` | 生成 .vsix（或 `pnpm package`） |
| `pnpm release-all <patch\|minor\|major>` | **唯一主包发布入口**：门禁 → 主包 + foundation 同号 bump → CHANGELOG → commit + tag `vX.Y.Z` → **push tag**（触发 CI）；CI 用 OIDC 先发 foundation 再发主包；`--prepare-only` 停在 push 前 |
| `pnpm release-editor <patch\|minor\|major>` | 发布组件包 `@andares/pdeditor`：工作区必须干净 → 组件门禁 → foundation 目标版本须已在 npm → bump → CHANGELOG 归档 → commit + tag `pdeditor-vX.Y.Z` → push tag（CI 发布）；`--prepare-only` 停在 push 前 |
| ~~`pnpm release`~~ / ~~`pnpm release-foundation`~~ | 已移除（并入 release-all）：主包与 foundation 同号强绑定，独立 npm 发布不再单独提供；误敲会被拦截提示改用 release-all / release-editor |
| `pnpm tag-current [--tag <name>] [--package <path>]` | 打本地 tag（默认按根包版本生成 `vX.Y.Z`；editor 用 `--tag pdeditor-vX.Y.Z --package packages/editor/package.json`；已存在则跳过，不推送） |

## Architecture

```text
src/                        # 主包：VSCode 扩展 + CLI 壳层（语义在 @andares/pdfoundation）
├── extension.ts            # VSCode 扩展：pdtransform/pdcompile 命令 + 格式化程序 + Tab 行为
├── cli.ts                  # pdtransform CLI 入口：自动识别 pd/json → 双向转换 → 打印
├── compile-cli.ts          # pdcompile CLI 入口：多文件合并段列表 → 选段 → 展开 → format
├── format-cli.ts           # pdformat CLI 入口
├── tab.ts                  # Tab 键缩进/缩出（扩展专用，listItemWsRun/tabUnit）
├── enter.ts                # Enter 键清空子项标记行（扩展专用，isEmptyItemMarkerLine）
└── version.ts              # CLI 通用 --version（pdVersion/handleVersionArg，三 CLI 共用）

packages/pdfoundation/      # 共享语义核心 @andares/pdfoundation（零运行时依赖，见下节）
├── format.ts               # 格式化：键值规范化 + 顶层缩进修正 + 空行规则 + 行内代码/围栏保护
├── pdtransform.ts          # pdToJsonText + compilePdText + detectTransformKind
├── jsonToPd.ts             # JSON → pd 渲染器（toJson 反向：值类型/Subject/丢弃规则）
├── auto-detect.ts          # pd 意图检测（detectPdIntent/isPdMarkerLine/mayBeCommentLine）
└── parser/
    ├── types.ts            # PLine / Block（AST）/ PdDoc / PError
    ├── lexer.ts            # 行分类：section/separator/key/item-key/item/text/blank（行内代码豁免）
    ├── parser.ts           # 块栈构建：缩进找爸爸 + Subject + 顶层 `- ` 缩进报错
    ├── toJson.ts           # 树 → JSON（单条折叠：inline 且无子键 → 字符串）
    └── expand.ts           # 段切分（围栏感知）+ nameSections/resolveSection 寻址 + `:refname`/`:%N` 引用展开

packages/editor/            # 低 UI 输入框 @andares/pdeditor（工厂 + <pd-editor> + React，见下节）
```

**`docs/SPEC.md` 是语法规范的唯一事实来源**——grammar、parser、skill 全部以它为准。
`skill/promptdown/SKILL.md` 是语法速查（供 AI 加载），与 SPEC 冲突时以 SPEC 为准。

## pd 语法要点（避免误解）

- **没有 `#` 标题**。核心只有 `:`（键值/引用）与 `-`（序列标记）
- **严格键值判定**（转换非格式化，不兼容不规范写法）：键名不以空白结尾（`a : b` 不是键值）、冒号后跟空白或行尾（`a:b` 不是键值，可先由 pdformat 修正）；`:-`/`：-` 使整行不是键值
- **折叠**：键内只有单条字串 → `"key": "value"`；多行/混排 → `{ "Info1": [...] }`
- **Info**：无 key 内容归默认键 `Info`（数组），编号每层独立
- **Subject**：顶层无 key 内容进匿名根 `Subject1/Subject2...`
- **找爸爸**：裸键值行在根创建（不找爸爸）；带 `-` 行与内容行按缩进找爸爸；
  `- words` 与 `- name:` 同缩进 → 平级（words 进父级 Info）
- **`---`**：块边界，指针回根（清掉之前所有父级）
- **JSON→pd 空行规则**（已移入 format）：默认无空行；唯一例外 = 顶层带子域键值后跟下一个顶层条目时空一行（多段按段应用、幂等）。
  文本块/代码块（裸 Subject）前还要输出 `---`（只有 `---` 能把栈回根）
- **内容项转义**（仅 InfoN 数组内字串）：第一个冒号转义——半角 `:` → `:-`、全角 `：` → `：-`，冒号后字符保留（`:` → `:-`）；已含 `:-`/`：-` 不转；行内代码段内不转。首项且块首 → 内联键值行还原（优先于转义）
- **引用**：` :refname ` 或 ` :%序号 `（前后必须带空格），编译期内联展开；`%N` 序号引用匿名段也可用；多段 `//!pd <name>` 混排；``` 围栏内与行内代码内不展开
- **section 寻址**：`%N` = 全局 1-based 序号；否则字符模式匹配 `//!pd <name>`（数字命名也是字符）；`%` 开头的段名转义 `%%`；隐式段（无 `//!pd`）= 文件主名；裸 `//!pd` 匿名段只能 `%N`；跨文件重名先到先得
- **行内代码**（`` ` ``）：配对整体字串，不支持换行；内部 `:`/`：`/`-` 不参与键值/序列/`:-` 转义/引用判定，format 与 jsonToPd 转义均豁免
- **多端一致性**：TextMate / tree-sitter / pdeditor 为显示层（语义以 TS 核心为准）；tree-sitter 有降级项（SECTION/SEPARATOR 整行锚定、ref 前后空格约束、行内代码漂色缺失——外部 scanner 无法回退字符 + 正则无 lookahead），差异表见 README「多端一致性」；语法改动需同步各显示端 + 更新差异表
- 顶层 `-` 不允许缩进（编译报错；format 时自动修正）
- 对换行极不敏感：空行基本无视

## Release Flow（tag 触发 CI，本地只准备）

**发版语义（2026-11 起）：tag 是发版意图，CI 是发版执行。** 本地脚本不再写 npm registry：
`pnpm release-all` / `pnpm release-editor` 做门禁、bump、CHANGELOG、commit、本地 tag，
最后把 tag 推上去；`.github/workflows/publish.yml` 被 tag 触发后用 OIDC trusted publishing 发布
（**不需要任何 npm token、不需要 2FA，自动带 provenance**）。本地 npm token 只保留读取与应急 staging。

### tag 约定（monorepo 三包）

| tag | 发布内容 | 版本关系 |
| --- | --- | --- |
| `vX.Y.Z` | `@andares/pdfoundation@X.Y.Z` → `@andares/promptdown@X.Y.Z` | 两包**同号**，顺序固定 |
| `pdeditor-vX.Y.Z` | `@andares/pdeditor@X.Y.Z` | 独立版本线，不拖主包号 |

一个 tag 只发一组包：editor 独立发版不该顺带发主包，主包发版也不该强行 bump editor。

### `pnpm release-all <bump> [--dry-run] [--prepare-only] [--no-wait]`

1. 参数校验：`patch | minor | major` 恰好一个；`release`/`all` 旧形态与非法参数被拦截提示
2. **sync**：未提交改动 → 展示清单 + `git add -A` + commit `chore: sync uncommitted changes before release`；本地领先远端 → `git push origin <分支>`（失败中止）；本地落后远端 → 中止（提示 `git pull --rebase`）；都没有 → 跳过不推。保证 release commit 与 tag 建立在线上最新代码上
3. 门禁：`build:all` → `typecheck:all` → `test:all`（含 foundation 与 editor），失败即中止
4. bump 主包 version + **同步 bump foundation version（同号）**（2 空格缩进 + 尾换行）
5. **CHANGELOG 归档**：`CHANGELOG.dev.md` → `CHANGELOG.md` 顶部 `## X.Y.Z (YYYY-MM-DD)`，删 dev 文件；无条目/文件缺失 → 提示跳过；缺 `# Changelog` 锚点 → 中止
6. `git commit -m "chore: release vX.Y.Z"` + `tag-current.mjs` 打本地 tag `vX.Y.Z`
7. **`git push origin <当前分支> refs/tags/vX.Y.Z` ← 发版动作**（push 失败即中止：tag 不上去，CI 就不会发布）；`--prepare-only` 停在这一步之前
8. 轮询 npm 确认 foundation 与主包都已发布且 `dist.attestations` 非空；失败即中止，**不创建 Release、不发布 VSIX**；`--no-wait` 明确跳过确认并直接继续本地尾部
9. GitHub Release `vX.Y.Z`（best-effort，需要 `GITHUB_TOKEN` 的 Contents 写权限；失败只警告）
10. `pnpm exec vsce package` + `vsce publish`（VSCode Marketplace 走 `VSCE_PAT`，无法 OIDC；无凭据/失败降级为只发 npm）

### `pnpm release-editor <bump> [--dry-run] [--prepare-only] [--no-wait]`

**工作区必须干净** → 组件包门禁（typecheck+test+build）→ 前置检查 foundation 目标版本已在 npm
（dependencies `workspace:^` 打包时改写为本地 foundation 版本，未上 npm 则消费方 ETARGET）→
bump `packages/editor/package.json` → CHANGELOG 归档 → commit + tag **`pdeditor-vX.Y.Z`**（
`tag-current --package packages/editor/package.json`，不能拿根包版本校验）→
push tag（发版动作）→ 轮询 npm 与 provenance，未确认则退出非零。`--prepare-only` 停在 push 前；
`--no-wait` 跳过确认且只报告「tag 已推送」，不声称已发布。

### CI 侧（`.github/workflows/publish.yml`）

- 触发：`push: tags: ['v*', 'pdeditor-v*']` + `workflow_dispatch`（**ref 必须选 tag**，选分支会被 guard job 判失败）
- 权限：`contents: read` + `id-token: write`；`environment: npm`（与 `npm trust github ... --env npm` 对应）；**没有任何 NPM_TOKEN**
- 版本硬校验：tag 去前缀必须等于对应 package.json 版本（`v*` 还要等于 foundation）；tag 必须在默认分支上
- 主包 job：install → `build:all` → `typecheck:all` → `test:all` → 校验版本 → `pnpm pack` foundation/主包 → 断言 tarball 无 `workspace:` → **先发 foundation 再发主包**
- editor job：install → build foundation → editor typecheck/test/build → 校验版本 → 校验目标 foundation 版本已在 npm → `pnpm pack` → 发布
- 发布命令：`npm publish <tarball> --provenance --access public`（pnpm 负责把 `workspace:^` 改写成实际版本，npm 负责 OIDC 与 provenance）
- 重跑恢复：已在 npm 上的版本自动跳过，所以「foundation 成功、主包失败」可由 Actions 里 Re-run 或 Run workflow（ref 选同一 tag）补完

### 应急与回滚

- **本地 token 不再参与正常发版**；CI 不可用时才用 staging：`pnpm pack` 后 `npm stage publish <tgz>`（需要本地 token + 2FA，再人工审批），不要用它替代正常发版
- 推 tag 前反悔：`git tag -d vX.Y.Z && git reset --hard HEAD~1`（尚未产生任何公开状态）
- tag 已推送但 CI 失败：**不要删 tag 重发**（会留下公开的「有 tag、无发布」记录）；runner/registry 临时故障可在 Actions 里对同一 tag 重跑。注意 Re-run 使用 tag 对应的工作流快照：若必须修改工作流本身，修复要进入新的发版 tag，不能只改默认分支后期待旧 tag 的 Re-run 生效。若无法恢复，再 bump 到下一版本发一次（npm 版本号不可复用）
- foundation 已发布、主包失败：同样重跑工作流，已存在的 foundation 版本会被跳过（不会重复发布）

### 附注（发布相关约定）

**npm 包名与仓库名不同**：npm registry 上 `promptdown` 已被他人占用（相似度保护会拒绝近似名），
发布 npm 用 `package.json` 的 **`publishConfig.name`** 声明 scoped 名 **`@andares/promptdown`**（`--access=public`），
脚本不再临时改包名；`package.json` 的 `name` 保持 `promptdown`（vsce 需要非 scoped 名，扩展 ID 为 `andares.promptdown`）。
安装命令：`npm install -g @andares/promptdown`。

## 变更日志约定（唯一变更留档：CHANGELOG.dev.md → CHANGELOG.md）

本项目**不另设 implementation-report 等留档**——变更记录的唯一载体是 CHANGELOG（发布时归档）；计划/方案文件为一次性产物（见 Conventions）。**版本号发布时才确定**——开发期禁止在 CHANGELOG.md 预写 `## X.Y.Z (未发布)` 章节（历史上 0.7–0.10 的 "(未发布)" 标记是旧方案遗留，勿模仿；已于 2026-09 清理）。

**章节格式统一为 `## X.Y.Z (YYYY-MM-DD)`**（无 `v` 前缀；日期 = 发布日，归档脚本自动写入）。

- **开发期（主包 + foundation）**：功能/修复提交时把条目追加到根目录 **`CHANGELOG.dev.md`**（临时文件，文件头自带用途说明；不存在则按该头模板新建）。格式 `- **要点**：说明`（可带缩进子条目），**不写版本号**；每次提交一并写好，不留到发布前补
- **发布时（release-all 第 5 步，agent 不执行——发布由用户本人跑）**：脚本把 dev 条目（滤掉标题/引用说明行）归档为 `CHANGELOG.md` 顶部 `## X.Y.Z (发布日期)` 章节，删除 dev 文件，随 release commit 进 git；无条目/文件缺失 → 提示跳过，不阻塞（纯依赖/内部提交）
- **editor（独立版本线）**：同一纪律，文件在包内——开发期条目写 **`packages/editor/CHANGELOG.dev.md`**；`pnpm release-editor` 在 bump 后归档为 `packages/editor/CHANGELOG.md` 最新章节（最新在前）并删除 dev 文件，随 `pdeditor-vX.Y.Z` release commit 进 git

## 共享语义核心（@andares/pdfoundation）

独立 workspace 包 `packages/pdfoundation/` → npm `@andares/pdfoundation`（零运行时依赖）：

- **内容**：parser（lexer/parser/toJson/expand/types）+ format + pdtransform + jsonToPd + auto-detect——主包（VSCode 扩展 + CLI）与 `@andares/pdeditor`（pd 入口语义 re-export）**共同依赖**，语义单一来源，消除跨包漂移
- **构建**：vite lib ESM/CJS 双格式（index.js / index.cjs）+ tsc d.ts；`sideEffects:false` 可树摇；零依赖（无需 external）
- **消费**：主包用 CJS `require`（`moduleResolution: node` 靠顶层 `main`/`types` 兜底解析，非 exports）；Web 端经 editor 双入口 re-export（vite external + **dependencies**）或直接 import
- **发布**：随主包 tag 一起发——版本号与主包**同号绑定**（release 脚本同步写入），顺序固定：先发 foundation 再发主包；主包 dependencies 用 `workspace:^`，CI 用 `pnpm pack` 打包时自动改写为实际版本
- **测试**：语义测试随包（tsx --test + fixtures，180 用例）；CLI 集成测试（spawn compile-cli）留在主包 test/

## Web 输入框组件（@andares/pdeditor，低 UI 优先）

### 当前状态（v0.5.x，见 packages/editor/）

**低 UI 提示词输入框**：自研 overlay 引擎（已移除 Yace），三种用法——工厂 `createPdEditor` / 自定义元素 `<pd-editor>` / React `<PdEditor>`。

- **形态**：核心只渲染文本/光标/高亮；**不修改挂载点样式**；字体/字号/颜色默认 inherit，主题全走 CSS 变量；`createPdEditor` API 保持兼容（新增可选键）
- **引擎**：透明 textarea + 高亮 pre + 可选行号层；`scrollbar-gutter: stable` 保证两层宽度一致；auto-grow（pre 在文档流）↔ 内滚（宿主 `height`/`max-height`）自动切换，`scroll` 事件同步覆盖层；`ResizeObserver` 处理宿主尺寸；输入热路径不做强制布局读取。排版不变量见 editor README
- **入口**：`.`（全量，含 Prism）/ `./pd`（pd-only）/ `./element`（`<pd-editor>`，不含 Prism）/ `./element/auto`（import 即注册）/ `./react`（React optional peer）。元素默认只带 pd tokenizer；需要 md/json/yaml/xml 时由宿主注入 `highlight`（主入口导出 `prismHighlighter`）
- **a11y**：覆盖层 `aria-hidden`、label 转发、焦点环、`Tab` 可配（`indent` / `focus`，indent 下 `Escape` 释放下一次 Tab）、placeholder 覆盖层（不依赖原生 placeholder）
- **语义单源**：pd tokenizer 在组件内（`pd-highlight.ts`），行内判定直接复用 foundation 导出（`splitInlineCode` / `matchKeyValue` / `findKeyValueSeparator`），不再保留副本
- **发布**：独立 workspace 包 `packages/editor/` → npm `@andares/pdeditor`（vite lib mode：ESM/CJS + d.ts；vitest + jsdom 82 用例）；`foundation` 在 dependencies（external + 自动安装）
- **demo**：`demo/index.html` + `demo/app.ts`；`pnpm --filter @andares/pdeditor build:demo` 用 esbuild 产出**单文件** `demo-dist/index.html`（file:// 双击可用，内联 IIFE；含低 UI 嵌入示例、基础工具栏 UI、框架用法、浏览器几何自检）；`dev` 仍用 vite 热更新
- **集成指南（给其他 agent）**：`skill/pdeditor/SKILL.md`——选入口 / 各框架可复制代码 / 低 UI 嵌入契约 / 禁止事项 / 集成后自测清单。**其他 agent 要把输入框嵌进别的项目时，先读它**（本会话/后续会话都适用，不要重新推导一遍）。它随 npm 包 `@andares/promptdown` 发布（`skill/` 目录），本机软链即可被自动发现
- **变更记录**：`packages/editor/CHANGELOG.md`（独立版本线；开发期条目写 `packages/editor/CHANGELOG.dev.md`，`pnpm release-editor` 自动归档）

### 未来可选方向

- 成品 UI 层（格式切换器 / Ctrl+G 放大模式 / 历史记录 / 工具栏）——核心已提供 element + 事件，UI 层按宿主需求自建
- 移动端/触屏专项验证、协同（Yjs）
- Helix 结构升级（folds / fence injection 需要 grammar 从平铺行改成块结构；当前只做高亮 + 缩进）

## Git 权限边界（强约束）

- **agent 的 git 操作权限仅限 `git commit`（及本地 stash/reset 等纯本地操作）**
- **禁止 `git push`**（任何分支、任何 tag）；**禁止运行完整发版命令**（`pnpm release-all` / `pnpm release-editor` 不带 `--prepare-only`）与 `npm publish`——发版命令现在会推 tag，与直接 push 等价
- agent 可以做到：`--dry-run`、`--prepare-only`（本地 commit + tag，不推）、本地 `git commit` / `git tag`；之后向用户报告并请求推送
- 推送与发版（npm + VSCode + GitHub Release）由**用户本人操作**；用户说“提交”时 agent 只执行 commit（可多分 commit，符合 conventional commits），不再多问，也不附带任何 push/release
- 本地 tag（`pnpm tag-current`）可打可不打，但**不得 push tag**

## Conventions

- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**，不做内联解析
- 数组元素一行一个，无逗号分隔
- 测试：语义用例随共享包（`packages/pdfoundation/test/`，node:test + fixtures）；主包 `test/` 为 CLI 集成与编辑器行为用例；editor 为 vitest + jsdom。新增语法规则必须补 fixtures + 断言
- 语法规则改动必须同步：`docs/SPEC.md` → parser → `syntaxes/pd.tmLanguage.json` → `skill/promptdown/SKILL.md` → fixtures
- 格式化规则（`packages/pdfoundation/src/format.ts`）与 SPEC 的「格式化」章节保持一致：全角冒号→半角、键值冒号后单空格、引用前后空格、顶层 `-` 缩进修正、行尾空白；VSCode 格式化程序（src/extension.ts）与 CLI 共用同一 format 函数
- **格式化**：遵循 biome 默认风格（tab 缩进）。保存/提交前保持与现有文件一致，避免格式噪音 diff
- 发布前必须跑 `pnpm build:all && pnpm typecheck:all && pnpm test:all`（**顺序固定：先构建再校验**——三包的 typecheck/test 都经 foundation 的 `dist` 解析类型与运行时，全新 clone 没有 dist 时直接 typecheck 会误报 `Cannot find module '@andares/pdfoundation'`），全部通过才可 `pnpm release-all` / `pnpm release-editor`（两条发布入口及其 CI 工作流已按同一顺序）
- **editor 功能改动后必须重建 demo**：`packages/editor/` 的 `src/` 或 `demo/` 有任何改动后，必须重新构建单文件 demo——`pnpm --filter @andares/pdeditor build:demo`（或一步到位 `build:editor` = lib build + demo build），保证 `demo-dist/` 与源码同步（demo-dist 是本地产物，gitignored 不入库，但用户直接打开它查看效果，旧产物会误导）
- `.npmignore` 控制发布内容（pnpm 复用 npm 的发布文件机制，勿删）；新增发布文件记得检查它
- **计划/方案文件为一次性任务产物**：完成后删除，不留仓库根目录（完整过程轨迹保留在 git 历史与 commit message）；需要常驻的设计文档放 `docs/`
