# pd 编辑器新功能：pd2json 命令 + `-` 列表续行

## Context

promptdown 扩展目前只提供语法高亮、格式化与 `//!pd` 自动检测；`pd2json` 仅作为 CLI 存在。用户希望：

1. **pd2json 命令**：在 VSCode 命令面板（Ctrl+Shift+P 顶部搜索条）输入 `pd2json` 即可调出（带说明文字），把当前打开的 PD 文档解析成 JSON，**新开一个 untitled 文件**填入结果（不覆盖原文档）。执行前需判断：焦点是否在编辑窗口、当前文档是否 PD 格式（宽松判断即可）；错误用 VSCode 通用 API（`showErrorMessage`）提示。**不绑默认热键**。
2. **`-` 列表续行**：像 Markdown 一样，在 pd 文件的 `-` 序列条目行尾按回车时，新行自动补上 `-`，并保持原行缩进（缩进本身现在没问题，只需加 `-`）。

## 考据结论（已确认）

- **命令面板可搜索性**：`contributes.commands` 里 title 含 `pd2json` 即被"顶部搜索条"命中；不配 keybindings 即无默认热键。
- **untitled 新文件**：`vscode.workspace.openTextDocument({ language: "json", content })` 创建 untitled 文档，`showTextDocument` 展示；原文档不变。
- **激活事件**：扩展已显式声明 `activationEvents`，命令被调用时不会自动激活，需补 `"onCommand:promptdown.pd2json"`。
- **列表续行机制**：`language-configuration.json` 的 `onEnterRules` 是标准声明式方案（VSCode 官方 Language Configuration Guide；自 1.63 起内置扩展也用它）。语义：`action.indent: "none"` = 新行继承当前行缩进；`appendText` 在缩进后追加。
  - 注：VSCode 自带 markdown 其实**没有**原生列表续行（这是 Markdown All in One 存在的原因），但 `onEnterRules` 正是这类需求的官方机制。
- **onEnterRules 生效条件**：`editor.autoIndent` 开启（默认）时生效；仅对 promptdown 语言文件生效，不影响其他语言。

## Feature 1：pd2json 命令

### 1. `package.json`

```json
"activationEvents": [
  "onLanguage:promptdown",
  "onDidOpenTextDocument",
  "onDidChangeTextDocument",
  "onCommand:promptdown.pd2json"
],
"contributes": {
  "commands": [
    {
      "command": "promptdown.pd2json",
      "title": "pd2json: 将当前 PD 文档解析为 JSON（新开 Untitled 文件）"
    }
  ]
}
```

不加 `keybindings`（用户明确不要默认热键）。

### 2. 新建 `src/pd2json.ts`（纯函数，不依赖 vscode API，可单测）

复用 CLI 完全相同的解析管线（`expand → lex → parse → toJson`）：

