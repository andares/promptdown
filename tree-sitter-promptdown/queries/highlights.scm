; promptdown (.pd) 高亮捕获（helix / neovim 通用）
; 行级高亮：section 段标记 / separator 分隔线 / key_value 键值 / item 序列项 /
; fence_line 围栏行 / text_line 普通文本（不 capture，默认前景）

(section) @markup.heading

(separator) @punctuation.special

(key_value
  key: (key_name) @tag)

(key_value
  value: (value) @string)

(item
  (item_dash) @punctuation.special)

(item
  (key_value
    key: (key_name) @tag))

(item
  (key_value
    value: (value) @string))

(fence_line) @markup.raw.block
