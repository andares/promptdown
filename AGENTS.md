# promptdown Project Guidelines

极简标记语言 promptdown（.pd）：兼容 markdown 风格，可单向转 JSON。
提供 `pd2json` CLI、VSCode 语法高亮（TextMate grammar，无 LSP）与 AI skill。

## Package Management

- **本项目使用 `pnpm` 作为唯一包管理器。**
- 一律使用 pnpm 形式：
  - `pnpm install` / `pnpm add -D <pkg>` / `pnpm remove`
  - `pnpm publish`（由 `pnpm release` 自动执行，不要手动跑）
  - `pnpm dlx <pkg>` 或 `pnpm exec <pkg>` 替代 npx
  - `pnpm typecheck` / `pnpm test` / `pnpm build` 等脚本
- 不要在本项目运行 `npm install` / `npm publish` / `npx`——一律用 pnpm 形式
- 发布脚本：`pnpm release <patch|minor|major> [--dry-run]` / `pnpm release-all <patch|minor|major> [--dry-run]`（参考 `scripts/publish.mjs`）
- 构建脚本白名单：`pnpm-workspace.yaml` 的 `allowBuilds`（esbuild、@vscode/vsce-sign；keytar 禁止）——新增依赖若被阻止构建，在此批准

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
`skill/SKILL.md` 是语法速查（供 AI 加载），与 SPEC 冲突时以 SPEC 为准。

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

两种模式共用基础流程（门禁 → bump → commit+tag → pnpm publish → vsce package → vsce publish），差异：

- `release`：**不做 GitHub 步骤**；设置了 `VSCE_PAT` 才发布扩展，失败警告；否则跳过
- `release-all`：**npm 铁定发**（失败即中止，版本已锚定）；npm 成功后**推 GitHub 并建 Release**（best-effort）；vsce publish 必走，未设 `VSCE_PAT` 或失败时**降级为只发 npm**（提示，不中止，可稍后手动补发）

1. 参数校验：`patch | minor | major` 恰好一个；`--dry-run` 只预览
2. dirty tree 警告（不阻塞）
3. 门禁：typecheck + test + build，失败即中止
4. bump `package.json` version（2 空格缩进 + 尾换行）
5. `git commit -m "chore: release vX.Y.Z"`，然后调用 `scripts/tag-current.mjs` 打 tag（检测已存在 → 不重复打，指向 release commit）
6. `pnpm publish --no-git-checks --access=public`（prepublishOnly 再次门禁 typecheck+test+build；失败中止，回滚见下）
7. **[release-all]** `git push origin <当前分支> --tags`（尝试一次，失败仅警告——可能此前已推过）；然后设了 `GITHUB_TOKEN`（fine-grained，Contents: write）就用 curl 调 REST API 创建 GitHub Release `vX.Y.Z`（`generate_release_notes` 自动生成 notes；422 `already_exists` → 跳过；未设 token / 其他失败 → 仅警告）
8. `pnpm exec vsce package` 生成 `promptdown-<version>.vsix`
9. 若设了 `VSCE_PAT`（vsce 官方环境变量），自动 `vsce publish`；否则手动上传 .vsix

`pnpm tag-current` 可独立使用：给当前 HEAD 打本地 `v{version}` tag（已存在则跳过），**只打 tag 不推送**。

**npm 包名与仓库名不同**：npm registry 上 `promptdown` 已被他人占用（相似度保护会拒绝近似名），
所以发布 npm 时脚本切换为 scoped 名 **`@andares/promptdown`**（`--access=public`），发布后恢复为
`promptdown`（vsce 需要非 scoped 名，扩展 ID 为 `andares.promptdown`）。安装命令：`pnpm add -g @andares/promptdown`。

发布失败回滚：`git tag -d vX.Y.Z && git reset --hard HEAD~1`

## Conventions

- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**，不做内联解析
- 数组元素一行一个，无逗号分隔
- 测试用 node:test + fixtures（`test/fixtures/*.pd`），新增语法规则必须补 fixtures + 断言
- 语法规则改动必须同步：`docs/SPEC.md` → parser → `syntaxes/pd.tmLanguage.json` → `skill/SKILL.md` → fixtures
- 格式化规则（src/format.ts）与 SPEC 的「格式化」章节保持一致：全角冒号→半角、键值冒号后单空格、引用前后空格、顶层 `-` 缩进修正、行尾空白；VSCode 格式化程序（src/extension.ts）与 CLI 共用同一 format 函数
- **格式化**：遵循 biome 默认风格（tab 缩进）。保存/提交前保持与现有文件一致，避免格式噪音 diff
- 发布前必须跑 `pnpm typecheck && pnpm test`，全部通过才可 `pnpm release` / `pnpm release-all`
- `.npmignore` 控制发布内容（pnpm 复用 npm 的发布文件机制，勿删）；新增发布文件记得检查它
