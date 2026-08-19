# pdeditor 双入口（/pd 子入口）+ headless 完备性确认 + 文档链接

## Context

另一个项目（DSH 插件）要嵌入 pdeditor，但只用 pd 高亮；调研发现现有产物是**单入口自包含单文件**（`dist/index.js` 83KB，Prism+yace+es-toolkit 全部内联、无任何 import 语句）——消费方的 bundler **无法摇掉 Prism（~80KB 白付）**。对策（该会话已选定方案 A）：本仓库提供 **pd-only 子入口** `@andares/pdeditor/pd`。

**headless 完备性核查结论（已确认，无需补 API）**：

- 公共面：`createPdEditor(el, { value, language, lineNumbers, styles, indentUnit, highlight, onValueChange })` → 实例 `setValue / getValue / setLanguage / destroy / textarea`
- 组件即 headless 本体（无 UI/chrome 假设，styles 由外部注入，README 已有排版两维度约束）；`textarea` 逃生舱覆盖 focus/selection 等剩余需求；44 例测试覆盖行为。完备。

**树摇结论（写进文档的口径）**：两个入口产物均预打包自包含（无 bare import），消费方 bundler 不需做模块级摇树——**选择入口即完成裁剪**：`/pd` 产物本身不含 Prism，进 bundle 的只有 yace+插件+tokenizer+debounce（~20KB 级）；全量入口含 Prism 是其语义（要用 md/xml/json/yaml 就需要它）。

## Approach

**入口机制澄清（同包不发包）**：不新增 npm 包。npm `exports` 子路径是包内多入口的标准机制——发布时还是同一个 `@andares/pdeditor`（版本号、安装命令都不变），包里多带一个 `dist/pd.js` 文件；`package.json` 的 `exports` 字段声明 `"./pd"` 子路径后，消费方 `import { createPdEditor } from "@andares/pdeditor/pd"` 会解析到这个精简文件（不含 Prism），打包器只把它进 bundle。不用子路径的存量用户不受任何影响。

- **源码拆三份**：`core.ts`（类型 + 工厂 `createCoreEditor(el, options, getHighlighter)`，highlighter 按 lang 注入——构造与 `setLanguage` 共用同一注入点）、`index.ts`（全量入口：pd 自研 + 其余走 Prism）、`pd.ts`（仅 pd：其余语言回退纯文本 `escapeHtml`，BYO `options.highlight` 仍可覆盖）。现有工厂逻辑**原样搬移不改行为**。
- **双入口自包含构建**：现有 vite.config（entry index，emptyOutDir:true）+ 新 `vite.pd.config.ts`（entry pd，emptyOutDir:false），build 脚本串联两次 vite + `tsc --emitDeclarationOnly`（dist 已是按模块 d.ts 布局，pd.d.ts 自然加入）。不共享 chunk、不做 code splitting——每个入口一个完全自包含文件，对消费方最稳。
- **package.json**：`exports` 加 `"./pd"`（types/import/require 三条件）与 `"./package.json"`；加 `"sideEffects": false`；**yace/prismjs/@types/prismjs/es-toolkit 从 dependencies 移到 devDependencies**（dist 自包含无 bare import，消费方 npm install 不再拉取用不到的 prismjs/yace；由守卫测试保证不会出现"dist 引了但没装"的断链）。
- **不发版、不 bump 版本**（AGENTS Git 权限边界：发版由用户操作）。
- 主 README 链接用 GitHub master 分支绝对 URL（GitHub 页/npm 包页/任意 markdown 渲染处均可点）。

## Files to modify

