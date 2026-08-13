# 修复：Tab 缩进后光标跑到 `-` 左边

## Context

用户报告：序列项行按 Tab 缩进后，**光标移动到了 `-` 的左边**，后续输入会把文字插到 `-` 之前，破坏列表结构，"完全没法使用"。

**根因**（`src/extension.ts` 的 `indentLines`）：

当前实现用**整行替换**完成缩进+规范化：

```ts
edit.replace(new vscode.Range(line, 0, line, text.length), unit + body);
```

VSCode 编辑调整规则：光标位于被替换范围内时，会被挪到替换区**起点**（行首 col 0）。随后的 `.then()` 又按 `origCols[i]`（**缩进前的绝对列号**）把光标拉回去——但行内容已经整体右移了一个缩进单位，绝对列号不再对应原来的文本位置：

- 典型场景：新续的 `-`（光标在 col 2）按 Tab → 行变 ` - `（`-` 在 col 4），光标被还原到 col 2 = **`-` 左边**，输入即破坏条目
- 行尾输入场景同理：`- foo` 光标在行尾 col 5，缩进后光标落在 `- foo` 的 col 5（`-` 右侧空格处），无法继续在行尾输入

## Approach

**不再整行替换，改为每行两个互不重叠的 TextEdit，一次 `editor.edit()` 完成**：

1. `insert` 缩进单位到 `(line, 0)`（行首）
2. `replace` 把 `-` 后的空白段 `[start, end)` 替换为单个半角空格（仅当需要规范化时）

**为什么能修好光标**：VSCode 对"插入点位于光标之前"的编辑，会自动把光标**右移 unit 长度**（跟随文本）；光标恰好在插入点（col 0）时不受影响（保持 col 0）。这正是原生 `editor.action.indentLines` 的光标语义——零恢复代码，`.then()`/`origCols`/`editor.selections =` 全部删除。

光标行为矩阵（unit=4）：

| 场景 | 缩进前 | 缩进后 | 光标 |
| --- | --- | --- | --- |
| 续行后直接 Tab | `-`（col 2） | ` - ` | col 6（行尾，可继续输入）✅ |
| 行尾输入中 Tab | `- foo`（col 5） | `- foo` | col 9（行尾）✅ |
| 行首 col 0 Tab | `- foo`（col 0） | `- foo` | col 0（保持，连续 Tab 可嵌套）✅ |
| 多空白收拢 | `-   x`（col 5） | `- x` | col 7（行尾）✅ |
| 裸 `-` | `-`（col 1） | ` - ` | col 6（行尾）✅ |
| `-foo`（只缩进不规范化） | col 4 | `-foo` | col 8（行尾）✅ |

## Files to modify

- **`src/extension.ts`**：重写 `indentLines`（两段式 edit，删掉 `.then()` 光标还原）；import 从 `normalizeListItem` 换成 `listItemWsRun`；行集合用 `new Set(lines)` 去重（防同一行重复编辑报 "overlapping edits"）
- **`src/tab.ts`**：把整串变换的 `normalizeListItem` 替换为返回空白段列区间的 `listItemWsRun(line)`（extension.ts 需要精确 Range 才能做小范围 replace）：

  ```ts
  export interface ListItemWsRun {
      dash: number;       // `-` 所在列
      start: number;      // 空白段起点（`-` 后一列）
      end: number;        // 空白段终点（含）；start === end 表示无空白
      normalize: boolean; // 需把 [start, end) 替换为单个半角空格
  }
  ```

  判定矩阵：`- foo`→normalize=false（已是单空格）；裸 `-`→true；`-   x`/`-\tx`→true；`-foo`/`---`→false（`-` 后直接跟内容）；非序列项行→null
- **`test/tab.test.ts`**：`normalizeListItem` 测试换成 `listItemWsRun` 区间+flag 断言（覆盖上表矩阵）；`isListItemLine`、`tabUnit` 测试不变

## Reuse

- `isListItemLine`（`src/tab.ts`）— 分支 ② 判定与规范化门控，不动
- `tabUnit`（`src/tab.ts`）— 缩进单位，不动
- `LIST_ITEM_RE` — `listItemWsRun` 沿用同构正则 `^([\s]*)-([\s]*)(.*)$`

## Steps

- [ ] `src/tab.ts`：`normalizeListItem` → `listItemWsRun`（含类型导出与注释更新）
- [ ] `src/extension.ts`：`indentLines` 改为「行首 insert unit + 空白段 replace 单空格」，删除 `.then()` 光标还原；更新 import；`lines` 去重
- [ ] `test/tab.test.ts`：新增 `listItemWsRun` 测试组，删 `normalizeListItem` 测试组
- [ ] 门禁：`pnpm typecheck && pnpm test && pnpm build`

## Verification

- 单测：`listItemWsRun` 全矩阵断言（含 null 与非序列项行）；全部 73+ 用例通过
- 手工（VSCode F5 扩展宿主）：按上表逐行验证光标落点——重点：续行 `-` 后 Tab 光标停在行尾可继续输入；col 0 连续 Tab 光标不动；`-   x` 收拢后光标在行尾
- 确认无 `.then()` 异步光标代码残留（回归面：跨行多选分支同样走 `indentLines`）
