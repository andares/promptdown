# 人工回归测试清单

> 面向：一次含 **共享语义包迁移（@andares/pdfoundation）+ editor 语义导出 + 扩展 esbuild 打包** 的版本发布。
> 自动门禁（typecheck/test/build/VSIX 内容）已覆盖的部分仍建议人工冒烟确认，尤其是标 ⚠️ 的**本轮真正改动的路径**。
>
> 测前基线：`pnpm typecheck && pnpm test`（主包 20）·`pnpm --filter @andares/pdfoundation test`（173）·`pnpm --filter @andares/pdeditor test`（53）全部通过。

---

## 1. VSCode 扩展层 ⚠️ 最高优先级

> `dist/extension.js` 从 tsc 散模块改为 **esbuild 单文件 bundle**（本轮最大回归面）：激活路径、模块作用域、`require("vscode")` 解析都变了，只有装进真实编辑器才能证明。

- [ ] `pnpm package` 生成 `promptdown-<version>.vsix` → 拖进 VSCode 扩展页安装
- [ ] 打开任意 `.pd` 文件，**确认扩展正常激活**（无 "Activating extension failed"，状态栏/输出面板无红色报错）
- [ ] 命令面板 `PD格式转换`（pd→json）：
  - 单段 pd → 直接新开 Untitled JSON（preview + 侧边）✅
  - 多段 pd（含 `//!pd 命名` 与匿名段）→ 弹 **QuickPick 选段**（`%序号 [段名]`）；取消则不动 ✅
  - 语法错误 pd（如顶层缩进的 `<code>- </code>`）→ 报错信息带行号，不炸编辑器
- [ ] JSON 文档再跑 `PD格式转换` → 原地变回 pd（可 Ctrl+Z 撤销，语言自动切 promptdown）✅
- [ ] 保存自动格式化（`registerDocumentFormattingEditProvider`）：全角冒号→半角、顶层 `<code>- </code>` 缩进修正、行尾空白清理
- [ ] `PD编译分段`：当前 pd 选中段 → 编译为新 Untitled（引用内联展开）✅
- [ ] 编辑行为回归：
  - 回车续行（序列项行自动补 `<code>- </code>`；普通行保留缩进）
  - Tab 键：序列项行整行缩进 / Shift+Tab 缩出
- [ ] 语法高亮：key/value / `- item` / `//!pd` section / 围栏 / `:ref` 引用配色正常
- [ ] 内联代码 `` `a: b` `` 行内冒号**不**触发键值色

---

## 2. npm 层（发布链路 + 消费姿态）

> ⚠️ 主包新增 `dependencies: @andares/pdfoundation`（runtime 依赖）；共享包独立版本、独立发布、**不在 release-all 范围**。

