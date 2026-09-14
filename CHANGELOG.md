<p align="center">
  <img src="icons/pd-icon.png" alt="promptdown icon" width="96" height="96">
</p>

# Changelog

## 1.0.0 (2026-09-14)

- **API 冻结声明（1.0 起）**：README 新增「API 与稳定性」章节——三包公共面冻结（主包 = CLI 行为 + VSCode 贡献点；`@andares/pdfoundation` = 语义 API；`@andares/pdeditor` = 组件 API 与语义 re-export），`docs/SPEC.md` 语法规范冻结，破坏性变更一律 2.0
- **CLI 通用参数 `--version`**：`pdtransform` / `pdcompile` / `pdformat` 统一调用共享模块（`src/version.ts`）输出当前版本号（读包根 package.json），与其他参数共存时优先生效
- **变更日志纪律完善**：主包与 editor 统一纪律——开发期条目分别写 `CHANGELOG.dev.md` / `packages/editor/CHANGELOG.dev.md`（不预写版本号）；`release-all` / `release-editor` 在 bump 后自动归档为对应 CHANGELOG 顶部 `## X.Y.Z (YYYY-MM-DD)` 章节并删除 dev 文件（无条目提示跳过；缺 `# Changelog` 标题锚点中止）。主包 CHANGELOG 清理历史 "(未发布)" 标记并补全 0.9.0 / 0.9.1 / 0.10.0 章节；editor 建立独立 `packages/editor/CHANGELOG.md`（补录 0.1.0–0.4.1）

## 0.10.0 (2026-09-07)

- **format 连续空行合并**：格式化最后一步把 2 个及以上连续空行压缩为 1 个（围栏内原样、末尾换行不丢）；全端生效（pdformat CLI / VSCode 格式化 / pdtransform / pdcompile / pdeditor）
- **VSCode 空子项行回车清标记**：在严格 `<缩进>- `（`-` 后带空白）的行尾再按回车，清掉原行标记与缩进、新行落行首（光标 col 0），一键脱离子项层级写顶层项；裸 `-` 与其他场景完整走默认回车行为
- **`@andares/pdeditor` 0.4.1 依赖修正**：`@andares/pdfoundation` 从 peerDependencies 归位 dependencies——产物直接外部 import 的运行时依赖必须自动安装（旧 peer 声明下消费方 `npm i @andares/pdeditor` 后 import 报 ERR_MODULE_NOT_FOUND）

## 0.9.1 (2026-08-20)

- **发布流程收敛为两个入口**：`release-foundation` 并入 `release-all`——foundation 版本与主包**同号绑定**、发布顺序固定（foundation → 主包 → vsce）；发布入口限 `release-all` / `release-editor`，`release` 旧形态与误敲被拦截提示
- release 流程评审修复：失败回滚提示补 foundation 已上 npm 不可撤回说明；editor 发布前置约束成文（目标 foundation 版本须已在 npm）

## 0.9.0 (2026-08-20)

- **新增 `@andares/pdeditor`**（packages/editor/，独立 workspace 包）：headless 提示词输入框组件
  - 基于 Yace（~2KB 零依赖），pd/md/xml/json/yaml 五格式语法高亮（pd 自研 tokenizer 与主包 lexer 语义一致；其余用 Prism）
  - 双入口：`@andares/pdeditor`（全量，含 Prism）/ `@andares/pdeditor/pd`（pd-only 精简，~17 kB）——选择入口即完成裁剪
  - headless：零样式零 chrome，语言切换为 API（setLanguage），外观完全外部定义；内置 Tab 缩进 / 回车续行 / 撤销重做（防抖合并）/ 中文 IME 组合期渲染
- **抽取共享语义包 `@andares/pdfoundation`**：parser（lexer/parser/toJson/expand/types）+ format + pdtransform + jsonToPd + auto-detect 独立成零运行时依赖包（ESM/CJS + d.ts + sideEffects:false）；主包与 pdeditor 共同依赖，语义单一来源消除漂移；测试随包迁移
- **主包壳层迁移 + 扩展 esbuild 自包含打包**：CLI / VSCode 扩展改依赖共享包；`dist/extension.js` 打包为单文件（bundle，仅 external vscode）——VSIX 按 `--no-dependencies` 打包不含 node_modules，散模块 require 外部包会导致安装后扩展无法激活
- **pdeditor re-export 语义 API**：两个入口均导出 `format` / `jsonToPdText` / `pdToJsonText`（pd 入口另含自研 `highlightPd`）
- **Bug 修复**：
  - untitled 输 `//!pd` 不切语言：`onDidOpenTextDocument` / `onDidChangeTextDocument` 作为 activationEvents 在 VSCode 1.75 已失效（冷启动下扩展未激活）→ 改用 `onStartupFinished` + 激活时补扫已打开文档
  - 引用展开把代码块卷进序列项：围栏行与围栏内容改顶层原样嵌入（`CodeN.body` 不再被 `- ` 前缀污染）
