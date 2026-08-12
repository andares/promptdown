# pd.tmLanguage 围栏嵌套语法高亮规划

## Context

promptdown 的 VSCode 插件（TextMate grammar，`syntaxes/pd.tmLanguage.json`）中，``` 围栏代码块目前**没有嵌套高亮**：`code-block` 规则只有 `begin`/`end`，围栏内全部落在单一 scope `markup.fenced_code.block.pd`（主题里显示为普通文本/代码块底色）。

目标：让 ```lang 围栏内**启动 VSCode 自身对对应语言的语法高亮**（如```js 内 JS 着色），与 Markdown 体验一致。

用户已确认：**做，常用语言子集**（js/ts/json/jsonc/py/bash/sh/html/css/yaml/sql/go，共 11 种 + fallback）。

## 现状（已确认）

```json
"code-block": {
  "begin": "^(\\s*)(```)([A-Za-z0-9_+-]*)?.*$",   // ← 消费整行（含 lang）
  "end": "^\\s*```\\s*$",
  "name": "markup.fenced_code.block.pd"             // ← 无 patterns → 无嵌套
}
```

关键问题：外层 begin 用 `.*$` **消费了整行**，TextMate 的 `patterns` 从 begin 结束位置（行尾）开始匹配——内层规则无法再匹配 ```lang 行。**必须改外层 begin 为不消费 lang 的写法**（Markdown 同款机制）。

## 方案（Markdown grammar 同款机制）

### 1. `syntaxes/pd.tmLanguage.json`

外层 `code-block` 改：