- [ ] `npm pack --dry-run`（主包）→ 清单：**不含 packages/**、不含 node_modules、含 dist + skill ✅
- [ ] **发布顺序**（顺序错了会发布失败/装不到依赖）：
  1. `pnpm release-foundation patch`（纯 npm，无 git 操作；`--dry-run` 先预览）
  2. 主包 `pnpm release <patch>` →（release-all 则再打 VSIX）
  3. `pnpm release-editor patch`
- [ ] 临时目录 `npm i @andares/pdfoundation` → `import { format, pdToJsonText, jsonToPdText, compilePdText, splitInlineCode }` 全部可用且行为正确
- [ ] 临时 vite 项目 `npm i @andares/pdeditor @andares/pdfoundation` → 引 `/pd` 入口，`vite build` 验证：产物**无 Prism**、语义可 tree-shake、能跑
- [ ] **主包回滚预案**：发布失败 → `git tag -d vX.Y.Z && git reset --hard HEAD~1`

---

## 3. editor 层（@andares/pdeditor）

> ⚠️ 双入口 re-export `format / jsonToPdText / pdToJsonText`（+ 自研 `highlightPd`），**external + peer** `@andares/pdfoundation`，产物零体积、不内联。

- [ ] `pnpm --filter @andares/pdeditor build:editor`（lib 双入口 + demo 重建）无报错
- [ ] `pnpm --filter @andares/pdeditor test`（53 用例，含 bundle-guard：pd 入口仅豁免 `@andares/pdfoundation` 一个 bare import）
- [ ] **消费验证（node 直查 dist）**：

  ```bash
  node -e "const m=require('./packages/editor/dist/pd.cjs'); \
    ['createPdEditor','highlightPd','format','pdToJsonText','jsonToPdText']\
    .forEach(k=>console.log(k, typeof m[k]))"
  # 五项全为 function；format('任务：x')→'任务: x' 说明 peer 语义已解析
  ```
- [ ] 打开 `demo-dist/index.html`（file:// 直接开）：
  - 格式化按钮：全角冒号 → 半角、`已是最佳格式` 幂等提示
  - 转换按钮：单段 pd↔json **来回一致**；多段 pd → 报错列段名（"demo 仅支持单段"）
  - 语言切换（pd/md/xml/json/yaml）高亮跟随
  - 中文 IME 组合期不丢字（拼音选字过程中覆盖层一致）

---

## 4. CLI / 基准层

- [ ] `printf '任务：x\n约束:\n- 只输出 JSON\n' > /tmp/t.pd`
  - `node dist/cli.js /tmp/t.pd` → 输出格式化 JSON ✅
  - `node dist/format-cli.js /tmp/t.pd -w` → 全角→半角、键值规范化并**写回** ✅
  - `node dist/compile-cli.js %1 a.pd b.pd…` → 跨文件合并选段、引用展开 ✅
- [ ] 多段 `node dist/cli.js`（不指定段）→ 报错列段名
- [ ] `pnpm perf` → 基准正常输出（format 25ms 量级/2099 行；import 已指向共享包）

---

## 5. Helix（hx）层

> 四端一致性的显示层。本轮**零语法改动**（`tree-sitter-promptdown/` 无变更），理论不受影响——回归确认"语义挪动没悄悄破坏四端承诺"。

- [ ] `pnpm hx-install`（幂等）→ 无报错，`hx --grammar build promptdown` 成功
- [ ] 打开 `.pd`：section / key / value / 序列项高亮正常
- [ ] 边界一致（对照差异表）：
  - `a : b` / `a:b` → 非键值（不一色）
  - `clock:- 12:30` → `clock:` 键 + `- 12:30` 内容（`:-` 转义生效）
  - `` `a: b` `` 行内代码内冒号不触发键值
- [ ] (可选) 有 tree-sitter CLI：`npx tree-sitter test`（`tree-sitter-promptdown/test/` corpus）

---

## 6. 收尾 / 提交

- [ ] `git status` 复核：应无意外文件（vsix/tgz/generated 均 gitignored）
- [ ] 提交建议（可分 4 笔，conventional commits）：
  1. `feat: 共享语义包 @andares/pdfoundation（parser/format/转换，主包与 pdeditor 共用）`
  2. `refactor: 主包壳层依赖共享语义包 + 扩展 esbuild 自包含打包`
  3. `feat: editor 双入口 re-export 语义 API（external + peer）`
  4. `docs: 多端架构/发布流程/TEST-CHECKLIST 同步`
- [ ] 历史遗留：根目录 `promptdown-0.0.0-test.vsix` / `0.7.0` / `0.8.0` 已 gitignored，可顺手 `rm` 清理

---

## 快速失败判定（若下列出现即为回归）

| 现象 | 归因指向 |
| --- | --- |
| VSIX 安装后激活报错 / 命令消失 | 扩展 bundle 断链（§1） |
| 装了 VSIX 但 `PD格式转换` 说找不到模块 | dist 未自包含（§1/§2） |
| npm 装主包后 CLI 报 `Cannot find module '@andares/pdfoundation'` | 发布顺序错 / 主包 tarball 缺 deps（§2） |
| editor 消费端 import 语义函数 undefined | peer 未装 / 产物被误内联（§3） |
| `pnpm perf` 报模块解析错误 | perf import 未跟随迁移（§4） |
