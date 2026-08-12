; promptdown (.pd) 缩进查询（helix / neovim 通用）
;
; 设计：pd 的嵌套靠 "- " 前缀 + 缩进（找爸爸），列表项内回车应缩进到
; 内容列（"- " 之后），嵌套项逐级继承：
;   项目:            ← key_value 顶层，无 capture → 新行列 0
;   - 模块A:         ← item 的 key_value 列 2 → 新行列 2
;     - 接口:        ← item 的 key_value 列 4 → 新行列 4
;       - GET /api
;
; 注意：helix 换行只输出空白缩进，无法自动补 "- "（平台限制）；
; 回车后光标在内容列，输入 "- " 即完成续项。

(item (key_value) @indent)
(item (item_text) @indent)