```ts
import { expand, splitSections } from "./parser/expand";
import { lex } from "./parser/lexer";
import { parse } from "./parser/parser";
import { toJson } from "./parser/toJson";

/** pd 文本 → 格式化 JSON 字符串；解析错误/多段未选段时抛错 */
export function pdToJsonText(text: string, section?: string): string {
  const expanded = expand(text, section);
  const doc = parse(lex(expanded));
  if (doc.errors.length > 0) {
    throw new Error(doc.errors.map(e => `第${e.lineNo}行: ${e.message}`).join("；"));
  }
  return JSON.stringify(toJson(doc), null, 2);
}

export function isPdFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".pd");
}

/** 列出全部段名（含裸 `//!pd` 的空名）；供多段文件 QuickPick 用 */
export function sectionNames(text: string): string[] {
  return splitSections(text).map(s => s.name);
}
```

（`splitSections` 已在 `src/parser/expand.ts` 导出，直接复用，不重复实现。）

### 3. `src/extension.ts`：注册命令

```ts
context.subscriptions.push(
  vscode.commands.registerCommand("promptdown.pd2json", async () => {
    // ① 焦点判断：无活动编辑器 → 报错返回
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("pd2json: 当前没有活动编辑器，请先在编辑窗口打开 PD 文档");
      return;
    }
    // ② 宽松 PD 判断：语言已识别 OR 文件名 .pd OR 内容含 //!pd 段标记（与自动检测同源）
    const doc = editor.document;
    const isPd = doc.languageId === PD_LANGUAGE
      || isPdFileName(doc.fileName)
      || detectPdIntent(doc.getText());
    if (!isPd) {
      vscode.window.showErrorMessage(`pd2json: 当前文档不是 PD 文档（语言: ${doc.languageId}）`);
      return;
    }
    // ③ 多段文件：弹 QuickPick 选段（取消则静默返回）；单段/隐式段直接跳过
    const names = sectionNames(doc.getText());
    let section: string | undefined;
    if (names.length > 1) {
      const pick = await vscode.window.showQuickPick(names.map((n, i) => ({
        label: n || "(未命名段)",
        index: i,
      })), { placeHolder: "文件包含多个 //!pd 段，请选择要转换的段" });
      if (!pick) return;
      section = names[pick.index];
    }
    // ④ 解析（错误 → showErrorMessage）
    let json: string;
    try {
      json = pdToJsonText(doc.getText(), section);
    } catch (e) {
      vscode.window.showErrorMessage(`pd2json: ${(e as Error).message}`);
      return;
    }
    // ⑤ 新开 untitled JSON 文件（preview 模式 + 侧边打开，原文档不动）
    const untitled = await vscode.workspace.openTextDocument({ language: "json", content: json });
    await vscode.window.showTextDocument(untitled, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  }),
);
```

- **多段文件（已确认）**：弹 `showQuickPick` 让用户选段；取消则静默返回。同名段取第一个（`names[pick.index]`，与 `expand` 的 `selectSection` 按名取首个语义一致）。
- 解析输出与 CLI `pd2json` 完全一致（`JSON.stringify(..., null, 2)`）。

### 4. 新建 `test/pd2json.test.ts`（node:test，复用现有设施）

| 用例 | 期望 |
| --- | --- |
| 单段隐式段 → 完整 JSON（深比较，对齐 `test/fixtures/*.pd`） | 与 `toJson` 直接输出一致 |
| 多段不指定段名 | `pdToJsonText` 抛错（含"必须指定段名"）——纯函数保持 CLI 语义，QuickPick 只在命令层处理 |
| 多段指定段名 | 只输出该段 JSON |
| 语法错误（如顶层缩进 `-`） | 抛错，message 含行号与原因 |
| `sectionNames`: 单段隐式 / 两段 / 含裸 `//!pd` | `[""]` / `["a","b"]` / `[""]` |
| `isPdFileName("a.pd")` / `"A.PD"` | true / true |
| `isPdFileName("a.md")` / `"a.pd.txt"` / `"Untitled-1"` | false |

## Feature 2：`-` 列表续行

### `language-configuration.json` 追加

```json
"onEnterRules": [
  {
    "beforeText": "^\\s*-\\s*$",
    "action": { "indent": "none", "appendText": "" }
  },
  {
    "beforeText": "^\\s*-\\s+.*$",
    "action": { "indent": "none", "appendText": "- " }
  }
]
```

行为矩阵：

| 场景 | 结果 |
| --- | --- |
| `- foo`（光标行尾）回车 | 新行 `-` |
| `- foo`（有缩进）回车 | 新行 ` - `（缩进继承，正是用户要的"缩进没问题，只补 `-`"） |
| `- key: value`（带-键值）回车 | 新行 `-`（它也是序列条目，行为一致） |
| `---`（分隔线）回车 | 不续行（`\s+` 要求 `-` 后是空白，`---` 不匹配） |
| 光标在行首/中间、beforeText 不匹配 | 正常换行 |
| `-`（空条目，整行只有标记）回车 | **（已确认）退出列表**：新行无 `-` 标记、保留缩进，类 Markdown |

- 规则按数组顺序求值，先命中者生效；两条规则互斥（空条目 vs 非空条目）。
- 不引入 `indentationRules`（用户确认当前缩进行为没问题，避免改变）。
- 已知边界（与 Markdown 相同）：代码围栏 ``` 内以 `-` 开头的行也会续行——onEnterRules 不感知 token scope；pd 语法中代码块内 `-` 属代码文本，续行反而是常见编辑预期，可接受。

## Files to modify

| 文件 | 改动 |
| --- | --- |
| `package.json` | activationEvents + `contributes.commands` |
| `src/pd2json.ts` | 新建（纯函数：pdToJsonText / isPdFileName / sectionNames） |
| `src/extension.ts` | `registerCommand("promptdown.pd2json", ...)`（~35 行，含 QuickPick） |
| `language-configuration.json` | 追加 `onEnterRules`（2 条规则） |
| `test/pd2json.test.ts` | 新建单测 |
| `README.md` | VSCode 扩展一节补两处说明（命令用法 + 续行行为） |

不动的部分：`src/cli.ts`（保持 CLI 输出与错误格式不变，避免回归）、parser 全部、`src/auto-detect.ts`（复用其 `detectPdIntent`）。

## Steps（实现清单）

- [x] 1. `package.json`：activationEvents 加 `onCommand:promptdown.pd2json`；contributes 加 commands（title 含 pd2json）
- [x] 2. 新建 `src/pd2json.ts`（pdToJsonText / isPdFileName / sectionNames，复用 splitSections）
- [x] 3. `src/extension.ts` 注册命令（五步：编辑器焦点 → PD 判断 → 多段 QuickPick → 解析 → untitled 展示）
- [x] 4. `language-configuration.json` 加 onEnterRules
- [x] 5. 新建 `test/pd2json.test.ts`（上表用例）
- [x] 6. `pnpm typecheck && pnpm test` 全绿（66/66）
- [x] 7. `pnpm build` + README 更新；vsce 打包验证通过（`pnpm wsl-install` 由用户执行）

## Verification

- 单测覆盖 pdToJsonText 全分支 + isPdFileName 大小写/边界
- Feature 1 手动：`.pd` 文件 → Ctrl+Shift+P 输入 `pd2json` → 侧边新开 untitled JSON（内容与 `node dist/cli.js <file>` 输出一致）；多段文件 → 弹出 QuickPick，选段后输出该段 JSON，Esc 取消则无动作；无编辑器（焦点在终端/资源管理器）→ 错误提示；`.md` 文件 → 错误提示；语法错误的 pd → 错误提示含行号；原文档未被动过
- Feature 2 手动：`.pd` 中 `- foo` 回车 → `-`；`- foo` 回车 → ` - `；`---` 回车不续行；`- key: v` 回车续 `-`；普通文本行回车行为不变；`.md` 文件不受影响
- 回归：格式化、`//!pd` 自动检测、CLI 行为不变

## 风险与边界

- `editor.autoIndent` 关闭时 onEnterRules 不生效（VSCode 机制，非本扩展可控）
- 多段文件经 QuickPick 选段后转换；同名段取第一个（与 CLI `expand` 语义一致）
- untitled 文件名由 VSCode 自动命名（Untitled-1），无法自定义
