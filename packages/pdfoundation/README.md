# @andares/pdfoundation

[promptdown](https://github.com/andares/promptdown)（`.pd` 极简标记语言）的**共享语义核心**——解析 / 格式化 / 双向转换，零运行时依赖，Node 与 Web 通用。

主包 [`@andares/promptdown`](https://www.npmjs.com/package/@andares/promptdown)（VSCode 扩展 + CLI）与 [`@andares/pdeditor`](https://www.npmjs.com/package/@andares/pdeditor)（headless 输入框组件）共同依赖本包，保证语义单一来源、零漂移。语法规范见 [docs/SPEC.md](https://github.com/andares/promptdown/blob/master/docs/SPEC.md)（唯一事实来源）。

## 安装

```bash
npm install @andares/pdfoundation
```

## 用法

```ts
import {
    format,          // 格式化（全角冒号→半角、键值规范化、顶层缩进修正）
    pdToJsonText,    // pd → JSON（解析错误抛异常，message 含行号）
    jsonToPdText,    // JSON → pd（宽容模式：不符合条目逐条警告，不整体失败）
    compilePdText,   // 多段编译：选段 + :refname / :%N 引用内联展开 + 统一 format
    detectTransformKind, // 识别输入是 pd 还是 json
    splitSections,   // 段切分（围栏感知）
} from "@andares/pdfoundation";

const json = pdToJsonText("//!pd 主段\n角色: 资深工程师\n约束:\n  - 只输出 JSON\n");
const pd = format(jsonToPdText(json).pd); // 回环
```

- ESM / CJS 双格式（`exports` 映射），`sideEffects: false` 可树摇
- 更多 API：`sectionNames` / `selectSection` / `expand` / `detectPdIntent` 等，见 `dist/index.d.ts`

## License

MIT
