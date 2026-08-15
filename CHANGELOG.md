<p align="center">
  <img src="icons/pd-icon.png" alt="promptdown icon" width="96" height="96">
</p>

# Changelog

## 0.8.0 (未发布)

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

## 0.7.0 (未发布)

- `pd2json` 升级为 **`pdtransform`**：pd ↔ JSON 双向转换（CLI + VSCode 命令）
- CLI 自动识别输入类型（扩展名 → 内容探针）；多段 pd 支持按段名或 1-based 序号选段
- JSON→pd 渲染器：标量转文本、结构性条目丢弃（黄字警告逐条）；顶层空行规则（带子域键值后空一行）
- VSCode 命令改名 `pdtransform`，面板显示 `PD格式转换` / 英文注释 `PD Transform to/from JSON`；结果一律新开 Untitled 文件，不覆盖原文

## 0.1.0 (2026-08-11)

- 初始版本：promptdown 语法 + `pd2json` CLI + VSCode 语法高亮 + AI skill
- 语法：键值折叠、Info/Subject 默认键、`-` 缩进嵌套、`---` 分隔线、`:refname` 引用内联展开、`//!pd` 段标记
