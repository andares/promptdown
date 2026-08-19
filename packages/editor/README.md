# @andares/pdeditor

**Headless 提示词输入框组件**：在任意框架（React/Vue/Svelte/原生）中嵌入一个支持多格式语法高亮的输入框。基于 [Yace](https://github.com/petersolopov/yace)（~2KB、零依赖）。

## 定位

- **Headless**：只渲染输入框内容（高亮层 + 原生 textarea），无 UI chrome；核心维护覆盖层排版不变量，外部定义容器外观与 token 配色
- **精确优先**：pd 是纯代码文本，高亮服务于精确（看清结构），不改变文本；编辑模型保留原始文本
- **语言切换是 API 行为**（`setLanguage`），不做 UI 切换器
- 支持格式：`pd`（自研 tokenizer，语义与主包 lexer 一致）/ `md` / `xml` / `json` / `yaml`（Prism）

## 安装

```bash
npm install @andares/pdeditor
```

## 入口选择与 tree-shaking

同一个包两个入口，**选择入口即完成裁剪**——两个产物都是预打包自包含单文件（无运行时依赖，`sideEffects: false`），消费方的 bundler 无需做模块级摇树：

| 入口 | import | 内置高亮 | 产物体积（min 前 / gzip） | 适用 |
| --- | --- | --- | --- | --- |
| 全量（默认） | `@andares/pdeditor` | pd（自研）+ md/xml/json/yaml（Prism） | ~84 kB / ~23 kB | 需要多语言内置高亮 |
| pd-only 精简 | `@andares/pdeditor/pd` | 仅 pd；其余语言纯文本渲染（功能完好） | ~17 kB / ~5.5 kB | 只用 pd（多数宿主场景） |

```ts
// pd-only：不把 Prism（~80 kB）打进你的 bundle
import { createPdEditor } from "@andares/pdeditor/pd";
```

- 两个入口的 API 完全一致（同一 `createPdEditor` 工厂，仅内置高亮管线不同）
- pd-only 入口下 `setLanguage("md")` 不报错：内容以纯文本渲染，无高亮
- 任何时候都可用 `options.highlight` 自带高亮器（BYO）覆盖内置管线——精简入口 + BYO 即可按需补其它语言
- 消费验证：vite 项目引 `/pd` 入口构建产物 ~13 kB（gzip ~4.7 kB）、无 Prism 痕迹；包无任何 runtime 依赖（yace/prismjs/es-toolkit 均已内联进 dist，仅开发期使用）

## 用法

```ts
import { createPdEditor } from "@andares/pdeditor";

const editor = createPdEditor(document.querySelector("#editor")!, {
 value: "//!pd 基础设定\n角色: 资深工程师\n",
 language: "pd",
 styles: {
  fontSize: "14px",
  lineHeight: "20px",
  padding: "12px",
 },
 onValueChange: (v) => console.log(v.length),
});

editor.setLanguage("json"); // 语言切换 = API
editor.setValue('{"角色": "资深工程师"}');
console.log(editor.getValue());
editor.destroy();
```

## API

```ts
createPdEditor(el, {
  value?: string;                          // 初始值
  language?: "pd" | "md" | "xml" | "json" | "yaml";
  lineNumbers?: boolean;                   // 行号（默认 false）
  styles?: Record<string, string>;         // 覆盖层共用的根节点排版样式
  highlight?: (source, lang) => string;    // BYO 高亮函数（覆盖内置）
  onValueChange?: (value: string) => void;
}): {
  setValue(v): void;
  getValue(): string;
  setLanguage(lang): void;                 // 语言切换
  destroy(): void;
  textarea: HTMLTextAreaElement;           // 原生元素（外部可监听）
}
```

## 高亮样式

高亮输出带 class 的 HTML，外部提供 token 配色。字体、行高、字距和 padding 等几何样式必须通过 `styles` 从 Yace 根节点统一传入，不要分别设置内部 `textarea` / `pre`。token 样式也不能使用会改变字形宽度或盒模型的 `font-size`、`padding`、`margin`、`border`；非严格等宽字体下不要使用粗体或斜体。

```css
.pd-key { color: #9cdcfe; }            /* 键名 */
.pd-key-punct { color: #d4d4d4; }      /* 冒号 */
.pd-item { color: #569cd6; }           /* - 序列标记 */
.pd-section { color: #c586c0; }        /* //!pd 段标记 */
.pd-sep { color: #569cd6; }            /* --- 分隔线 */
.pd-ref { color: #ce9178; }            /* :refname 引用 */
.pd-inline-code { color: #dcdcaa; }    /* `行内代码` */
.pd-fence { color: #6a9955; }          /* ``` 围栏行 */
/* Prism token 类（md/xml/json/yaml）：.token.* */
```

参考 [demo/index.html](./demo/index.html) 的完整配色示例。

当前版本按内容自动增高；不要给编辑器设置会触发内部滚动的固定高度。固定高度滚动与高亮层同步留待后续版本实现。

## 内置编辑行为

- **回车续行**：序列项行（`-` 开头）回车 → 新行继承缩进并自动补 `-`；非序列项行回车保留缩进
- **Tab / Shift+Tab**：序列项行（`-` 开头，允许缩进）按 Tab 整行右缩进一个单位、Shift+Tab 整行左缩出一个单位（多行选区整体操作，空行跳过）；非序列项行 Tab 插入缩进单位
- **缩进单位**：默认两个空格，可用 `indentUnit` 选项配置
- **中文输入法**：组合期（拼音/五笔选字前）输入字符实时渲染（覆盖层同步），选字确认后正常触发 `onValueChange`（组合期不触发，避免宿主收到中间态）
- **撤销/重做**：Ctrl+Z 撤销 / Ctrl+Shift+Z 与 Ctrl+Y 重做，5 步记忆；快照含光标选区（恢复时光标一并回到当时位置，撤回到初始内容时光标回到首次变更点而非末尾）；保存节点有 1s 防抖（连续打字合并为一步，不逐字还原、不浪费记忆步数）；初始内容恒在栈底（可退回初始态，超限只挤掉最旧的非初始快照）；程序化 `setValue` 不入栈；新输入使重做失效
- 原生 textarea 行为保留（IME、selection、移动端触屏、粘贴）

## Demo

两种方式：

```bash
# ① 预构建（推荐：直接打开，无需服务）
pnpm --filter @andares/pdeditor build:demo   # 产物 demo-dist/（index.html + assets/）
# 直接双击 demo-dist/index.html（或 firefox.localhost 打开）即可

# ② vite dev（开发迭代：热更新）
pnpm --filter @andares/pdeditor dev          # 访问终端输出的端口（默认 http://localhost:5173/）
```

⚠️ 端口被占用时 vite 自动换端口并提示；若浏览器报脚本 MIME 拦截/404，先确认访问的是 vite 输出的端口（其他项目的 dev server 可能占用了默认端口）。

## 开发

```bash
pnpm install          # workspace 安装
pnpm --filter @andares/pdeditor test     # vitest + jsdom
pnpm --filter @andares/pdeditor build    # vite lib（ESM + CJS + d.ts）
```

## 未来方向（不在本包当前范围）

- 成品输入框（headless 核心 + UI 层）：格式切换器、Ctrl+G 放大模式、历史记录、工具栏
- 主题系统（CSS 变量）
- 移动端/触屏专项、协同（Yjs）
