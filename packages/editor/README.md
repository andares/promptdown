# @andares/pdeditor

**低 UI 提示词输入框**：一个能嵌进聊天框、侧栏、表单、弹窗的文本编辑器。
核心只负责文本、光标与语法高亮；边框、背景、工具栏、发送按钮全部由宿主决定。

- **低 UI**：默认不画任何 chrome；字体、字号、颜色全部继承宿主，只有 `line-height: 1.5` 是温和默认值
- **精确优先**：文本模型就是原始字符串（不做富文本/文档模型），高亮服务于“看清结构”，不改变内容
- **任意高度**：内容自适应；宿主给 `height` / `max-height` 时自动切换为内滚 + 覆盖层同步
- **三种用法**：原生工厂 `createPdEditor`、自定义元素 `<pd-editor>`、React 薄包装 `<PdEditor>`
- **主题即变量**：token 配色默认由 `currentColor` 派生；需要品牌色时覆盖 CSS 变量即可
- **可访问**：覆盖层 `aria-hidden`、label 转发、焦点环、`Tab` 可配置、`Escape` 释放焦点

支持格式：`pd`（内置 tokenizer，语义与 `@andares/pdfoundation` lexer 一致）/ `md` / `xml` / `json` / `yaml`（Prism，主入口内置）。

