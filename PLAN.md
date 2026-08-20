# Plan: demo 实装格式化 + JSON↔PD 转换按钮

## Context

headless 包 `@andares/pdeditor`（v0.2.0）本身不含格式化/转换语义（AGENTS.md 已注明，属成品层方向）。
但 demo 页是开发/演示环境（`demo-dist` 为本地产物，gitignored 不入库、不进 npm 包），
可以直接 import 主包源码调 `format` / `pdToJsonText` / `jsonToPdText`，走 `setValue` 回写——
这正好实装 AGENTS.md 里写的"外部框架可自行调主包 format 后 setValue 回写"的接入方式。

## 探索发现

- 主包核心函数均为纯逻辑、无 vscode 依赖，浏览器内可跑：
  - `format(text: string): string` — src/format.ts L211
  - `pdToJsonText(text, selector?, fileStem?): string` — src/pdtransform.ts（解析错误 throw 带行号；多段未指定段 throw）
  - `jsonToPdText(jsonText): { pd, warnings }` — src/jsonToPd.ts
- 主包**无 exports 字段**、main 指向 `dist/extension.js`（import 会拉 vscode）→
  demo 不能 import 已发布包，正确姿势是**相对路径直引源码**：`import { format } from "../../../src/format"`
  （demo 在 packages/editor/demo/，到仓库根 src 需三级向上）。
  跨 workspace 源码引用 vite 直接编译 bundle，无碍。
- editor 的 tsconfig include 仅 `src`，bundle-guard 只查 dist 产物 → demo 引主包不影响 typecheck / test / lib 构建 / 发布。
- demo 现状：`demo/index.html` 已有 #fmt 按钮（无操作）；`demo/main.ts` 有 `createPdEditor` 实例 + 语言切换 select + status 区。

### 宽容度答案（json→pd）

**宽容模式，不报错**。仅两种输入抛错：非有效 JSON（"不是有效的 JSON 文本"）、JSON 根不是对象。
其余不匹配内容逐条收集到 `warnings`（不中断、不整体失败）：

| 不匹配情形 | 处理 |
| --- | --- |
| number / boolean / null | 转文本 `key: 123` + 警告（不丢弃） |
| 键名不符合规则（含冒号/空白结尾等） | 丢弃 + 警告 |
| 数组（非 InfoN/CodeN） | 丢弃 + 警告 |
| 顶层 InfoN 键 | 丢弃 + 警告 |
| 空字符串 / 多行字符串 / 首尾空白字符串 | 丢弃 + 警告 |
| Info 编号不连续或相邻段 | 丢弃 + 警告 |
| InfoN 内对象/数组元素 | 丢弃 + 警告 |
| 内容形似围栏/段标记/分隔线 | 丢弃 + 警告 |
| 空对象 | 渲染为裸 `key:`（保留） |

pd→json 相反：**严格**，解析错误直接 throw（带行号），多段未指定段也 throw。

## Approach

demo 直引主包源码，实装两个按钮：

1. **格式化（pd）**：`editor.setValue(format(editor.getValue()))`；非 pd 语言点击提示"仅 pd 支持格式化"。
2. **转换 JSON ↔ PD**（按钮文案待定）：按当前语言决定方向
   - pd → json：`pdToJsonText(value)` → try/catch，成功 `setLanguage("json")` + `setValue(json)`；
     多段（splitSections 数量 > 1）→ 报错显示段名列表，说明 demo 仅支持单段转换（与 VSCode 选段语义一致，demo 无选段 UI）
   - json → pd：`jsonToPdText(value)` → 成功 `setLanguage("pd")` + `setValue(format(result.pd))`；warnings 合并显示到 status
   - md / xml / yaml：提示"仅 pd / json 支持转换"
   - 来回转换语义与原样（json 侧是 2 空格缩进的 prettier json，可再转回）

## Files to modify

- `packages/editor/demo/index.html` — 新增转换按钮（#transform）
- `packages/editor/demo/main.ts` — import 主包源码 + 两个按钮实装 + 错误/警告展示

## Reuse

- `src/format.ts` → `format`
- `src/pdtransform.ts` → `pdToJsonText`
- `src/jsonToPd.ts` → `jsonToPdText`（含 warnings）

## Steps

- [ ] demo/index.html 添加转换按钮（保留现有 #fmt，改注释/文案）
- [ ] demo/main.ts import 三函数（相对路径 `../../src/...`）
- [ ] fmt 按钮实装：pd 才执行，非 pd 提示
- [ ] transform 按钮实装：方向判定按当前语言；pd→json 多段处理见待定项；json→pd 合并 warnings 到 status
- [ ] 转换后 setLanguage 同步高亮（pd↔json）

## Verification（已执行，全部通过）

- `pnpm --filter @andares/pdeditor typecheck && test` ✓（52 tests，含新增 demo-smoke）
- `pnpm --filter @andares/pdeditor build:demo` ✓ 重建 demo-dist（244 modules，61KB js）
- 逻辑等价验证：临时 tsx 脚本直跑主包函数——多段检测/报错含段名、宽容度 6 条警告不中断、单段回环无警告、格式化全角→半角 ✓
- 永久测试 `test/demo-smoke.test.ts`：jsdom 下 DOM 事件驱动 demo 按钮——多段报错、pd↔json 来回回环一致、语言切换同步、fmt 非 pd 提示、md/xml/yaml 不支持转换 ✓
- demo 产物已重建（demo-dist/index.html 含 transform 按钮）。**不 commit**（plannotator 约束：留工作区脏）

## 决策（已确认）

- 多段 pd 点"转换 JSON" → **报错提示选段**：status 显示 `文件包含 2 个 pd 段（基础设定, 主任务），demo 转换仅支持单段，请先展开`（与 VSCode 一致，demo 无选段 UI）
- **不 commit**（plannotator 约束：留工作区脏，等用户 review 后自行处理）