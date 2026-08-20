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
  - `pnpm publish`（由 `pnpm release-all` 自动执行，不要手动跑）
  - `pnpm dlx <pkg>` 或 `pnpm exec <pkg>` 替代 npx
  - `pnpm typecheck` / `pnpm test` / `pnpm build` 等脚本
- 不要在项目内跑 `npm install` / `npm publish` / `npx`——开发链路一律 pnpm 形式
- 发布入口限两个：`pnpm release-all <patch|minor|major> [--dry-run]`（主包 + foundation 同号 + vsce，参考 `scripts/publish.mjs`）与 `pnpm release-editor`（editor 独立）；`pnpm release` / `release-foundation` 已移除（保护：误敲会被拦截提示）
- 构建脚本白名单：`pnpm-workspace.yaml` 的 `allowBuilds`（esbuild、@vscode/vsce-sign；keytar 禁止）——新增依赖若被阻止构建，在此批准
- 本机 pi skill 注册：`~/.pi/agent/settings.json` 的 `skills` 数组指向 `~/.pi/agent/skills/promptdown`（软链到 npm 全局包 `@andares/promptdown` 的 `skill/` 目录，自动发现 `promptdown` 与 `pd-author` 两个 skill）。node 升级导致 fnm 版本路径变化时，只需重指该软链，不要改回 pnpm 路径。

