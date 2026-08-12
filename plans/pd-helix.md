# Helix 语言支持：tree-sitter grammar + 写提示词工作流

## Context

用户使用 helix 25.07.1（WSLg 环境）写提示词，需要：

1. **`.pd` 文件识别 + 语法高亮** —— helix 高亮只用 tree-sitter（已考据：无 TextMate 支持，25.07 换了 tree-sitter 绑定），必须写 `tree-sitter-promptdown` grammar + `queries/highlights.scm`
2. **未存盘写提示词的激活** —— helix 无内容自动检测（无 `--language` CLI 参数、无文本变更钩子）→ 用 `.pd` 后缀自动识别 + `:set-language promptdown` 快捷键兜底
3. **一键复制到系统剪贴板** —— **已实测可用**：WSLg + `wl-copy` 存在，helix 默认自动检测 wayland provider（`hx --health clipboard` 确认）→ `y`/`%y` yank 已进系统剪贴板（WSLg 与 Windows 剪贴板同步）。仅需快捷键映射让"全选+复制"一键化

已确认：**工作流 + grammar 全套**。

## 方案

### 1. 新建 `tree-sitter-promptdown/`（独立 grammar 工程）

```
tree-sitter-promptdown/
├── grammar.js            # 行级语法（~150 行）
├── package.json          # tree-sitter 工程元数据（name/tree-sitter 版本）
├── src/parser.c          # tree-sitter-cli generate 生成（提交入库，免用户编译工具链）
├── queries/highlights.scm  # 高亮捕获（~30 行）
└── test/corpus/*.txt     # corpus 测试（tree-sitter-cli test 跑）
```

**grammar.js 设计**（最小可用版，行内 token 高亮，不做缩进嵌套 AST——tree-sitter 高亮由 leaf captures 驱动）：

| 规则 | 匹配 | capture |
| --- | --- | --- |
| `section` | `/\/\/!pd\s*[^\n]*/` | `@markup.heading` |
| `separator` | `/---/` | `@punctuation.special` |
| `key_value` | `seq(key_name, ':', value)` | key=`@tag`，value=`@string` |
| `item` | `seq('-', /[^\n]*/)` | `-`=`@punctuation.special` |
| `fence_line` | `/```[^\n]*/` | `@markup.raw.block` |
| `ref` | `/:[^\s-][^\s]*/` | `@markup.quote` |
| `text` | `/[^\n]*/` | 兜底 |

**关键实现点（tree-sitter 平台限制）**：

- regex 引擎**无 lookahead/lookbehind** → ref 的"前后空格"约束放宽为冒号后非空白（误匹配风险由 `prec` 优先级压制：`key_value` 用 `prec(1, ...)` 优先于 ref）
- token 默认单行（regex 不含 `\n`），行间由 seq/repeat 跨行 ✓
- fence **不做完整围栏结构**（避免 GLR 歧义），只高亮 ```` ``` ```` 行本身（`fence_line`），围栏内行按普通规则——最小可用版，文档注明限制
- `precedence` 处理 key_value/ref/text 歧义；corpus 测试锁定行为

**highlights.scm**（helix 主题 capture 名）：

```scm
(section) @markup.heading
(separator) @punctuation.special
(key_value key: (key_name) @tag)
(key_value value: (value) @string)
(item) @punctuation.special
(fence_line) @markup.raw.block
(ref) @markup.quote
```

### 2. 安装机制（helix 官方流程 + 一键脚本）

**手动（helix 官方机制）**：

1. `languages.toml`：

```toml
[[language]]
name = "promptdown"
scope = "source.pd"
file-types = ["pd"]
comment-tokens = ["//"]

[[grammar]]
name = "promptdown"
source = { path = "/abs/path/tree-sitter-promptdown" }
```

1. `hx --grammar build`（编译 .so 进 runtime；25.07 已确认支持）
2. 拷贝 `queries/highlights.scm` → `~/.config/helix/runtime/queries/promptdown/highlights.scm`（⚠️ grammar 配置不管 queries，必须手动拷——官方讨论 #15660 的坑）

