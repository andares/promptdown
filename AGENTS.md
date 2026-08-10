# prompt-down Project Guidelines

极简标记语言 prompt-down（.pd）：兼容 markdown 风格，可单向转 JSON。
提供 `pd2json` CLI、VSCode 语法高亮（TextMate grammar，无 LSP）与 AI skill。

## Package Management

- **本项目使用 `pnpm` 作为唯一包管理器。**
- 一律使用 pnpm 形式：
  - `pnpm install` / `pnpm add -D <pkg>` / `pnpm remove`
  - `pnpm publish`（由 `pnpm release` 自动执行，不要手动跑）
  - `pnpm dlx <pkg>` 或 `pnpm exec <pkg>` 替代 npx
  - `pnpm typecheck` / `pnpm test` / `pnpm build` 等脚本
- 不要在本项目运行 `npm install` / `npm publish` / `npx`——一律用 pnpm 形式
- 发布脚本：`pnpm release <patch|minor|major> [--dry-run]`（参考 `scripts/publish.mjs`）
- 构建脚本白名单：`pnpm-workspace.yaml` 的 `allowBuilds`（esbuild、@vscode/vsce-sign；keytar 禁止）——新增依赖若被阻止构建，在此批准

## Commands

| 命令 | 作用 |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` 类型检查 |
| `pnpm test` | node:test 跑 `test/*.test.ts`（tsx 执行） |
| `pnpm build` | tsc 编译到 `dist/` |
| `pnpm exec vsce package` | 生成 .vsix（或 `pnpm package`） |
| `pnpm release <patch\|minor\|major>` | 一键发布：校验 → 测试 → bump → commit+tag → publish → vsce package |

## Architecture

```
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

## Release Flow（`pnpm release`）

1. 参数校验：`patch | minor | major` 恰好一个；`--dry-run` 只预览
2. dirty tree 警告（不阻塞）
3. 门禁：typecheck + test + build，失败即中止
4. bump `package.json` version（2 空格缩进 + 尾换行）
5. `git commit -m "chore: release vX.Y.Z"` + `git tag vX.Y.Z`
6. `pnpm publish --no-git-checks`（prepublishOnly 再次门禁 typecheck+test+build）
7. `pnpm exec vsce package` 生成 `prompt-down-<version>.vsix`
8. 若设了 `VSCODE_MARKETPLACE_TOKEN`，自动 `vsce publish`；否则手动上传 .vsix

发布失败回滚：`git tag -d vX.Y.Z && git reset --hard HEAD~1`

## Conventions

- 内联 markdown（`**粗体**`、`` `代码` ``）转 JSON 时**保留原文**，不做内联解析
- 数组元素一行一个，无逗号分隔
- 测试用 node:test + fixtures（`test/fixtures/*.pd`），新增语法规则必须补 fixtures + 断言
- 语法规则改动必须同步：`docs/SPEC.md` → parser → `syntaxes/pd.tmLanguage.json` → `skill/SKILL.md` → fixtures
- **格式化**：遵循 biome 默认风格（tab 缩进）。保存/提交前保持与现有文件一致，避免格式噪音 diff
- 发布前必须跑 `pnpm typecheck && pnpm test`，全部通过才可 `pnpm release`
- `.npmignore` 控制发布内容（pnpm 复用 npm 的发布文件机制，勿删）；新增发布文件记得检查它
