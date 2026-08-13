# promptdown Project Guidelines

极简标记语言 promptdown（.pd）：兼容 markdown 风格，可单向转 JSON。
提供 `pd2json` CLI、VSCode 语法高亮（TextMate grammar，无 LSP）与 AI skill。

## Package Management

**两条线，不要混淆（2025-08 起约定，勿改回）：**

- **用户层安装指导（对外文档）一律用 `npm`**：安装命令为 `npm install -g @andares/promptdown`。
  原因：pnpm 全局机制（store/hardlink 布局）是为开发期库依赖优化的，不适合管理全局 CLI 工具，
  本机全局工具安装已从 pnpm 换回 npm。改 README / docs / 教程里的安装示例时保持 npm，
  不要写成 `pnpm add -g`。
- **项目内开发工具链用 `pnpm`**（唯一包管理器）：
  - `pnpm install` / `pnpm add -D <pkg>` / `pnpm remove`
  - `pnpm publish`（由 `pnpm release` 自动执行，不要手动跑）
  - `pnpm dlx <pkg>` 或 `pnpm exec <pkg>` 替代 npx
  - `pnpm typecheck` / `pnpm test` / `pnpm build` 等脚本
- 不要在项目内跑 `npm install` / `npm publish` / `npx`——开发链路一律 pnpm 形式
- 发布脚本：`pnpm release <patch|minor|major> [--dry-run]` / `pnpm release-all <patch|minor|major> [--dry-run]`（参考 `scripts/publish.mjs`）
- 构建脚本白名单：`pnpm-workspace.yaml` 的 `allowBuilds`（esbuild、@vscode/vsce-sign；keytar 禁止）——新增依赖若被阻止构建，在此批准
- 本机 pi skill 注册：`~/.pi/agent/settings.json` 的 `skills` 数组指向 `~/.pi/agent/skills/promptdown`（软链到 npm 全局包 `@andares/promptdown` 的 `skill/` 目录，自动发现 `promptdown` 与 `pd-author` 两个 skill）。node 升级导致 fnm 版本路径变化时，只需重指该软链，不要改回 pnpm 路径。