> 🤖 **AI agent 集成本项目时**：先读 [`skill/pdeditor/SKILL.md`](https://github.com/andares/promptdown/blob/master/skill/pdeditor/SKILL.md)
> （选入口 / 各框架可复制代码 / 低 UI 嵌入契约 / 禁止事项 / 集成后自测清单），
> 该 skill 随 npm 包 `@andares/promptdown` 发布，装过全局包即可被 agent 自动发现。
> 本文档是完整的 API/主题/浏览器支持手册。

---

## 安装

```bash
npm install @andares/pdeditor
```

`@andares/pdfoundation`（共享语义核心）会作为依赖自动安装。

## 入口与体积

每个入口都是**自包含产物**（引擎/插件/tokenizer 已内联），选入口即完成裁剪：

| 入口 | import | 内容 | 体积（min / gzip） |
| --- | --- | --- | --- |
| 全量 | `@andares/pdeditor` | 工厂 + pd 自研高亮 + Prism（md/json/yaml/xml） | ~88.8 kB / ~24.1 kB |
| pd-only | `@andares/pdeditor/pd` | 工厂 + pd 高亮；其余语言纯文本 | ~21.7 kB / ~6.7 kB |
| 元素 | `@andares/pdeditor/element` | `<pd-editor>` + pd 高亮（**不含 Prism**） | ~35.0 kB / ~9.7 kB |
| 元素自动注册 | `@andares/pdeditor/element/auto` | 同上 + import 即 `customElements.define` | ~35.0 kB / ~9.7 kB |
| React | `@andares/pdeditor/react` | React 包装 + 元素 + pd 高亮 | ~37.1 kB / ~10.4 kB |

- 元素/React 入口默认只带 pd tokenizer；需要 md/json/yaml/xml 时，把主入口的 `prismHighlighter` 注入 `highlight`（见下文），避免所有元素用户都背 Prism。
- 所有入口都 re-export `format` / `jsonToPdText` / `pdToJsonText`；`/pd` 与主入口另导出 `highlightPd`。
- React 是 **optional peerDependency**（`>=17`）；不用 React 不会装上它。

---

## 快速开始

### 1. 自定义元素（推荐）

```html
<script type="module">
  import "@andares/pdeditor/element/auto";
</script>

<pd-editor
  language="pd"
  placeholder="描述你想让模型做的事…"
  aria-label="提示词"
></pd-editor>

<script type="module">
  const el = document.querySelector("pd-editor");
  el.addEventListener("pd-input", (e) => {
    console.log(e.detail.value);
  });
  el.value = "任务: 写一个防抖搜索";
</script>
```

也可以显式注册（SSR 安全）：

```ts
import { definePdEditor } from "@andares/pdeditor/element";
definePdEditor(); // 或 definePdEditor("my-pd")
```

### 2. 工厂（无 UI / 自己控制 DOM）

```ts
import { createPdEditor } from "@andares/pdeditor";

const editor = createPdEditor(document.querySelector("#editor")!, {
  value: "//!pd 任务\n角色: 资深工程师\n",
  language: "pd",
  placeholder: "写点什么…",
  styles: { padding: "12px" },
  onValueChange: (v) => console.log(v.length),
});

editor.setValue("任务: 改一下");
editor.setLanguage("json");
editor.insertText("{}");
editor.destroy();
```

工厂**不会修改挂载点的样式**：它在挂载点内追加 `.pd-root`，宿主布局/边框/padding 全归宿主。

### 3. React

```tsx
import { PdEditor } from "@andares/pdeditor/react";

<PdEditor
  defaultValue="任务: 写一个防抖搜索"
  placeholder="描述任务…"
  onValueChange={setValue}
/>
```

受控用法：传 `value` + `onValueChange`；当 DOM 当前值与 prop 相同则不会回写（不打断光标/撤销）。
非受控：只传 `defaultValue`。需要 md/json 高亮时：

```tsx
import { prismHighlighter } from "@andares/pdeditor";
<PdEditor highlight={prismHighlighter} language="json" value={json} />
```

---

## 低 UI 契约

### 样式继承

不传任何样式时：

- `font-family` / `font-size` / `letter-spacing` / `color` 全部 `inherit`
- `background` 透明，无边框/圆角/阴影
- `line-height` 默认 `1.5`（可用 `--pd-line-height` 或 `styles.lineHeight` 覆盖）
- 唯一“意见”是等宽对齐所需的不变量（见下）

```css
/* 宿主可以只用一个变量把编辑器融进页面 */
pd-editor {
  --pd-font-size: 14px;
  --pd-line-height: 1.6;
  --pd-placeholder-opacity: 0.45;
}
```

### 高度与滚动

| 宿主布局 | 行为 |
| --- | --- |
| 不给高度 | **auto-grow**：内容多高，编辑器多高 |
| `height: 200px` / `height: 100%`（父级有确定高度） | **内滚模式**：textarea 滚动，高亮层/行号层同步 `scrollTop` |
| `max-height: 200px` | 先 auto-grow，到上限后内滚 |

固定高度示例：

```css
.chat-sidebar { height: 360px; }
.chat-sidebar pd-editor { height: 100%; }
```

> 元素默认 `height: auto`（不主动填满父级），这样在聊天框里不会被拉伸。要填满一个已知高度的容器，显式给它 `height: 100%`。

### 排版不变量（不可破坏）

覆盖层方案要求高亮 `pre` 与透明 `textarea` 逐字符对齐。以下由组件统一设置，**不要**在宿主 CSS 里覆盖：

- `font-*`、`line-height`、`letter-spacing`、`tab-size`
- `white-space: pre-wrap`、`overflow-wrap`、`word-break`
- `box-sizing`、`padding`（通过 `styles` / CSS 变量统一传）
- `font-variant-ligatures: none`（跨 span 的连字会改变宽度）

token 样式只应改**颜色**（或 `opacity`/`text-decoration`）。不要给 token 加 `font-size`、`padding`、`margin`、`border`、`font-weight`、`font-style`——在非严格等宽字体下会破坏对齐。

---

## API

### `createPdEditor(el, options?)`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `value` | `""` | 初始值（CRLF/CR 会归一为 LF） |
| `language` | `"pd"` | `pd` / `md` / `xml` / `json` / `yaml`，或自定义字符串 |
| `lineNumbers` | `false` | 行号 gutter（会多一层透明文本，用于保持换行高度） |
| `styles` | `{}` | 排版样式（camelCase 或 `--pd-*`）；`padding` 会应用到覆盖层而不是 root |
| `indentUnit` | `"  "` | Tab 整行缩进 / 续行缩进单位 |
| `highlight` | — | BYO 高亮器 `(source, lang) => html`，覆盖内置管线 |
| `onValueChange` | — | 值变化（用户输入、撤销/重做、insertText；`setValue` 不触发） |
| `placeholder` | `""` | 覆盖层占位符（不依赖原生 placeholder） |
| `readOnly` / `disabled` | `false` | 只读 / 禁用 |
| `maxLength` | 不限 | 负数/未设置 = 不限；`setValue`/`insertText` 也会截断 |
| `spellcheck` | `false` | 原生拼写检查 |
| `tabBehavior` | `"indent"` | `indent`（pd 编辑语义）或 `focus`（无障碍优先）；`indent` 下按 `Escape` 后下一次 `Tab` 移动焦点 |
| `historyLimit` | `5` | 撤销记忆步数（不含初始值） |
| `historyDebounce` | `1000` | 连续输入的合并窗口（毫秒） |
| `highlightThreshold` | `100000` | 超过字符数降级纯文本，避免超大文档每键全量 tokenize |
| `ariaLabel` / `ariaLabelledby` / `ariaDescribedby` | — | 转发给内部 textarea |
| `dir` | — | 文本方向 |

返回实例：

```ts
interface PdEditorInstance {
  setValue(value: string, options?: { resetHistory?: boolean }): void;
  getValue(): string;
  setLanguage(lang: string): void;
  setPlaceholder(text: string): void;
  setReadOnly(v: boolean): void;
  setDisabled(v: boolean): void;
  setLineNumbers(v: boolean): void;
  update(options: Partial<PdEditorOptions>): void;
  focus(): void;
  blur(): void;
  undo(): void;
  redo(): void;
  insertText(text: string): void;
  getSelection(): { start: number; end: number };
  setSelection(start: number, end?: number): void;
  destroy(): void;
  textarea: HTMLTextAreaElement;
  root: HTMLElement;
  pre: HTMLElement;
}
```

- `setValue` 默认**重置撤销历史**（程序化回填不应留下旧输入的撤销洞）；需要保留历史时传 `{ resetHistory: false }`。
- `undo` / `redo` 也会触发 `onValueChange`（值确实变了），方便受控宿主同步。
- `destroy` 只移除引擎自己的 `.pd-root`，不动挂载点的其它子节点。

### `<pd-editor>`

**属性**（声明式，字符串）：

```html
<pd-editor
  value="初始值"
  language="pd"
  placeholder="…"
  indent-unit="  "
  line-numbers
  tab-behavior="indent"   <!-- 或 focus -->
  readonly
  disabled
  maxlength="2000"
	name="prompt"
  spellcheck="true"
  inputmode="text"
  enterkeyhint="send"
  dir="ltr"
  shadow="false"          <!-- light DOM（默认 shadow DOM） -->
  aria-label="提示词"
></pd-editor>
```

**属性 / property**：`value`、`language`、`placeholder`、`readOnly`、`disabled`、`lineNumbers`、`indentUnit`、`tabBehavior`、`maxLength`、`name`、`highlight`。

```ts
const el = document.querySelector("pd-editor");
el.value = "任务: x";          // 程序化设置（重置历史）
el.highlight = prismHighlighter; // 注入 Prism 高亮
el.insertText("...");
el.undo();
```

**事件**（均 `bubbles` + `composed`）：

| 事件 | detail | 说明 |
| --- | --- | --- |
| `pd-input` | `{ value }` | 值变化（用户输入/撤销/insertText） |
| `pd-change` | `{ value }` | 失焦且值相对聚焦时有变化 |
| `pd-focus` / `pd-blur` | `{ value }` | 焦点 |
| `pd-language-change` | `{ value }` | 语言属性变化 |
| `pd-ready` | `{ editor }` | 元素完成挂载（微任务派发） |

**Part**：`container` / `root` / `highlight` / `input` / `gutter` / `placeholder`。

**表单关联**：元素是 `formAssociated`，支持 `name`、`value`、`formResetCallback`、`formDisabledCallback`（浏览器支持 `ElementInternals` 时）。

**SSR**：`element` 模块导入不触碰 `HTMLElement`/`customElements`；`definePdEditor()` 在 Node 下安全返回 `null`。React 包装在 layout effect 中注册元素，SSR 端渲染为空标签。

---

## 主题

默认 token 颜色由 `currentColor` 派生（`color-mix`），在浅色/深色背景上都能自然融合；不支持 `color-mix` 时退回透明度。所有可配置项都是 CSS 变量：

| 变量 | 作用 |
| --- | --- |
| `--pd-font-family` / `--pd-font-size` / `--pd-line-height` / `--pd-letter-spacing` | 排版 |
| `--pd-color` / `--pd-background` | 前景/背景 |
| `--pd-caret-color` | 光标 |
| `--pd-placeholder-opacity` | 占位符透明度（默认 0.5） |
| `--pd-gutter-color` / `--pd-gutter-opacity` | 行号 |
| `--pd-token-key` / `--pd-token-punct` / `--pd-token-item` / `--pd-token-section` / `--pd-token-sep` / `--pd-token-ref` / `--pd-token-code` / `--pd-token-fence` | pd token |
| `--pd-token-comment` / `--pd-token-string` / `--pd-token-keyword` / `--pd-token-number` / `--pd-token-property` / `--pd-token-punctuation` | Prism token（by 常用类） |
| `--pd-focus-ring` / `--pd-focus-ring-offset` / `--pd-focus-radius` | 焦点环（`--pd-focus-ring: none` 可关） |
| `--pd-disabled-opacity` | 禁用态 |

```css
/* 一个 VS Code 风格的暗色主题只要这样 */
pd-editor.dark {
  --pd-background: #1e1e1e;
  --pd-color: #d4d4d4;
  --pd-token-key: #9cdcfe;
  --pd-token-punct: #d4d4d4;
  --pd-token-item: #569cd6;
  --pd-token-section: #c586c0;
  --pd-token-ref: #ce9178;
  --pd-token-code: #dcdcaa;
  --pd-token-fence: #6a9955;
  --pd-focus-ring: 2px solid #007acc;
  --pd-focus-ring-offset: 2px;
}
```

### shadow vs light

- **默认 shadow DOM**：几何与 token 样式完全隔离，宿主全局 CSS 不会破坏覆盖层；token 用 CSS 变量上色。
- **`shadow="false"`（light DOM）**：宿主可以直接写 `pd-editor .pd-key { color: … }`；组件会向文档 head 注入一次 scoped 默认主题（不覆盖宿主更高优先级的规则）。

---

## 可访问性

- 覆盖层（高亮 `pre`、行号、占位符）全部 `aria-hidden`，读屏只读内部 `textarea`。
- `aria-label` / `aria-labelledby` / `aria-describedby` 会转发到 textarea；`placeholder` 同时写 `aria-placeholder`。
- 焦点环默认画在宿主上（`:focus-within`），可用 `--pd-focus-ring: none` 关闭。
- `Tab` 默认用于缩进（pd 编辑语义）；按一下 `Escape` 后的下一次 `Tab` 会移动焦点。表单/无障碍优先场景直接设 `tab-behavior="focus"`。
- 支持 `readOnly` / `disabled` / `maxLength`；`inputmode` / `enterkeyhint` 转发到内部 textarea（移动端键盘/发送键）；`prefers-color-scheme` 由宿主主题决定。
- 移动端若宿主字号 < 16px，iOS 聚焦会缩放页面；可在 `@media (pointer: coarse)` 里设 `--pd-font-size: 16px`。

---

## 排版性能

- 输入热路径不做强制布局读取（高度/滚动同步交给 `ResizeObserver`、`scroll` 事件与程序化操作）。
- 2000 行 / 31k 字符的 pd 文档，单次输入渲染约 **10–13 ms**（Chromium，本机）；输入框场景通常远小于此。
- 超过 `highlightThreshold`（默认 10 万字符）自动降级为纯文本渲染，避免每键全量 tokenize。
- 行号是可选层；开启后会多一层透明文本以保持软换行高度（仅在需要时付费）。

---

## Demo

```bash
# 单文件、双击即可打开（file:// 可用，无需服务器）
pnpm --filter @andares/pdeditor build:demo
# → packages/editor/demo-dist/index.html

# 开发热更新
pnpm --filter @andares/pdeditor dev
```

demo 包含：低 UI 的聊天框/侧栏/衬线字体嵌入、一层基础工具栏 UI、各框架用法、以及**浏览器几何自检**（覆盖层对齐、滚动同步、占位符、aria、行号）。

---

## 各框架

React 用上面的 `/react` 入口。其余框架直接绑定 property / 事件：

```jsx
// Preact（原生 input 事件是 composed，能穿过 shadow；复杂属性用 ref 赋值）
import "@andares/pdeditor/element/auto";
<pd-editor ref={ref} onInput={() => setValue(ref.current.value)} />
```

```jsx
// Solid
import "@andares/pdeditor/element/auto";
<pd-editor ref={el} prop:value={value()} on:pd-input={(e) => setValue(e.detail.value)} />
```

```vue
<!-- Vue 3：需要把 pd-editor 标记为自定义元素 -->
<!-- vite.config.ts: vue({ template: { compilerOptions: { isCustomElement: t => t === "pd-editor" } } }) -->
<pd-editor :value="value" @pd-input="value = $event.detail.value" />
```

```svelte
<script>
  import "@andares/pdeditor/element/auto";
  let el;
</script>
<pd-editor bind:this={el} on:pd-input={(e) => (value = e.detail.value)} />
```

> 复杂值（`highlight` 函数、对象）在 React 18 的自定义元素上会被字符串化；用官方 React 包装或 `ref` + property 赋值。

---

## 浏览器支持

- 现代 evergreen：Chrome/Edge、Firefox、Safari。
- `color-mix`：Chrome 111+ / Firefox 113+ / Safari 16.2+（不支持时退回透明度，不影响功能）。
- `scrollbar-gutter`：Chrome 94+ / Firefox 97+ / Safari 18.2+（旧 Safari 在出现滚动条时可能有 ~15px 换行差异，可用 overlay 滚动条或固定宽度规避）。
- `adoptedStyleSheets` 不可用时退回 `<style>`；`ElementInternals` 不可用时表单关联自动降级。
- 不支持 IE。

## CSP

- 引擎的几何样式通过内联 style 属性设置（CSSOM），shadow 默认优先 constructable stylesheet。
- 严格 CSP 环境可改用 light 模式并自备 token CSS；或允许 `style-src 'unsafe-inline'`。
- Demo 是单文件内联脚本，仅用于展示。

---

## 从 0.4.x 升级

- 移除 Yace，改为内置 overlay 引擎；`createPdEditor` API 保持兼容（新增可选键）。
- 默认排版从「16px 等宽」改为 **inherit**；若原来依赖默认字号，请显式传 `styles.fontSize` / `fontFamily`。
- `padding` 现在应用到覆盖层（`styles.padding` 行为更符合“无 host 污染”），不再写挂载点。
- `setValue` 默认重置撤销历史；CRLF 归一为 LF；`onValueChange` 在撤销/重做时也会触发。
- 新增 `<pd-editor>` / `/element` / `/element/auto` / `/react` 入口；见上文。

## 变更记录

- [`CHANGELOG.md`](./CHANGELOG.md)（开发期条目写 `CHANGELOG.dev.md`，`pnpm release-editor` 归档）