## Commands

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` 类型检查 |
| `pnpm test` | node:test 跑 `test/*.test.ts`（tsx 执行） |
| `pnpm perf` | 性能基准（10 副本样本 2099 行/150 段；`pnpm perf:gen [份数]` 重新生成，产物 `perf/generated/` 不入库） |
| `pnpm build` | tsc 编译到 `dist/` |
| `node dist/format-cli.js <file> [-w]` | 格式化 pd 文本（发布后为 `pdformat` 命令） |
| `node dist/cli.js <file> [段名\|%序号]` | 双向转换（发布后为 `pdtransform`；自动识别 pd/json） |
| `node dist/compile-cli.js <section> <file>...` | 多段编译为单份完整 pd（发布后为 `pdcompile`；跨文件合并段列表、引用内联展开、统一 format） |
| `pnpm exec vsce package` | 生成 .vsix（或 `pnpm package`） |
| `pnpm release-all <patch\|minor\|major>` | **唯一主包发布入口**：foundation（版本与主包同号）+ 主包 npm + push + GitHub Release + vsce；顺序固定 foundation→主包；npm 失败中止；vsce 失败降级为只发 npm |
| `pnpm release-editor <patch\|minor\|major>` | 发布组件包 `@andares/pdeditor`（packages/editor）：**纯 npm 流程**——组件门禁（typecheck+test+build）→ bump → pnpm publish；**无任何 git 操作**（不 commit / tag / push / GitHub Release——editor 独立版本号，不进仓库 git 历史与 tag；bump 留在工作区由使用者自行提交；`--dry-run` 预览） |
| ~~`pnpm release`~~ / ~~`pnpm release-foundation`~~ | 已移除（并入 release-all）：主包与 foundation 同号强绑定，独立 npm 发布不再单独提供；误敲会被拦截提示改用 release-all / release-editor |
| `pnpm tag-current` | 给当前版本打本地 tag `vX.Y.Z`（已存在则跳过，不推送） |

## Architecture

```text
src/                        # 主包：VSCode 扩展 + CLI 壳层（语义在 @andares/pdfoundation）
├── extension.ts            # VSCode 扩展：pdtransform/pdcompile 命令 + 格式化程序 + Tab 行为
├── cli.ts                  # pdtransform CLI 入口：自动识别 pd/json → 双向转换 → 打印
├── compile-cli.ts          # pdcompile CLI 入口：多文件合并段列表 → 选段 → 展开 → format
├── format-cli.ts           # pdformat CLI 入口
└── tab.ts                  # Tab 键缩进/缩出（扩展专用，listItemWsRun/tabUnit）

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

packages/editor/            # 输入框组件 @andares/pdeditor（见下节）
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
- **多端一致性**：TextMate 与 tree-sitter 为显示层（语义以 TS 核心为准）；tree-sitter 有降级项（SECTION/SEPARATOR 整行锚定、ref 前后空格约束、行内代码漂色缺失——外部 scanner 无法回退字符 + 正则无 lookahead），差异表见 README「多端一致性」；语法改动需同步四端 + 更新差异表
- 顶层 `-` 不允许缩进（编译报错；format 时自动修正）
- 对换行极不敏感：空行基本无视

## Release Flow（`pnpm release-all`）

`release-all` 是唯一主包发布入口（foundation 版本与主包同号，一起发）。基础流程（sync → 门禁 → bump → commit+tag → 发 foundation → 发主包 → push 分支+tags → 创建 GitHub Release → vsce），**一个步骤都不能少**：

- vsce package + publish 必走，无 vsce 凭据或失败时**降级为只发 npm**（提示，不中止，可稍后手动补发）；npm 失败即中止（版本已锚定）
- **foundation 与主包同号 + 固定顺序**：bump 时把 `packages/pdfoundation/package.json` 的 version 写成与主包一致的 `vX.Y.Z`（同号绑定）；**先发 foundation 到 npm，再发主包**（主包 tarball 的 `workspace:^` 依赖在发布时被 pnpm 自动改写为实际版本）

1. 参数校验：`patch | minor | major` 恰好一个；`--dry-run` 只预览；`release`/`all` 旧形态与非法参数被拦截提示
2. **sync**：未提交改动 → 展示清单 + `git add -A` + commit `chore: sync uncommitted changes before release`；本地领先远端 → `git push origin <分支>`（失败中止）；本地落后远端 → 中止（提示 `git pull --rebase`）；都没有 → 跳过不推。保证 release commit 与 tag 建立在线上最新代码上，不会出现“文件没提交但 tag 已打”
3. 门禁：typecheck + test + build（含 foundation 的 test），失败即中止
4. bump 主包 `package.json` version + **同步 bump `packages/pdfoundation/package.json` version（同号）**（2 空格缩进 + 尾换行）
5. `git commit -m "chore: release vX.Y.Z"`，然后调用 `scripts/tag-current.mjs` 打 tag（检测已存在 → 不重复打，指向 release commit）
6. `pnpm --filter @andares/pdfoundation publish --no-git-checks --access=public`（foundation 先发）→ `pnpm publish --no-git-checks --access=public`（主包，prepublishOnly 再次门禁；任一处失败中止，回滚见下）
7. `git push origin <当前分支> refs/tags/vX.Y.Z`（只推该 tag 非全量 --tags；尝试一次，失败仅警告——可能此前已推过）
8. 设了 `GITHUB_TOKEN`（fine-grained，Contents: write）且 tag 已到远端（`git ls-remote` 验证，push 失败时跳过避免 Release 指向错误 commit），就用 curl 调 REST API 创建 GitHub Release `vX.Y.Z`（`generate_release_notes` 自动生成 notes；422 `already_exists` → 跳过；其他失败 → 仅警告）
9. `pnpm exec vsce package` 生成 `promptdown-<version>.vsix`；若设了 `VSCE_PAT`（vsce 官方环境变量）或 `~/.vsce` 里有 publisher 凭据，自动 `vsce publish`；否则提示手动补发

`pnpm tag-current` 可独立使用：给当前 HEAD 打本地 `v{version}` tag（已存在则跳过），**只打 tag 不推送**。

**npm 包名与仓库名不同**：npm registry 上 `promptdown` 已被他人占用（相似度保护会拒绝近似名），
发布 npm 用 `package.json` 的 **`publishConfig.name`** 声明 scoped 名 **`@andares/promptdown`**（`--access=public`），
脚本不再临时改包名；`package.json` 的 `name` 保持 `promptdown`（vsce 需要非 scoped 名，扩展 ID 为 `andares.promptdown`）。
安装命令：`npm install -g @andares/promptdown`。

发布失败回滚：`git tag -d vX.Y.Z && git reset --hard HEAD~1`

## 共享语义核心（@andares/pdfoundation）

独立 workspace 包 `packages/pdfoundation/` → npm `@andares/pdfoundation`（零运行时依赖）：

- **内容**：parser（lexer/parser/toJson/expand/types）+ format + pdtransform + jsonToPd + auto-detect——主包（VSCode 扩展 + CLI）与 `@andares/pdeditor`（pd 入口语义 re-export）**共同依赖**，语义单一来源，消除跨包漂移
- **构建**：vite lib ESM/CJS 双格式（index.js / index.cjs）+ tsc d.ts；`sideEffects:false` 可树摇；零依赖（无需 external）
- **消费**：主包用 CJS `require`（`moduleResolution: node` 靠顶层 `main`/`types` 兜底解析，非 exports）；Web 端经 editor pd 入口 re-export（external + peer）或直接 import
- **发布**：随主包 release-all 一起发——版本号与主包**同号绑定**（publish.mjs bump 时同步写入），顺序固定：先发 foundation 再发主包；主包 dependencies 用 `workspace:^`，pnpm 发布时自动改写为实际版本
- **测试**：语义测试随包（tsx --test + fixtures，173 用例）；CLI 集成测试（spawn compile-cli）留在主包 test/

## Web 输入框组件（@andares/pdeditor，headless 优先）

### 当前目标（已实现 v0.1，见 packages/editor/）

基于 **Yace**（<https://github.com/petersolopov/yace，~2KB、零依赖、BYO> highlighter）的 **headless 提示词输入框** `@andares/pdeditor`：

- **形态**：纯背后控制，只渲染输入框内容 + 提供 API（`createPdEditor`，含 `setLanguage/setValue/getValue/destroy`）；无 UI chrome，核心维护 textarea/pre 覆盖层排版不变量，外部定义容器外观与 token 配色
- **语言切换是 API 行为**（非 UI 切换器）：pd / md / xml / json / yaml（Prism 提供后四种）
- **不是富文本**：pd 是纯代码文本，要精确不要样式——高亮服务于精确；排除富文本引擎（ProseMirror/Lexical/Slate）与 CM6/Monaco 本体
- **不依赖主包**（主包 = VSCode 扩展，main 指向 dist/extension.js，浏览器不可 import）：pd 高亮 tokenizer 仍在组件内自研（语义与共享包 lexer 一致，见 `packages/editor/src/inline.ts`）；语义功能改走**共享语义包 @andares/pdfoundation**（见上节），不再直引主包源码
- **语义 API：pd 入口 re-export @andares/pdfoundation**：`format` / `jsonToPdText` / `pdToJsonText`(external + peerDependency `@andares/pdfoundation`，产物零体积、零漂移——语义单一来源)；`highlightPd` 也随 pd 入口导出（自研 tokenizer，供外部自定义渲染/复用）
- **发布**：独立 workspace 包 `packages/editor/` → npm `@andares/pdeditor`（vite lib mode：ESM/CJS + d.ts；vitest + jsdom 测试 53 用例）
- **demo 页**：`packages/editor/demo/`（vite dev 验证高亮/语言切换/中文 IME/格式化/双向转换——demo 从共享包引语义，演示 external+peer 消费姿势；`test/demo-smoke.test.ts` 防回归）
- 插件（yace 内置）：Tab 缩进 + 续行缩进默认启用

### 未来可选方向（不在本期实现）

- **成品输入框**（headless 核心 + UI 层，**不着急做**）：格式切换器（复用 detectTransformKind）、Ctrl+G 放大模式（大输入切 CM6 专用编辑器）、历史记录（localStorage/IndexedDB）、工具栏（段大纲等）
- 主题系统（CSS 变量，参考 synesthesia）
- 移动端/触屏适配、协同（Yjs）

## Git 权限边界（强约束）

- **agent 的 git 操作权限仅限 `git commit`（及本地 stash/reset 等纯本地操作）**
- **禁止 `git push`**（任何分支、任何 tag）；**禁止 `pnpm release*` 与 `npm publish`**（release / release-all / release-editor 一律禁止，包括手动把包发上 npmjs.com 的步骤）
- 推送与发版（npm + VSCode + GitHub Release）由**用户本人操作**；用户说“提交”时 agent 只执行 commit（可多分 commit，符合 conventional commits），不再多问，也不附带任何 push/release
- 本地 tag（`pnpm tag-current`）可打可不打，但**不得 push tag**

## Conventions

- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**，不做内联解析
- 数组元素一行一个，无逗号分隔
- 测试用 node:test + fixtures（`test/fixtures/*.pd`），新增语法规则必须补 fixtures + 断言
- 语法规则改动必须同步：`docs/SPEC.md` → parser → `syntaxes/pd.tmLanguage.json` → `skill/promptdown/SKILL.md` → fixtures
- 格式化规则（src/format.ts）与 SPEC 的「格式化」章节保持一致：全角冒号→半角、键值冒号后单空格、引用前后空格、顶层 `-` 缩进修正、行尾空白；VSCode 格式化程序（src/extension.ts）与 CLI 共用同一 format 函数
- **格式化**：遵循 biome 默认风格（tab 缩进）。保存/提交前保持与现有文件一致，避免格式噪音 diff
- 发布前必须跑 `pnpm typecheck && pnpm test`，全部通过才可 `pnpm release` / `pnpm release-all`
- **editor 功能改动后必须重建 demo**：`packages/editor/` 的 `src/` 或 `demo/` 有任何改动后，必须重新构建预构建 demo——`pnpm --filter @andares/pdeditor build:demo`（或一步到位 `build:editor` = lib build + demo build），保证 `demo-dist/` 与源码同步（demo-dist 是本地产物，gitignored 不入库，但用户直接打开它查看效果，旧产物会误导）
- `.npmignore` 控制发布内容（pnpm 复用 npm 的发布文件机制，勿删）；新增发布文件记得检查它
- **计划/方案文件为一次性任务产物**：完成后删除，不留仓库根目录（完整过程轨迹保留在 git 历史与 commit message）；需要常驻的设计文档放 `docs/`
