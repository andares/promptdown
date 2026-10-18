---
name: pdeditor-integration
description: >-
  把 @andares/pdeditor（低 UI 提示词输入框）集成进宿主项目时的操作指南：
  选入口、装依赖、三种用法（工厂 / <pd-editor> 自定义元素 / React 包装）、
  React/Preact/Solid/Vue/Svelte/原生 的可复制代码、低 UI 嵌入契约（高度、字体继承、
  CSS 变量主题、shadow/light）、事件与 API 速查、常见坑与验证步骤。
  触发词：集成 pdeditor、嵌入输入框、web 输入框、prompt 输入框、提示词输入框、
  <pd-editor>、@andares/pdeditor、pd 高亮输入框、给界面加指令/提示词输入框、
  富文本之外的代码式输入框。
  只在“要把输入框嵌进某个界面/项目”时用；纯语法问题见兄弟 skill ../promptdown/SKILL.md，
  写提示词内容见 ../pd-author/SKILL.md。
---

# @andares/pdeditor 集成指南（给 agent 用）

低 UI 提示词输入框：核心只负责**文本 + 光标 + 语法高亮**；边框、背景、工具栏、
发送键、布局全部由宿主决定。支持 `pd`（内置 tokenizer）/ `md` / `json` / `yaml` / `xml`。

> 完整 API、主题变量表、浏览器支持、CSP 与升级说明：npm 包 `@andares/pdeditor` 的 README
> （本仓库内 `packages/editor/README.md`；线上 <https://github.com/andares/promptdown/tree/master/packages/editor>）。

## 0. 先做决策：用哪个入口

**每个入口都是自包含产物，选一个即可**（同时引两个会把引擎打两份）。

| 你的情况 | 入口 | 体积（gzip） |
| --- | --- | --- |
| React 项目 | `@andares/pdeditor/react` | ~10.4 kB |
| 其它框架 / 原生（要多语言高亮） | `@andares/pdeditor` | ~24.1 kB（含 Prism） |
| 其它框架 / 原生（只用 pd，不要 Prism） | `@andares/pdeditor/element/auto` | ~9.7 kB |
| 自己控制 DOM、不要自定义元素 | `@andares/pdeditor/pd` 或 `/element` | ~6.7 / ~9.7 kB |

- **元素与 React 入口默认只带 pd tokenizer**；要 md/json/yaml/xml 高亮时，从主入口注入 `prismHighlighter`。
- 所有入口都 re-export 语义 API：`format` / `jsonToPdText` / `pdToJsonText`（另有 `highlightPd`）。

## 1. 安装

```bash
npm install @andares/pdeditor
```

`@andares/pdfoundation`（共享语义核心）会作为依赖自动安装。React 是 optional peer（`>=17`），
不用 React 不会装上它。

## 2. 三种用法（复制即可）

### React（推荐）

```tsx
import { PdEditor } from "@andares/pdeditor/react";

// 非受控：只给初始值
<PdEditor defaultValue="任务: 写一个防抖搜索" placeholder="描述任务…" />

// 受控：value + onValueChange（DOM 值相同则不回写，不打断输入/光标/撤销）
<PdEditor value={value} onValueChange={setValue} aria-label="提示词" />

// 要 md/json 高亮：注入 Prism
import { prismHighlighter } from "@andares/pdeditor";
<PdEditor highlight={prismHighlighter} language="json" value={json} onValueChange={setJson} />
```

### 其它框架 / 原生：用自定义元素

```html
<script type="module">
  import "@andares/pdeditor/element/auto"; // import 即注册 <pd-editor>
</script>

<pd-editor id="prompt" language="pd" placeholder="描述你想让模型做的事…" aria-label="提示词"></pd-editor>

<script type="module">
  const el = document.querySelector("#prompt");
  el.addEventListener("pd-input", (e) => console.log(e.detail.value)); // 事件带 composed，能穿 shadow
  el.value = "任务: 写一个防抖搜索"; // 程序化设置（重置撤销历史）
</script>
```