## Commands

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` 类型检查 |
| `pnpm test` | node:test 跑 `test/*.test.ts`（tsx 执行） |
| `pnpm build` | tsc 编译到 `dist/` |
| `node dist/format-cli.js <file> [-w]` | 格式化 pd 文本（发布后为 `pdformat` 命令） |
| `pnpm exec vsce package` | 生成 .vsix（或 `pnpm package`） |
| `pnpm release <patch\|minor\|major>` | 一键发布 npm：校验 → 测试 → bump → commit+tag → publish → vsce package |
| `pnpm release-all <patch\|minor\|major>` | npm + VSCode 一起发：npm 失败中止；npm 成功后推 GitHub + 建 Release（需 `GITHUB_TOKEN`，best-effort），vsce 失败降级为只发 npm |
| `pnpm tag-current` | 给当前版本打本地 tag `vX.Y.Z`（已存在则跳过，不推送） |

## Architecture

```text
src/
├── cli.ts            # pd2json 入口（读文件 → expand → parse → toJson → 打印）
└── parser/
    ├── types.ts      # PLine / Block（AST）/ PdDoc / PError
    ├── lexer.ts      # 行分类：section/separator/key/item-key/item/text/blank
    ├── parser.ts     # 块栈构建：缩进找爸爸 + Subject + 顶层 `- ` 缩进报错
    ├── toJson.ts     # 树 → JSON（单条折叠：inline 且无子键 → 字符串）
    └── expand.ts     # 段切分 + `:refname` 引用编译期内联展开（含循环检测）
```

**`docs/SPEC.md` 是语法规范的唯一事实来源**——grammar、parser、skill 全部以它为准。
`skill/promptdown/SKILL.md` 是语法速查（供 AI 加载），与 SPEC 冲突时以 SPEC 为准。

## pd 语法要点（避免误解）

- **没有 `#` 标题**。核心只有 `:`（键值/引用）与 `-`（序列标记）
- **折叠**：键内只有单条字串 → `"key": "value"`；多行/混排 → `{ "Info1": [...] }`
- **Info**：无 key 内容归默认键 `Info`（数组），编号每层独立
- **Subject**：顶层无 key 内容进匿名根 `Subject1/Subject2...`
- **找爸爸**：裸键值行在根创建（不找爸爸）；带 `-` 行与内容行按缩进找爸爸；
  `- words` 与 `- name:` 同缩进 → 平级（words 进父级 Info）
- **`---`**：块边界，指针回根（清掉之前所有父级）
- **引用**：` :refname `（前后必须带空格），编译期内联展开；多段 `//!pd <name>` 混排
- 顶层 `-` 不允许缩进（编译报错；format 时自动修正）
- 对换行极不敏感：空行基本无视

## Release Flow（`pnpm release` / `pnpm release-all`）

两种模式共用基础流程（sync → 门禁 → bump → commit+tag → pnpm publish → push 分支+tags → 创建 GitHub Release），**一个步骤都不能少**。差异仅在末尾：

- `release`：**不跑 vsce**——即不做 vsce package/publish
- `release-all`：**追加 vsce**——vsce package + publish 必走，无 vsce 凭据或失败时**降级为只发 npm**（提示，不中止，可稍后手动补发）；npm 失败即中止（版本已锚定）

1. 参数校验：`patch | minor | major` 恰好一个；`--dry-run` 只预览
2. **sync**：未提交改动 → 展示清单 + `git add -A` + commit `chore: sync uncommitted changes before release`；本地领先远端 → `git push origin <分支>`（失败中止）；本地落后远端 → 中止（提示 `git pull --rebase`）；都没有 → 跳过不推。保证 release commit 与 tag 建立在线上最新代码上，不会出现“文件没提交但 tag 已打”
3. 门禁：typecheck + test + build，失败即中止
4. bump `package.json` version（2 空格缩进 + 尾换行）
5. `git commit -m "chore: release vX.Y.Z"`，然后调用 `scripts/tag-current.mjs` 打 tag（检测已存在 → 不重复打，指向 release commit）
6. `pnpm publish --no-git-checks --access=public`（prepublishOnly 再次门禁 typecheck+test+build；失败中止，回滚见下）
7. `git push origin <当前分支> refs/tags/vX.Y.Z`（两种模式都做，只推该 tag 非全量 --tags；尝试一次，失败仅警告——可能此前已推过）
8. 设了 `GITHUB_TOKEN`（fine-grained，Contents: write）且 tag 已到远端（`git ls-remote` 验证，push 失败时跳过避免 Release 指向错误 commit），就用 curl 调 REST API 创建 GitHub Release `vX.Y.Z`（`generate_release_notes` 自动生成 notes；422 `already_exists` → 跳过；其他失败 → 仅警告）——**两种模式都做**
9. **[release-all 追加]** `pnpm exec vsce package` 生成 `promptdown-<version>.vsix`；若设了 `VSCE_PAT`（vsce 官方环境变量）或 `~/.vsce` 里有 publisher 凭据（`pnpm exec vsce login andares` 存的明文文件——本机 keytar 原生模块未编译，vsce 自动降级为文件存储），自动 `vsce publish`；否则提示手动补发

`pnpm tag-current` 可独立使用：给当前 HEAD 打本地 `v{version}` tag（已存在则跳过），**只打 tag 不推送**。

**npm 包名与仓库名不同**：npm registry 上 `promptdown` 已被他人占用（相似度保护会拒绝近似名），
所以发布 npm 时脚本切换为 scoped 名 **`@andares/promptdown`**（`--access=public`），发布后恢复为
`promptdown`（vsce 需要非 scoped 名，扩展 ID 为 `andares.promptdown`）。安装命令：`npm install -g @andares/promptdown`。

发布失败回滚：`git tag -d vX.Y.Z && git reset --hard HEAD~1`

## Conventions

- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**，不做内联解析
- 数组元素一行一个，无逗号分隔
- 测试用 node:test + fixtures（`test/fixtures/*.pd`），新增语法规则必须补 fixtures + 断言
- 语法规则改动必须同步：`docs/SPEC.md` → parser → `syntaxes/pd.tmLanguage.json` → `skill/promptdown/SKILL.md` → fixtures
- 格式化规则（src/format.ts）与 SPEC 的「格式化」章节保持一致：全角冒号→半角、键值冒号后单空格、引用前后空格、顶层 `-` 缩进修正、行尾空白；VSCode 格式化程序（src/extension.ts）与 CLI 共用同一 format 函数
- **格式化**：遵循 biome 默认风格（tab 缩进）。保存/提交前保持与现有文件一致，避免格式噪音 diff
- 发布前必须跑 `pnpm typecheck && pnpm test`，全部通过才可 `pnpm release` / `pnpm release-all`
- `.npmignore` 控制发布内容（pnpm 复用 npm 的发布文件机制，勿删）；新增发布文件记得检查它