```json
"code-block": {
  "comment": "``` 围栏：按 lang 嵌套对应语言高亮（未列出的语言走 fenced-unknown）",
  "begin": "^(\\s*)(```)",          // 只消费到 ``` 后，lang 留在当前位置
  "end": "^\\s*```\\s*$",
  "beginCaptures": { "2": { "name": "punctuation.definition.fenced.pd" } },
  "endCaptures": { "0": { "name": "punctuation.definition.fenced.pd" } },
  "name": "markup.fenced_code.block.pd",
  "patterns": [
    { "include": "#fenced-js" }, { "include": "#fenced-ts" },
    { "include": "#fenced-json" }, { "include": "#fenced-jsonc" },
    { "include": "#fenced-python" }, { "include": "#fenced-bash" },
    { "include": "#fenced-html" }, { "include": "#fenced-css" },
    { "include": "#fenced-yaml" }, { "include": "#fenced-sql" },
    { "include": "#fenced-go" },
    { "include": "#fenced-unknown" }
  ]
}
```

每种语言一个 repository 规则（以 js 为例，其余同构）：

```json
"fenced-js": {
  "comment": "```js / ```javascript → source.js",
  "begin": "(?=(js|javascript)(\\s*)$)",
  "beginCaptures": { "1": { "name": "entity.name.tag.pd" } },
  "end": "(?=^\\s*```\\s*$)",
  "patterns": [{ "include": "source.js" }]
}
```

**机制要点**（TextMate 语义，务必照抄）：

- 内层 `begin` 是**纯 lookahead**（不消费字符）：从外层 begin 结束位置（lang 字符处）断言 lang 匹配到行尾
- `end` 用 lookahead `(?=^\s*```\s*$)` **不消费闭合行** → 未闭合围栏行为与现状一致（body 延伸到文件尾）
- `include: "source.js"` 是全局 scope 引用：VSCode 内置语言（js/ts/json/python/shell/html/css/yaml/sql/go）直接生效；第三方扩展语言只要装了且列出 scope 也能生效
- lang 高亮：内层 beginCaptures 捕获 lang 为 `entity.name.tag.pd`（与现状的 beginCaptures 3 等价），与源语言 grammar 的 identifier scope 叠加共存（Markdown 同款行为）
- 兼容性：``` 空 lang / ```js foo（lang 后带内容）→ js 等规则 lookahead 失败 → 落 `fenced-unknown`（lookahead `(?=[A-Za-z0-9_+-]*(\s*)$)`，空 lang 也能匹配）→ 无嵌套高亮，与现状行为一致

**语言清单与 scope 对照**（VSCode 内置，必须拼写正确）：

| lang 标签 | scope | 备注 |
| --- | --- | --- |
| `js`/`javascript` | `source.js` | |
| `ts`/`typescript` | `source.ts` | |
| `json` | `source.json` | |
| `jsonc` | `source.json.comments` | |
| `py`/`python` | `source.python` | |
| `bash`/`sh`/`shell` | `source.shell` | |
| `html` | `text.html.derivative` | 完整版（含 JS/CSS 内嵌） |
| `css` | `source.css` | |
| `yaml`/`yml` | `source.yaml` | |
| `sql` | `source.sql` | |
| `go` | `source.go` | |

### 2. `package.json`：grammars 配置加 `embeddedLanguages`

让编辑器识别围栏内语言（括号配对、注释切换、word pattern 等语言特性跟随目标语言）：

```json
"embeddedLanguages": {
  "source.js": "javascript",
  "source.ts": "typescript",
  "source.json": "json",
  "source.json.comments": "jsonc",
  "source.python": "python",
  "source.shell": "shellscript",
  "text.html.derivative": "html",
  "source.css": "css",
  "source.yaml": "yaml",
  "source.sql": "sql",
  "source.go": "go"
}
```

（language id 与 scope 一一对应，VSCode 内置语言的合法 id）

## Files to modify

| 文件 | 改动 |
| --- | --- |
| `syntaxes/pd.tmLanguage.json` | `code-block` 规则重写 + repository 新增 11 个 `fenced-*` 规则 |
| `package.json` | `contributes.grammars[0]` 加 `embeddedLanguages`（11 条映射） |

不改 parser/CLI/文档（语法语义不变，纯高亮增强）。

## Steps（实现清单）

- [ ] 1. 重写 `syntaxes/pd.tmLanguage.json` 的 `code-block`（begin 改不消费 lang + patterns 分派）
- [ ] 2. repository 新增 `fenced-js/ts/json/jsonc/python/bash/html/css/yaml/sql/go` + `fenced-unknown`（照抄方案中的机制要点）
- [ ] 3. `package.json` 加 `embeddedLanguages`（11 条）
- [ ] 4. JSON 校验（`node -e JSON.parse` 两个文件）+ `pnpm typecheck`
- [ ] 5. 逻辑验证：正则与 TextMate 语义 review（begin/end/捕获组）；若能拿到 VSCode 内置 grammar 文件（如 `~/.vscode*/resources/app/extensions/javascript/.../javascript.tmLanguage.json` 或从 VSCode 安装目录），用 `vscode-textmate` 临时离线渲染 pd 样本验证 token 化（`pnpm dlx` 或 tmp 目录安装，**不写入 devDependencies**）
- [ ] 6. 回归：parser 测试全绿（`pnpm test`，grammar 不影响但保险）
- [ ] 7. 手动验证指引：`pnpm package` 出 .vsix 安装（或 F5 调试扩展），打开含 ```js/```py 等的 `.pd` 文件确认高亮；未列出的 lang 与空 lang 保持现状

## Verification

- 自动化：JSON 合法 + typecheck + test 全绿 + （尽力）vscode-textmate 离线渲染断言（```js 块内 token 含 `source.js` 的 scope，如 `keyword.control.js`）
- 手动：F5/安装 vsix 后肉眼确认 11 种语言高亮、lang 标签仍为 tag 色、未列出的语言（如 ```vue）与空 lang 无嵌套高亮、未闭合围栏高亮延伸到文件尾不报错

## 风险与边界

- **静态语言列表**：TextMate 无变量插值，只能支持 grammar 里列出的 11 种；Markdown 也是同样的静态列表模式，这是平台限制不是缺陷
- **lang 后带内容**（```js foo）：落入 fenced-unknown，无嵌套高亮（与 Markdown 行为一致，可接受）
- **性能**：include 大 grammar（如 text.html.derivative）只在围栏内激活，与 Markdown 同量级，无虞
- **不改语义**：pd2json 的围栏解析（`src/parser/lexer.ts`）不依赖 grammar，零影响
