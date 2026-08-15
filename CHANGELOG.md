<p align="center">
  <img src="icons/pd-icon.png" alt="promptdown icon" width="96" height="96">
</p>

# Changelog

## 0.7.0 (未发布)

- `pd2json` 升级为 **`pdtransform`**：pd ↔ JSON 双向转换（CLI + VSCode 命令）
- CLI 自动识别输入类型（扩展名 → 内容探针）；多段 pd 支持按段名或 1-based 序号选段
- JSON→pd 渲染器：标量转文本、结构性条目丢弃（黄字警告逐条）；顶层空行规则（带子域键值后空一行）
- VSCode 命令改名 `pdtransform`，面板显示 `PD格式转换` / 英文注释 `PD Transform to/from JSON`；结果一律新开 Untitled 文件，不覆盖原文

## 0.1.0 (2026-08-11)

- 初始版本：promptdown 语法 + `pd2json` CLI + VSCode 语法高亮 + AI skill
- 语法：键值折叠、Info/Subject 默认键、`-` 缩进嵌套、`---` 分隔线、`:refname` 引用内联展开、`//!pd` 段标记