- pdeditor demo 实装格式化 / JSON↔PD 转换按钮（外部框架接入语义包的参考实现）
- 新增 `docs/TEST-CHECKLIST.md`（VSCode / npm / editor / CLI / Helix 六层人工回归清单）
- `release-editor` 改为纯 npm 流程（无 git 操作，bump 留工作区）

## 0.8.0 / 0.8.1 (2026-08-16)

- 新增 **`pdcompile`** 命令（CLI + VSCode）：多段编译为单份完整 pd——跨文件合并段列表、引用内联展开、统一 format 输出
- **section 寻址规范**正式定义：`%序号`（1-based，如 `%2`）/ 字符模式（命名是数字也算字符）；`%` 开头的段名转义 `%%`；无 `//!pd` 的隐式段段名 = 文件主名；匿名段只能 `%序号` 访问；跨文件重名先到先得
- **序号引用**：` :%N ` 引用全局第 N 个段（与 `%N` 寻址同语义，匿名段也可引用）——修复 VSCode 编译 `%2` 时 `:%1` 报"段不存在"的 bug
- **寻址/引用统一解析规则**：`findSection` 唯一实现（`%N` 序号 / 字符模式匹配存储名、同名先到先得），`resolveSection`（寻址）与引用展开共用；删除 buildByName/RefContext 中间层
- **循环引用静默擦除**：引用链按实际 section 的索引 id 匹配（`:名称` 与 `:%序号` 指向同一段算同一段），命中即擦掉 `:refname` 不展开、不报错（原为抛错）
- **pdtransform 参数语法变更**：序号必须带 `%`（`pdtransform file.pd %2`）；裸数字 `2` 改走字符模式（匹配命名 `2` 的段）
- **代码块豁免修复**（两个真实 bug）：``` 围栏内 `:refname` 不再被错误展开；围栏内 `//!pd` 行不再被误切段
- 新增 **行内代码**（`` ` ``）豁免：内部冒号不参与键值/序列/`:-` 转义/引用判定；format 原样保护；TextMate 整体漂色
- **空行规则移入 format**：顶层带子域键值后空一行（多段按段应用、幂等），pdformat / VSCode 格式化 / compile / transform 输出统一生效
- **内容项转义扩展**：第一个冒号转义（半角 `:` → `:-`、全角 `：` → `：-`，冒号后字符保留，行内代码内不转），防自动 format 把内容项变键值
- VSCode 新增 `pdcompile` 命令（`PD编译分段` / 英文 `PD Compile Sections`）；QuickPick 统一显示 `%序号 <段名>`（如 `%1 aaa`）；单段文档不弹窗直接转换
- VSCode 转换行为分方向：pd→JSON 新开 Untitled（原文档不动）；JSON→pd 直接变更当前文档（可撤销、语言自动切 promptdown）；pdcompile 新开 Untitled
- 多端规则同步：tree-sitter 补齐行内代码豁免（内部冒号/`:-` 不参与键值判定）；SECTION/SEPARATOR 整行锚定与 ref 空格约束等无法实施项降级标注（README「多端一致性」章节 + SPEC/skill 注明）
- 性能基准：`pnpm perf`（perf/bench.ts）——10 副本样本（2099 行/150 段）全链路 <10ms（format 最重 ~9.4ms）；`pnpm perf:gen` 重新生成样本
- 1.0 规划：docs/ROADMAP-1.0.md（API 冻结声明、全端对齐确认计划、0.9 输入框组件 → 稳定期 → 1.0 节奏）

## 0.7.0 (2026-08-16)

- `pd2json` 升级为 **`pdtransform`**：pd ↔ JSON 双向转换（CLI + VSCode 命令）
- CLI 自动识别输入类型（扩展名 → 内容探针）；多段 pd 支持按段名或 1-based 序号选段
- JSON→pd 渲染器：标量转文本、结构性条目丢弃（黄字警告逐条）；顶层空行规则（带子域键值后空一行）
- VSCode 命令改名 `pdtransform`，面板显示 `PD格式转换` / 英文注释 `PD Transform to/from JSON`；结果一律新开 Untitled 文件，不覆盖原文

## 0.1.0 (2026-08-11)

> 0.1.1 – 0.6.2（2026-08-11 至 2026-08-16）为项目初期快速迭代期，未按版本留档；
> 主要变更（helix 支持、pd-author skill、VSCode 命令与自动检测、Tab 缩进、pdtransform 双向）见 git 历史与 0.7.0 章节。

- 初始版本：promptdown 语法 + `pd2json` CLI + VSCode 语法高亮 + AI skill
- 语法：键值折叠、Info/Subject 默认键、`-` 缩进嵌套、`---` 分隔线、`:refname` 引用内联展开、`//!pd` 段标记
