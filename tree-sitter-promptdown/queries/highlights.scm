; promptdown (.pd) 高亮捕获（helix / neovim 通用）
; 配色：键 @keyword（紫）、引用 @constant（橙）、分隔线/序列前缀 @operator（蓝）、
; 段标记 @markup.heading、围栏 @markup.raw.block。
; 值不加 capture —— 与普通文本同色（pd 的值就是正文，不抢视觉）。

(section) @markup.heading

(separator) @operator

(key_value
  key: (key_name) @keyword)

(ref) @constant

(item_dash) @operator

(fence_line) @markup.raw.block
