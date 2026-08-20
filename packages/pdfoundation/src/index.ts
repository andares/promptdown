// @andares/pdfoundation —— promptdown 共享语义核心（零运行时依赖，Node 与 Web 通用）。
// 主包（VSCode 扩展 + CLI）与 @andares/pdeditor（headless 输入框）共同依赖本包，
// 保证格式 / 转换 / 段解析语义单一来源。侧链：sideEffects:false，消费方可按导出树摇。

// 格式化
export { format } from "./format";

// pd ↔ JSON 双向转换与段编译
export {
	compilePdText,
	compileSections,
	pdToJsonText,
	detectTransformKind,
	isPdFileName,
	isJsonFileName,
	sectionNames,
} from "./pdtransform";

// JSON → pd（宽容模式：不符合条目逐条警告，不整体失败）
export { jsonToPdText, type JsonToPdResult } from "./jsonToPd";

// pd 意图检测（疑似文件 / 行分类）
export {
	detectPdIntent,
	isPdMarkerLine,
	mayBeCommentLine,
} from "./auto-detect";

// 段切分 / 寻址 / 引用展开
export {
	type Section,
	escapeSectionName,
	splitSections,
	hasSectionMarkers,
	nameSections,
	findSection,
	resolveSection,
	selectSection,
	expandSectionText,
	expand,
} from "./parser/expand";

// 行内代码拆段（`code` 配对标记）：工具函数（perf 基准 / 消费方文本处理用）
export { splitInlineCode } from "./parser/lexer";
