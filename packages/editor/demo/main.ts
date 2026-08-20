import { createPdEditor, type EditorLang } from "../src/index";
// 语义操作（格式化 / 双向转换）：demo 直引主包源码（无 vscode 依赖的纯逻辑），
// 经 setValue 回写——这正是 AGENTS.md 写的"外部框架可自行调主包 format 后 setValue 回写"接入方式。
// 相对路径跨 workspace 引用仅存在于 demo（demo-dist 为本地产物，不进 npm 包）。
import { format } from "../../../src/format";
import { pdToJsonText, sectionNames } from "../../../src/pdtransform";
import { jsonToPdText, type JsonToPdResult } from "../../../src/jsonToPd";
import { splitSections } from "../../../src/parser/expand";

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
const transformBtn = document.querySelector<HTMLButtonElement>("#transform")!;
const status = document.querySelector<HTMLSpanElement>("#status")!;

// 当前语言（demo 自维护；UI 切换与转换按钮都会更新它，避免与编辑态脱节）
let currentLang: EditorLang = "pd";

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

// 状态提示：区内单条显示（错误/警告可能很长，直接截断防止撑爆布局）
function showStatus(msg: string): void {
	status.textContent = msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
}

// 语言切换 = API（headless 无 UI 切换器，demo 里的 select 是外部框架的 UI）
langSel.addEventListener("change", () => {
	const lang = langSel.value as EditorLang;
	currentLang = lang;
	editor.setLanguage(lang);
	editor.setValue(SAMPLE[lang]);
	status.textContent = `语言: ${lang}`;
});

// 格式化按钮（pd 专用）：调主包 format（键值规范化 + 顶格缩进修正）后 setValue 回写。
// headless 核心本身不含格式化语义，此按钮演示外部框架接入主包 format 的完整链路。
fmtBtn.addEventListener("click", () => {
	if (currentLang !== "pd") {
		showStatus("仅 pd 语法支持格式化");
		return;
	}
	const before = editor.getValue();
	let after: string;
	try {
		after = format(before);
	} catch (e) {
		showStatus(`格式化失败: ${(e as Error).message}`);
		return;
	}
	if (after === before) {
		showStatus("已是最佳格式");
		return;
	}
	editor.setValue(after);
	showStatus("已格式化");
});

// 转换按钮（JSON ↔ PD 双向，按当前语言决定方向）：整个内容替换对话框，可来回切换。
// pd → json：多段必须选段（与 VSCode pdtransform 语义一致）；demo 无选段 UI，直接报错列段名。
// json → pd：宽容模式（不符条目逐条警告，不整体失败），warnings 合并展示；结果再走 format。
transformBtn.addEventListener("click", () => {
	if (currentLang === "pd") {
		const text = editor.getValue();
		const sections = splitSections(text);
		if (sections.length > 1) {
			showStatus(
				`文件包含 ${sections.length} 个 pd 段（${sectionNames(text).join(", ")}），demo 转换仅支持单段，请先展开`,
			);
			return;
		}
		let json: string;
		try {
			json = pdToJsonText(text);
		} catch (e) {
			showStatus(`转换失败: ${(e as Error).message}`);
			return;
		}
		currentLang = "json";
		editor.setLanguage("json");
		editor.setValue(json);
		langSel.value = "json";
		showStatus(`已转换 JSON（${json.length} 字符，可再点转换转回 PD）`);
		return;
	}
	if (currentLang === "json") {
		let result: JsonToPdResult;
		try {
			result = jsonToPdText(editor.getValue());
		} catch (e) {
			showStatus(`转换失败: ${(e as Error).message}`);
			return;
		}
		const pd = format(result.pd);
		currentLang = "pd";
		editor.setLanguage("pd");
		editor.setValue(pd);
		langSel.value = "pd";
		showStatus(
			result.warnings.length > 0
				? `已转换 PD（${result.warnings.length} 条警告）：${result.warnings.join("；")}`
				: "已转换 PD（无警告）",
		);
		return;
	}
	showStatus("仅 pd / json 语法支持相互转换");
});

// 暴露到 window 便于控制台验证
declare global {
	interface Window {
		pdEditor: ReturnType<typeof createPdEditor>;
	}
}
window.pdEditor = editor;