显式注册（SSR / 不想副作用）：`import { definePdEditor } from "@andares/pdeditor/element"; definePdEditor();`

框架绑定（复杂值必须走 property/ref，不要指望模板属性）：

```jsx
// Preact
import "@andares/pdeditor/element/auto";
<pd-editor ref={ref} onInput={() => setValue(ref.current.value)} />
```

```jsx
// Solid
<pd-editor ref={el} prop:value={value()} on:pd-input={(e) => setValue(e.detail.value)} />
```

```vue
<!-- Vue 3：必须把标签标记为自定义元素，否则会被当组件解析 -->
<!-- vite.config.ts: vue({ template: { compilerOptions: { isCustomElement: (t) => t === "pd-editor" } } }) -->
<pd-editor :value="value" @pd-input="value = $event.detail.value" />
```

```svelte
<script>
  import "@andares/pdeditor/element/auto";
  let el;
</script>
<pd-editor bind:this={el} on:pd-input={(e) => (value = e.detail.value)} />
```

### 工厂（headless，自己拿 DOM）

```ts
import { createPdEditor } from "@andares/pdeditor/pd";

const editor = createPdEditor(container, {
  value: "//!pd 任务\n角色: 资深工程师\n",
  language: "pd",
  placeholder: "写点什么…",
  styles: { padding: "12px" },      // 排版样式走这里，不要写挂载点的 padding
  onValueChange: (v) => save(v),
});

editor.insertText("x");   // 光标处插入
editor.undo();            // 也有 redo / getSelection / setSelection / update
editor.destroy();         // 只移除引擎自己的 .pd-root，不动挂载点其它子节点
```

## 3. 低 UI 嵌入契约（“嵌进去不突兀”的关键）

- **字体/字号/颜色全部继承宿主**（默认无 backdrop、无边框、无圆角）；只有 `line-height: 1.5` 是温和默认。
- **高度**：不设高度 → 随内容自增；宿主给 `height` / `max-height` → 自动内滚并同步高亮层。
  元素默认 `height: auto`（聊天框里不会被拉伸）；要填满已知高度容器时显式给 `height: 100%`：
  ```css
  .composer pd-editor { height: 100%; }   /* 容器 height: 120px */
  ```
- **主题只用 CSS 变量**（宿主不需要知道内部结构）：
  ```css
  pd-editor {
    --pd-font-size: 14px;         /* 也可 --pd-font-family / --pd-line-height */
    --pd-token-key: #2f6f63;      /* pd token：key/punct/item/section/sep/ref/code/fence */
    --pd-placeholder-opacity: .45;
    --pd-focus-ring: 2px solid #007acc;   /* 不需要焦点环就写 none */
  }
  ```
  默认 token 由 `currentColor` 派生，深浅底色都能融合；不支持 `color-mix` 的老浏览器自动退回透明度。
- **shadow 默认开启**（宿主全局 CSS 影响不到内部，几何稳定）；要直接用类名上色就加 `shadow="false"`（light DOM）：
  ```css
  pd-editor .pd-key { color: #2f6f63; }   /* 仅 shadow="false" 时有效 */
  ```
- **可访问性已内建**：高亮层/行号/占位符 `aria-hidden`，label 转发，`focus-within` 焦点环，
  `Tab` 默认缩进、按一次 `Escape` 后下一次 `Tab` 移焦（表单场景可直接 `tab-behavior="focus"`）。

## 4. 不要做（会破坏覆盖层对齐或造成重复打包）

1. **不要**给宿主容器的 `padding` 期望它生效：内部 padding 由 `styles.padding` / CSS 管理（写挂载点 padding 会让两层错位）。
2. **不要**用 token 样式改字形宽度或盒模型：`.pd-key` 等只改 `color`（`opacity`/`text-decoration` 可），
   加 `font-size` / `padding` / `border` / `font-weight` 会让透明 textarea 与高亮层错位。