**一键脚本 `scripts/hx-install.mjs`**（npm 全局包场景，复用 wsl-install 的模式）：

- 检测 `which hx` + 版本
- 写/合并 `~/.config/helix/languages.toml`（`source.path` 指向包内 grammar；已存在 `[[language]] promptdown` 则跳过）
- 拷 queries 到 `~/.config/helix/runtime/queries/promptdown/`
- 跑 `hx --grammar build`
- 报告完成 + 提示 config.toml 工作流建议

### 3. 写提示词工作流（config.toml 建议，脚本输出 + README 文档）

```toml
[editor]
clipboard-provider = "wayland"   # 显式声明（WSLg 默认已自动检测，显式更稳）

[keys.normal]
# 一键激活 pd 语言（空 buffer / 未存盘场景）
F5 = ":set-language promptdown"
# 一键全选复制全文到系统剪贴板（WSLg → Windows 剪贴板）
F6 = ["select_all", "yank"]
```

- `hx 提示词.pd`：后缀自动识别，直接写（不 `:w` 即不落盘）
- 空 buffer：`F5` 激活 → 写 → `F6` 复制 → Windows Ctrl+V 粘贴
- 脚本**只读合并** config.toml 建议（不自动写用户已有 config，避免覆盖——输出建议让用户确认）

### 4. 测试与验证

- corpus 测试：`tree-sitter-cli test`（grammar 工程内）
- 单测：`pnpm test`（不影响现有 56 用例）
- 手动：`hx --grammar build` 后开 `.pd` 文件看高亮；`F6` 后 Windows 端粘贴验证剪贴板
- `hx --health promptdown` 检查语言加载

## Files to modify

| 文件 | 操作 |
| --- | --- |
| `tree-sitter-promptdown/` | 新建（grammar.js + package.json + queries/ + test/ + src/parser.c 生成） |
| `scripts/hx-install.mjs` | 新建一键安装脚本 |
| `package.json` | scripts 加 `hx-install`；`.npmignore` 放开 tree-sitter-promptdown/（随包发布） |
| `README.md` | Helix 支持章节（工作流 + 安装） |
| `~/.config/helix/` | 用户侧：languages.toml + config.toml（脚本写，需用户确认后执行） |

## Steps（实现清单）

- [x] 1. 建 `tree-sitter-promptdown/` 骨架（package.json + grammar.js 初稿）
- [x] 2. `pnpm dlx tree-sitter-cli generate` 生成 parser.c + 语法验证（tree-sitter 解析无 ambiguity）
- [x] 3. corpus 测试（section/separator/key_value/item/fence/ref/text + 歧义场景）
- [x] 4. `queries/highlights.scm`
- [x] 5. `scripts/hx-install.mjs`（检测 hx → languages.toml 合并 → queries 拷贝 → `hx --grammar build` → config 建议输出）
- [x] 6. package.json（scripts + .npmignore 白名单）+ README Helix 章节
- [x] 7. 本地执行脚本安装 + `hx --health promptdown` 验证 + `.pd` 高亮实测 + `F6` 剪贴板验证（安装/写用户配置前征得同意）

## Verification

- `tree-sitter-cli test` 全过
- `pnpm test` 56/56（回归）
- `hx --health promptdown` 无错误
- 手动：`.pd` 键值/围栏/引用/分隔线高亮正确；空 buffer F5 激活；F6 全选复制 → Windows 粘贴成功
- 限制（文档注明）：fence 内行按普通规则高亮（无完整围栏结构）；ref 无前后空格约束（宽松匹配）

## 风险与边界

- **tree-sitter 版本 ABI**：`hx --grammar build` 由 helix 自己编译，匹配其绑定版本，无 ABI 风险；parser.c 提交入库仅为免工具链（如 helix 编译失败可删掉用 tree-sitter-cli 重新生成）
- **config.toml 合并**：只建议不自动写，保护用户现有配置
- **grammar 歧义**：key_value/ref/text 用 precedence + corpus 测试锁定；若仍有 ambiguity，tree-sitter-cli 会报错并需调整规则
- 不引入 LSP/服务器，纯 grammar + queries，helix 官方机制
