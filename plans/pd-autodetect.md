# //!pd 自动检测：任意文件语言切换规划

## Context

promptdown 插件目前只对 `.pd` 后缀文件生效（grammar + 格式化器按 `onLanguage:promptdown` 激活）。用户希望：**任意文件**（含未保存的 untitled / 未知扩展名）中输入 `//!pd` 段标记行后，文档按 pd 语法识别（高亮 + 格式化）。

**考据结论（已确认）**：

- ❌ "//!pd 之后的行单独用 pd grammar"做不到——VSCode TextMate 是单文档单语言模型；injection grammar 只能叠加不能替换
- ✅ "检测到 //!pd 就把整个文档切换为 promptdown"可行——`vscode.languages.setTextDocumentLanguage(document, languageId)`（@types/vscode 1.90 L13775 实锤），对 untitled/任意文档有效；VSCode 无自定义语言检测器 API（1.90 无 registerLanguageDetection），需自行监听
- 用户已确认：**打开时检测 + 输入时检测都要**

**用户补充要求（重要）**：输入时检测**必须注重效率**——只判断一次或更优算法，避免影响正常使用体验。

## 输入检测的效率设计（核心）

### 关键洞察 1：增量检测是错的（原方案缺陷）

`onDidChangeTextDocument` 的 `contentChanges[i].text` 是**本次编辑新增的增量文本**：逐键输入 `//!pd` 产生 5 个 change，text 分别是 `/` `/` `!` `p` `d`——**任何单次 change.text 都不含 `//!pd`**，对增量跑正则永远不命中（除非粘贴/自动补全）。必须改为**变更行级检测**：每次输入后读"变更所在行的当前内容"，检查该行是否已形成 `//!pd`（敲完第 5 键 `d` 后立即命中并切换）。

### 关键洞察 2：分层预筛，把正则执行压到最低

```
onDidChangeTextDocument
 ├─ ① 文档级快路径：document.languageId !== "plaintext" → return   （O(1) 属性比较）
 ├─ ② 行级预筛：变更行行首不是 //（含缩进）→ 跳过                 （只测行首几字符）
 ├─ ③ 完整判定：行首 //!pd\b → 切换                                 （几乎只有行首注释才执行）
 └─ 切换成功后 languageId 变化 → 该文档从此不再进此流程（每文档总开销收敛为一次切换）
```

- 典型打字：99.9% 击键只付出 ①（一次属性比较）+ ②（行首字符串前缀测试），无正则、无内容扫描
- IME 中文输入：变更在行中，行首非 `//` → ② 直接跳过
- ③ 只在"行首是 `//` 的编辑"时执行——纯文本里写行首注释本就罕见，且成本为一次行级正则
- `lineAt()` 是 VSCode 按行索引的 O(1) 访问，行文本拷贝成本 O(行宽)（通常 <100 字符）
- 与"只判断一次"的对应：每文档**最多切换一次**（switched 集合）；每次变更**最多一次完整判定**（预筛兜底）

## 方案

### 1. 新建 `src/auto-detect.ts`（纯函数，不依赖 vscode API，可单测）

```ts
export const PD_MARKER_LINE_RE = /^\s*\/\/!pd\b/;   // 段标记行（行首 + 缩进 + 词边界）
export const PD_PREFIX_RE = /^\s*\/\//;             // 预筛：行首注释特征

export function detectPdIntent(text: string, maxLines = 50): boolean
// 打开时：只扫前 maxLines 行（段标记总在开头附近），任一 PD_MARKER_LINE_RE 命中 → true

export function mayBeCommentLine(line: string): boolean
// 预筛：行首（允许缩进）是 // → true；否则无需继续

export function isPdMarkerLine(line: string): boolean
// 完整判定：行首 //!pd（\b 防 //!pdx 误判）→ true
```

### 2. `src/extension.ts` 加激活逻辑（~45 行）