3. **不要**同时 import 两个入口（如 `@andares/pdeditor` + `@andares/pdeditor/pd`），引擎会被打两份。
4. **不要**在 React 里给 `<pd-editor highlight={fn}>` 传函数——React 18 会字符串化；用 `/react` 入口或 `ref` 赋 property。
5. **不要**用 `value` 属性做持续受控（属性是初始值语义，像 textarea 的 `defaultValue`）；持续受控用 property `el.value`。
6. **不要**把它当大文档编辑器：超过 `highlightThreshold`（默认 10 万字符）自动降级纯文本；
   真要代码编辑器（多光标/折叠/万行级）用 CodeMirror 6，这不是本库的定位。
7. `setValue` / `el.value` **默认重置撤销历史**（程序化回填不该打断用户撤销链）；要保留历史传 `{ resetHistory: false }`。

## 5. API 速查

**选项**（工厂 / 元素 property 同义）：`value`、`language`、`placeholder`、`lineNumbers`、
`indentUnit`、`readOnly`、`disabled`、`maxLength`、`spellcheck`、`tabBehavior`（`indent`|`focus`）、
`historyLimit`、`historyDebounce`、`highlightThreshold`、`styles`、`highlight`、`dir`、
`ariaLabel` / `ariaLabelledby` / `ariaDescribedby`、`onValueChange`。

**元素属性**（声明式）：`value` `language` `placeholder` `indent-unit` `line-numbers`
`tab-behavior` `readonly` `disabled` `maxlength` `name` `spellcheck` `inputmode` `enterkeyhint`
`dir` `shadow="false"` `aria-*`；表单关联（`name` + reset/disabled）在支持 `ElementInternals` 时可用。

**方法**：`setValue(v, {resetHistory})` `getValue()` `setLanguage(l)` `setPlaceholder(t)`
`setReadOnly(b)` `setDisabled(b)` `setLineNumbers(b)` `update(opts)` `focus()` `blur()`
`undo()` `redo()` `insertText(t)` `getSelection()` `setSelection(s,e)` `destroy()`；
另有 `textarea` / `root` / `pre` 三个 DOM 出口。

**事件**（元素层，均 `bubbles` + `composed`）：`pd-input`（`{value}`，也含撤销/insertText）、
`pd-change`（失焦且值变）、`pd-focus` / `pd-blur`、`pd-language-change`、`pd-ready`（`{editor}`）。
shadow 内原生 `change` 不穿边界，用 `pd-change`。

**Part**（shadow 内需要精细样式时）：`container` / `root` / `highlight` / `input` / `gutter` / `placeholder`。

## 6. 集成后自测（三步，几分钟）

1. 依赖与裁剪：装完在消费项目里 `vite build`，确认产物体积与入口匹配（例如只引 `/element/auto` 不应出现 `prism` 字样）。
2. 真实浏览器里跑这几条（jsdom 测不了几何）：
   - 空值 placeholder 可见；输入后消失；
   - 宿主给了固定高度时能滚动，且滚动后**高亮文字与光标不错位**；
   - `Tab` 缩进、`Escape` 后下一次 `Tab` 移焦；
   - 宿主改 `--pd-font-size` 后两层仍然对齐。
3. 参考实现：本仓库 `packages/editor/demo/`（低 UI 示例 + 基础工具栏 UI + 页面内 10 项几何自检）。
   ```bash
   pnpm --filter @andares/pdeditor build:demo   # → packages/editor/demo-dist/index.html，双击即可打开
   ```

## 7. 与 promptdown 语义的关系

- `pd` 语言的高亮与行内判定直接复用 `@andares/pdfoundation`（与 CLI/扩展同一份语义），不存在“高亮与转换结果不一致”。
- 需要做“格式化 / PD↔JSON / 编译多段”时，直接用任一入口 re-export 的语义 API（无需再装别的包）：
  ```ts
  import { format, pdToJsonText, jsonToPdText } from "@andares/pdeditor";
  ```
- 语法怎么读/怎么写：`../promptdown/SKILL.md`（解析）与 `../pd-author/SKILL.md`（作者）；
  完整规范 `../../docs/SPEC.md`（唯一事实来源）。
