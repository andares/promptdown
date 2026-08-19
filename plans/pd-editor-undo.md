# pdeditor 撤销/重做修复 + 调试残留清理

## Context

v0.8.1 发布后的 editor 开发中，撤销/重做功能处于半成品状态：

1. **双重撤销机制冲突（核心 bug）**：`packages/editor/src/index.ts` 的 plugins 数组仍带 Yace 的 `history({ limit: 3 })` 插件，同时又自实现了 `undoStack/redoStack`（onKeyDown 处理 Ctrl+Z/Y）。调试实验已证实冲突：按 Ctrl+Z 时 Yace 的 keydown 插件管线先执行，history 插件返回历史快照 → `update("ab\n")` → onUpdate 回调把快照错误压入自实现栈 → 自实现 onKeyDown 再撤销 → 值回弹（撤销无效，`editor.test.ts` 的 history 用例失败）。
2. **当初弃用 Yace history 的根因**：它有初始快照缺陷——首次 input 事件才记快照，初始值被覆盖，撤销退不到初始内容。自实现则初始值恒在栈底。
3. **调试残留**：`index.ts` 里 pushHistory/onKeyDown 有 `process.stderr.write` + `console.log`，还有一个 capture 阶段注册的 `debugTrace` 监听器（destroy() 未移除）；`test/order-debug.test.ts` 是调试测试文件。
4. **文档缺失**：`packages/editor/README.md`「内置编辑行为」没有撤销/重做条目。

用户要求：一次性全部处理，**最后不提交**（保持工作树未提交状态）。

## Approach

- 撤销/重做只保留**自实现**这一套：从 plugins 数组移除 Yace history 插件并删除其 import。移除后 keydown 时 Yace 的插件管线无响应，`update(ta.value)` 与 `this.value` 相同、不触发回调、不污染自实现栈，自实现 onKeyDown 即可正常工作。
- **不做输入合并（coalesce）**：每次 input 压一步（粘贴算一步）。理由：用户需求是"3 步记忆就行"的轻量语义；做 300ms 合并需要 fake timers 改造测试，收益低。此取舍记录在案，未来可升级。
- 清理全部调试代码与调试测试文件。
- 按 AGENTS.md 规则重建 demo；主包门禁复核；更新实施文档。

## Files to modify

| 文件 | 操作 |
| --- | --- |
| `packages/editor/src/index.ts` | 移除 history import 与 plugins 里的 `history({ limit: 3 })`；删 pushHistory/onKeyDown 里的 stderr/console.log；删 debugTrace 定义与注册；更新撤销注释（说明唯一机制为自实现） |
| `packages/editor/test/order-debug.test.ts` | 删除（调试文件） |
| `packages/editor/test/editor.test.ts` | 清理 history 用例中过时的 `Object.defineProperty(ev, "timeStamp", ...)` 与"避免 coalesce 合并"注释（自实现无 coalesce） |
| `packages/editor/README.md` | 「内置编辑行为」补撤销/重做条目 |
| `tmp/pdeditor-implementation.md` | 9.5 节补撤销/重做记录：Yace history 初始快照缺陷、双重机制冲突根因（keydown 插件管线污染栈）、自实现设计（初始值栈底 / 3 步 / setValue 与撤销本身不入栈 / 新输入清空重做 / 无 coalesce 取舍） |

## Reuse

- 自实现撤销的全部现有代码（`undoStack/redoStack/pushHistory/applyValue/onKeyDown`）已存在于 `index.ts`，仅去调试与去冲突，无需新逻辑。
- 测试断言沿用 `editor.test.ts` 现有 history 用例（撤销两次到初始 `"a\n"` → redo → Ctrl+Y），与自实现语义一致。

## Steps

- [ ] 1. `index.ts`：删 `import { history } from "yace/plugins"`，plugins 改为 `[pdListItem(), pdTab(indentUnit)]`
- [ ] 2. `index.ts`：删 pushHistory / onKeyDown 里的 `process.stderr.write` + `console.log` 调试输出
- [ ] 3. `index.ts`：删 `debugTrace` 函数定义及其 `forEach` 注册（capture 监听器）
- [ ] 4. `index.ts`：更新撤销注释块（自实现是唯一机制；移除"Yace history"共存描述）
- [ ] 5. 删除 `test/order-debug.test.ts`
- [ ] 6. `editor.test.ts`：history 用例去掉 timeStamp defineProperty 与 coalesce 注释，保留事件序列与断言
- [ ] 7. `README.md`：「内置编辑行为」补一条——**撤销/重做**：Ctrl+Z 撤销 / Ctrl+Shift+Z 与 Ctrl+Y 重做，3 步记忆；初始内容恒可退回；程序化 `setValue` 不入栈；新输入使重做失效
- [ ] 8. 跑组件门禁：`pnpm --filter @andares/pdeditor typecheck && pnpm --filter @andares/pdeditor test`（预期 history 用例恢复通过，全部用例绿）
- [ ] 9. 重建 demo：`pnpm --filter @andares/pdeditor build:demo`（AGENTS.md 规则：editor 功能改动后必须重建）
- [ ] 10. 主包门禁复核：根目录 `pnpm typecheck && pnpm test`（主包 src/ 零改动，预期 193 用例绿）
- [ ] 11. 更新 `tmp/pdeditor-implementation.md` 9.5 节（撤销/重做记录）
- [ ] 12. 确认**不提交**：全部改动留在工作树

## Verification

- `pnpm --filter @andares/pdeditor test` 全绿，其中 history 用例：两次 Ctrl+Z 后 `getValue() === "a\n"`（退到初始值）、Ctrl+Shift+Z 恢复 `"ab\n"`、Ctrl+Y 恢复 `"abc\n"`
- `grep -rn "process.stderr.write\|console.log\|debugTrace" packages/editor/src/` 零匹配；`test/order-debug.test.ts` 不存在
- `demo-dist/` 内产物时间戳新于 `src/`（demo 已重建）
- 根目录 `pnpm typecheck && pnpm test` 绿（193 用例，主包无回归）
- `git status` 显示改动仍在工作树（未提交、未暂存提交动作）