```ts
const switched = new Set<string>(); // 已切换文档（会话内去重，每文档只切一次）

function shouldAutoDetect(): boolean  // promptdown.autoDetect 配置（默认 true）
function switchDocument(doc): void {
  // 守卫：switched 已含 / 配置关闭 / languageId !== "plaintext"（不覆盖用户已选语言）
  // → vscode.languages.setTextDocumentLanguage(doc, "promptdown"); switched.add(uri)
}

// 打开时：onDidOpenTextDocument → detectPdIntent(doc.getText()) → switchDocument
// 输入时：onDidChangeTextDocument → 三层预筛（见上），仅变更行命中 isPdMarkerLine 才 switchDocument
// 关闭时：onDidCloseTextDocument → switched.delete(uri)（重开可重新检测）
```

守卫要点：

- `languageId !== "plaintext"` 不切——untitled/未知扩展名默认就是 plaintext；.md/.js 等用户已选语言不受打扰
- `setTextDocumentLanguage` 不产生 contentChanges → 无循环风险
- 切换后语言已变，输入检测不再触碰该文档 → **安装后对正常使用零感知开销**

### 3. `package.json`

- `activationEvents` 加 `"onDidOpenTextDocument"`、`"onDidChangeTextDocument"`（保持 `onLanguage:promptdown`）
- `contributes.configuration`（与 languages/grammars 平级）：

```json
"configuration": {
  "title": "promptdown",
  "properties": {
    "promptdown.autoDetect": {
      "type": "boolean",
      "default": true,
      "description": "纯文本文档中出现 //!pd 段标记时自动切换为 promptdown 语言"
    }
  }
}
```

### 4. 测试 `test/auto-detect.test.ts`（node:test，复用现有设施）

| 用例 | 期望 |
| --- | --- |
| `//!pd` 单独一行 | detectPdIntent / isPdMarkerLine → true |
| `//!pd 任务`（带段名） | true |
| `//!pd 任务`（带缩进） | true |
| 前 50 行之外有标记 | detectPdIntent → false（maxLines 生效） |
| 无标记纯文本 | false |
| `//!pdx`（非标记，\b 边界） | false |
| `foo //!pd`（非行首） | false |
| `// 普通注释` | isPdMarkerLine false / mayBeCommentLine true（预筛放行） |
| 预筛：`hello` / 空行 / 中文行 | mayBeCommentLine → false（输入检测直接跳过） |

## Files to modify

| 文件 | 改动 |
| --- | --- |
| `src/auto-detect.ts` | 新建（纯函数） |
| `src/extension.ts` | 激活逻辑 + 三层预筛事件订阅 |
| `package.json` | activationEvents + contributes.configuration |
| `test/auto-detect.test.ts` | 新建单测 |

## Steps（实现清单）

- [ ] 1. 新建 `src/auto-detect.ts`（3 个正则/函数）
- [ ] 2. 改 `src/extension.ts`（shouldAutoDetect / switchDocument / 打开+输入+关闭三个事件订阅，输入走三层预筛）
- [ ] 3. 改 `package.json`（activationEvents + configuration）
- [ ] 4. 新建 `test/auto-detect.test.ts`（上表用例）
- [ ] 5. `pnpm typecheck && pnpm test` 全绿
- [ ] 6. `pnpm build` + `pnpm wsl-install` 打包测试版（**安装由用户自行执行**，脚本 `scripts/wsl-install.mjs` 已就绪：打 0.0.0-test vsix → 卸旧 → 装 WSL 端）

## Verification

- 单测覆盖检测函数全部分支（含预筛层）
- 性能自查：输入检测最坏路径 = languageId 比较 + lineAt + 行首前缀测试；正则仅在行首 `//` 时执行
- 手动：WSL 窗口 Reload 后，新建 untitled 文件逐键输入 `//!pd` → 敲完 `d` 右下角语言模式变 promptdown、键值行高亮、Shift+Alt+F 可格式化；普通纯文本打字无感知；`.md`/`.js` 文件不受影响；设置 `promptdown.autoDetect: false` 后不切换
- 回归：`.pd` 文件行为不变（onLanguage 激活仍有效）

## 风险与边界

- 纯文本文件恰好含 `//!pd` 字样（如教程文档）会被切走语言——需求本身；autoDetect 开关兜底
- 只对 plaintext 生效，不覆盖用户显式选择的语言
- 切换后格式化为整文件（//!pd 之前的 preamble 也按 pd 规则处理，语义上这些行本就丢弃，无碍）
- 零 LSP、零诊断，保持轻量
