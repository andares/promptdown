# prompt-down（.pd）

极简标记语言：兼容 markdown 风格，可单向转 JSON。专为提示词（prompt）组织设计。

- **极简**：核心符号只有 `:`（键值/引用）与 `-`（序列标记）
- **兼容 markdown**：内联 `**粗体**`、`` `代码` `` 等保留原文
- **可转 JSON**：`pd2json` CLI，单向转换
- **嵌套引用**：`:refname` 编译期内联展开，多段 `//!pd <name>` 混排
- **VSCode 高亮**：TextMate grammar，无需 LSP，无红线

## 语法速览

```pd
//!pd a1
name1:
- some
- name2: other words
- name3:
  - more
  - words
words

//!pd a2
name3: no :a1 more
```

```json
// pd2json file.pd a2
{
  "name3": {
    "Info1": ["no"],
    "name1": { "some": "words" },
    "Info2": ["more"]
  }
}
```

核心规则：

| 规则 | 说明 |
| --- | --- |
| 键值 | `key: content` 单条 → `"key": "value"`；多行/混排 → `{ "Info1": [...] }` |
| Info | 无 key 内容归入 `Info` 数组，编号每层独立（Info1/Info2...） |
| Subject | 顶层无 key 内容进入匿名根 `Subject1/Subject2...` |
| 嵌套 | 带 `-` 的行按缩进找爸爸；`- name:` 平级 `- words` 则 words 进 Info |
| 分隔 | `---` 块边界，指针回根 |
| 引用 | ` :refname ` 编译期内联展开（纯文字内联嵌入 / 带语法标记独立成行） |
| 段 | `//!pd <name>` 声明段；纯 pd 文件可省略 |

**完整语法规范见 [`docs/SPEC.md`](docs/SPEC.md)。**

## CLI

```bash
npm install -g prompt-down   # 或 npx prompt-down
pd2json <file.pd> [段名]
```

- 单段文件可省略段名；多段必须指定
- 引用在编译期内联展开
- 顶层 `-` 缩进等语法错误会报错退出

## VSCode 扩展

- 安装 .vsix 后 `.pd` 文件自动高亮（段标记/分隔线/键值/序列项/引用/Info 键）
- 纯声明式扩展，无 LSP，不产生诊断红线

## AI skill

`skill/SKILL.md` 为 pi 等 AI 工具提供语法知识：输入中出现 `//!pd` 时按 pd 格式解析。安装到 AI 的 skill 目录（如 `~/.pi/agent/skills/` 或项目 `.agents/skills/`）即可。

## 开发

```bash
npm install
npm run build   # tsc → dist/
npm test        # node:test
npm run package # vsce 打包 .vsix
```

## License

MIT
