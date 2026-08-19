import { createPdEditor, type EditorLang } from "../src/index";

const SAMPLE: Record<EditorLang, string> = {
	pd: `//!pd 基础设定
影像风格: 真人实拍，浓郁现代电影色彩
- 语言: 中文

//!pd 主任务
角色: 资深视觉特效导演
任务: 实现防抖搜索框
参考: :基础设定
- 镜头1:
  - 场景: 雨夜小巷
  - 运镜: 低角度跟拍
说明: 用 \`a: b\` 表示键值对
时间戳: clock:- 12:30 表示时间

\`\`\`json
{"镜头": {"运镜": "50mm"}}
\`\`\`
`,
	md: `# 标题

这是一个 **markdown** 示例，包含 \`行内代码\` 和列表：

- 第一项
- 第二项

\`\`\`js
const x = 1;
\`\`\`
`,
	xml: `<prompt>
  <role>资深工程师</role>
  <task>实现防抖搜索框</task>
  <constraints>
    <item>只输出 JSON</item>
    <item>不要编造事实</item>
  </constraints>
</prompt>
`,
	json: `{
  "角色": "资深工程师",
  "任务": "实现防抖搜索框",
  "约束": ["只输出 JSON", "不要编造事实"]
}
`,
	yaml: `角色: 资深工程师
任务: 实现防抖搜索框
约束:
  - 只输出 JSON
  - 不要编造事实
`,
};

const el = document.querySelector<HTMLDivElement>("#editor")!;
const langSel = document.querySelector<HTMLSelectElement>("#lang")!;
const fmtBtn = document.querySelector<HTMLButtonElement>("#fmt")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;

const editor = createPdEditor(el, {
	value: SAMPLE.pd,
	language: "pd",
	lineNumbers: false,
	// 覆盖层的几何样式从 Yace 根节点统一传入；不要分别设置 textarea / pre。
	styles: {
		fontSize: "14px",
		lineHeight: "20px",
		padding: "12px",
	},
	onValueChange: (v) => {
		status.textContent = `${v.length} 字符`;
	},
});

// 语言切换 = API（headless 无 UI 切换器，demo 里的 select 是外部框架的 UI）
langSel.addEventListener("change", () => {
	const lang = langSel.value as EditorLang;
	editor.setLanguage(lang);
	editor.setValue(SAMPLE[lang]);
	status.textContent = `语言: ${lang}`;
});

// 格式化按钮：pd 专用（复用主包 format 语义的简化版——此处演示 setValue 能力）
// 说明：headless MVP 不含格式化（依赖主包的 format 属成品层）；此按钮演示外部通过 setValue 更新
fmtBtn.addEventListener("click", () => {
	status.textContent =
		"headless MVP 不含格式化（成品层功能）——演示 setValue API";
	editor.setValue(editor.getValue()); // 无操作，仅演示 API 可用
});

// 暴露到 window 便于控制台验证
declare global {
	interface Window {
		pdEditor: ReturnType<typeof createPdEditor>;
	}
}
window.pdEditor = editor;
