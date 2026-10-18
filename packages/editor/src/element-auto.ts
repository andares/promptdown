import { definePdEditor } from "./element";

// 副作用入口：import 即注册 <pd-editor>。Node/SSR 下 definePdEditor 安全返回 null，
// 不会触碰 HTMLElement/customElements。package.json 的 sideEffects 只标记本文件。
definePdEditor();

export * from "./element";