| 文件 | 操作 |
| --- | --- |
| `packages/editor/src/core.ts` | 新建：`EditorLang`/`PdEditorOptions`/`PdEditorInstance` 类型 + `createCoreEditor` 工厂（现 index.ts 全部实现原样搬入，highlighter 改注入）+ `escapeHtml` 导出 |
| `packages/editor/src/index.ts` | 重写为薄层：Prism 版 builtinHighlighter + `createPdEditor` 组合 + 类型 re-export |
| `packages/editor/src/pd.ts` | 新建：pd-only builtinHighlighter（pd→`highlightPd`，其余→`escapeHtml`）+ `createPdEditor` + 类型 re-export |
| `packages/editor/vite.pd.config.ts` | 新建：lib 模式 pd 入口，`emptyOutDir: false`，产物 `pd.js`/`pd.cjs` |
| `packages/editor/vite.config.ts` | 注释更新（双入口说明） |
| `packages/editor/package.json` | exports 加 `./pd`、`./package.json`；`sideEffects: false`；runtime deps → devDependencies；build 脚本串联 |
| `packages/editor/test/pd-entry.test.ts` | 新建：从 `../src/pd` 导入——创建/高亮/setLanguage 回退纯文本/destroy |
| `packages/editor/test/bundle-guard.test.ts` | 新建：dist 存在时断言 `pd.js`/`pd.cjs` 无 prism 痕迹、无 bare import/require；`index.js` 含 prism（sanity）；dist 缺失时 skip |
| `packages/editor/README.md` | 新章节「入口选择与 tree-shaking」：两入口对照表（能力/体积/语义）、import 示例、自包含与"选入口即裁剪"口径、BYO highlight 说明 |
| `README.md`（主包） | 生态章节 pdeditor 行补链接：`https://github.com/andares/promptdown/tree/master/packages/editor`（markdown 链接，GitHub/npm 均渲染） |
| `tmp/pdeditor-implementation.md` | 补本轮记录（双入口架构 + deps 归位 + 守卫测试） |

## Reuse

- `createPdEditor` 工厂全部现有逻辑（撤销重做/组合期渲染/插件编排）原样搬 `core.ts`，仅 builtinHighlighter 从硬编码改为注入参数
- `pd-highlight.ts` / `inline.ts` / `plugins.ts` 两入口共用，不动
- `highlighters.ts`（Prism）仅 `index.ts` 引用，`pd.ts` 不引——这是 Prism 隔离的全部机制
- `escapeHtml` 统一放 `core.ts` 导出（index.ts/pd.ts 共用；highlighters.ts 内已有的那份留原地不动，避免动静过大）

## Steps

- [ ] 1. `src/core.ts`：搬入类型 + 工厂（签名 `createCoreEditor(el, options, getHighlighter: (lang: EditorLang) => Highlighter)`；构造与 setLanguage 都经 getHighlighter 解析）+ escapeHtml/commonPrefixLen
- [ ] 2. `src/index.ts` 薄化：Prism 版 getHighlighter（现 builtinHighlighter 逻辑）+ `createPdEditor = (el, o) => createCoreEditor(el, o, getHighlighter)` + 类型 re-export
- [ ] 3. `src/pd.ts`：pd-only getHighlighter（非 pd → escapeHtml）+ 同名 `createPdEditor` + 类型 re-export；文件头注释说明语义（仅 pd 高亮，其余语言纯文本，BYO 可覆盖）
- [ ] 4. `vite.pd.config.ts` 新建 + `vite.config.ts` 注释；`build` 脚本改 `vite build && vite build --config vite.pd.config.ts && tsc --emitDeclarationOnly`
- [ ] 5. `package.json`：exports（`.`、`./pd`、`./package.json`）、sideEffects、deps → devDependencies
- [ ] 6. `test/pd-entry.test.ts` + `test/bundle-guard.test.ts`
- [ ] 7. 跑 `pnpm --filter @andares/pdeditor typecheck && pnpm --filter @andares/pdeditor build && pnpm --filter @andares/pdeditor test`（44 + 新例全绿）
- [ ] 8. scratch 消费者验证（tmp/ 下临时目录，不入库）：`npm install file:../packages/editor` → ① `node -e "import('@andares/pdeditor/pd')"` 验证 exports 子路径解析；② 最小 vite 项目引 `/pd` 入口构建，断言产物无 prism、体积 ~20–30KB 级
- [ ] 9. editor README 新章节 + 主 README 链接
- [ ] 10. `build:demo`（AGENTS 规则）+ 主包 `pnpm typecheck && pnpm test` 复核 + 实施文档补记
- [ ] 11. 提交（仅 commit，不 push 不发版）

## Verification

- 组件 typecheck + 全部测试绿（含新 pd-entry 与 bundle-guard 用例）
- `ls dist/`：`pd.js`/`pd.cjs`/`pd.d.ts` 与 index 系列并存；`grep -ci prism dist/pd.js` = 0
- scratch 消费者：子路径 import 解析成功；vite 构建产物无 prism、体积明显小于全量（记录数字进实施文档）
- `demo-dist/` 重建；主包 193 测试无回归
- `git log` 仅新增 commit，无 push/tag
