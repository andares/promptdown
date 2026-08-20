import { basename, extname } from "node:path";
import * as vscode from "vscode";
import {
	compilePdText,
	detectPdIntent,
	detectTransformKind,
	format,
	isPdMarkerLine,
	jsonToPdText,
	mayBeCommentLine,
	nameSections,
	pdToJsonText,
	splitSections,
	type JsonToPdResult,
	type Section,
} from "@andares/pdfoundation";
import { isListItemLine, listItemWsRun, tabUnit } from "./tab";

const PD_LANGUAGE = "promptdown";
/** 参与自动检测的语言：无格式归属的弱语法文件（untitled/txt/log 默认即 plaintext） */
const DETECT_LANGUAGES = new Set(["plaintext"]);

/** 文件主名（去扩展名）——无 //!pd 的隐式段用它作段名；untitled 无文件名 → "" */
function fileStemOf(doc: vscode.TextDocument): string {
	if (doc.uri.scheme !== "file") return "";
	return basename(doc.fileName, extname(doc.fileName));
}

/** QuickPick 显示规则：`<序号>[ <命名>]`（%1 aaa / %2）；选中值即 selector */
function sectionPicks(
	sections: Section[],
): { label: string; selector: string }[] {
	return sections.map((s, i) => ({
		label: s.name ? `%${i + 1} ${s.name}` : `%${i + 1}`,
		selector: `%${i + 1}`,
	}));
}

/** 多段 → QuickPick 选段（取消返回 null）；单段直接返回（不弹） */
async function pickSection(
	sections: Section[],
	placeHolder: string,
): Promise<string | null> {
	if (sections.length <= 1) return null;
	const pick = await vscode.window.showQuickPick(sectionPicks(sections), {
		placeHolder,
	});
	return pick ? pick.selector : null;
}

/**
 * pdtransform 命令：当前文档 PD ↔ JSON 双向转换。
 * pd→JSON 新开 Untitled 文件（原文档不动）；JSON→pd 直接变更当前文档（可撤销）。
 */
async function runPdTransform(): Promise<void> {
	// ① 焦点判断：无活动编辑器 → 报错返回
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage(
			"pdtransform: 当前没有活动编辑器，请先在编辑窗口打开 PD 或 JSON 文档",
		);
		return;
	}
	// ② 方向判定：语言优先（promptdown / json）→ 文件名 → 内容探针
	const doc = editor.document;
	let kind: "pd" | "json" | null = null;
	if (doc.languageId === PD_LANGUAGE) kind = "pd";
	else if (doc.languageId === "json" || doc.languageId === "jsonc")
		kind = "json";
	else kind = detectTransformKind(doc.fileName, doc.getText());
	if (!kind) {
		vscode.window.showErrorMessage(
			`pdtransform: 无法识别当前文档类型（语言: ${doc.languageId}），需要 PD 或 JSON 文档`,
		);
		return;
	}
	// ③ PD → JSON：多段文件弹 QuickPick 选段（%序号 [命名]），单段直接转
	if (kind === "pd") {
		const text = doc.getText();
		const stem = fileStemOf(doc);
		const sections = splitSections(text);
		nameSections(text, sections, stem);
		const selector = await pickSection(
			sections,
			"文件包含多个 //!pd 段，请选择要转换的段",
		);
		if (selector === null && sections.length > 1) return; // 取消
		let json: string;
		try {
			json = pdToJsonText(text, selector ?? undefined, stem);
		} catch (e) {
			vscode.window.showErrorMessage(`pdtransform: ${(e as Error).message}`);
			return;
		}
		// ④ 新开 untitled JSON 文件（preview 模式 + 侧边打开，原文档不动）
		const untitled = await vscode.workspace.openTextDocument({
			language: "json",
			content: json,
		});
		await vscode.window.showTextDocument(untitled, {
			preview: true,
			viewColumn: vscode.ViewColumn.Beside,
		});
		return;
	}
	// ⑤ JSON → PD：直接变更当前文档（不新开文件；WorkspaceEdit 可撤销，
	// 保存由用户控制）；语言切到 promptdown 获得正确高亮；警告合并弹一次错误窗
	let result: JsonToPdResult;
	try {
		result = jsonToPdText(doc.getText());
	} catch (e) {
		vscode.window.showErrorMessage(`pdtransform: ${(e as Error).message}`);
		return;
	}
	const pd = format(result.pd);
	const fullRange = new vscode.Range(
		doc.positionAt(0),
		doc.positionAt(doc.getText().length),
	);
	const edit = new vscode.WorkspaceEdit();
	edit.replace(doc.uri, fullRange, pd);
	const applied = await vscode.workspace.applyEdit(edit);
	if (!applied) {
		vscode.window.showErrorMessage("pdtransform: 无法变更当前文档");
		return;
	}
	if (doc.languageId !== PD_LANGUAGE) {
		await vscode.languages.setTextDocumentLanguage(doc, PD_LANGUAGE);
	}
	if (result.warnings.length > 0) {
		vscode.window.showErrorMessage(`pdtransform: ${result.warnings.join("\n")}`);
	}
}

// ---- pdcompile 命令 ----

/**
 * pdcompile 命令：当前 PD 文档选中段 → 编译（引用内联展开 + 统一 format）
 * 结果新开 untitled PD 文件，不覆盖原文档。
 */
async function runPdCompile(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage(
			"pdcompile: 当前没有活动编辑器，请先在编辑窗口打开 PD 文档",
		);
		return;
	}
	const doc = editor.document;
	const text = doc.getText();
	// 类型校验：语言/文件名/内容探针都不是 pd → 报错（防把 JSON 等文本当 pd 编译）
	if (
		doc.languageId !== PD_LANGUAGE &&
		detectTransformKind(doc.fileName, text) !== "pd"
	) {
		vscode.window.showErrorMessage(
			`pdcompile: 无法识别当前文档为 PD（语言: ${doc.languageId}），请先打开 PD 文档`,
		);
		return;
	}
	const stem = fileStemOf(doc);
	const sections = splitSections(text);
	nameSections(text, sections, stem);
	const selector = await pickSection(
		sections,
		"请选择要编译的段（引用将内联展开）",
	);
	if (selector === null && sections.length > 1) return; // 取消
	let pd: string;
	try {
		pd = compilePdText(text, selector ?? undefined, stem);
	} catch (e) {
		vscode.window.showErrorMessage(`pdcompile: ${(e as Error).message}`);
		return;
	}
	const untitled = await vscode.workspace.openTextDocument({
		language: PD_LANGUAGE,
		content: pd,
	});
	await vscode.window.showTextDocument(untitled, {
		preview: true,
		viewColumn: vscode.ViewColumn.Beside,
	});
}

/**
 * 整行右缩进一个缩进单位；序列项行同时把 `-` 后空白规范化为单个半角空格。
 * 每行两个互不重叠的编辑：行首插入缩进单位 + 空白段小范围替换。
 * 光标由 VSCode 原生调整（插入点前移 → 光标跟随文本；恰在插入点 col 0 → 不动），
 * 与原生 indentLines 的光标语义一致，无需手动还原。
 */
function indentLines(
	editor: vscode.TextEditor,
	lines: number[],
	unit: string,
): void {
	const doc = editor.document;
	void editor.edit((edit) => {
		// 去重：同一行只编一次（防多光标/选区重叠导致 “overlapping edits” 报错）
		for (const line of new Set(lines)) {
			const run = listItemWsRun(doc.lineAt(line).text);
			edit.insert(new vscode.Position(line, 0), unit);
			if (run?.normalize) {
				edit.replace(new vscode.Range(line, run.start, line, run.end), " ");
			}
		}
	});
}

/**
 * Tab 键命令：序列项行（`-` 开头，`-` 后可无空白）整行右缩进并把 `-` 后规范化为单空格，
 * 其余行还原默认 Tab 行为（插入缩进单位）。
 */
function registerTabCommand(): vscode.Disposable {
	return vscode.commands.registerTextEditorCommand(
		"promptdown.tab",
		(editor) => {
			const doc = editor.document;
			const config = vscode.workspace.getConfiguration("editor", doc);
			const indentSize = config.get<number | "tabSize">("indentSize");
			const unit = tabUnit(
				config.get<boolean>("insertSpaces", true),
				typeof indentSize === "number"
					? indentSize
					: config.get<number>("tabSize", 4),
			);

			// ① 跨行选区：所有选区涉及的行整体缩进（与原生多行缩进一致）
			if (
				editor.selections.some((s) => !s.isEmpty && s.start.line !== s.end.line)
			) {
				const lines = new Set<number>();
				for (const s of editor.selections) {
					for (let l = s.start.line; l <= s.end.line; l++) lines.add(l);
				}
				indentLines(editor, [...lines], unit);
				return;
			}

			// ② 所有光标所在行都是序列项行 → 整行缩进
			if (
				editor.selections.every((s) =>
					isListItemLine(doc.lineAt(s.active.line).text),
				)
			) {
				indentLines(
					editor,
					editor.selections.map((s) => s.active.line),
					unit,
				);
				return;
			}

			// ③ 其余情况：还原默认 Tab 行为 —— 插入缩进单位
			void editor.edit((edit) => {
				for (const s of editor.selections) {
					if (s.isEmpty) edit.insert(s.active, unit);
					else edit.replace(s, unit);
				}
			});
		},
	);
}

/**
 * promptdown 扩展入口：
 * 1. 注册文档格式化程序（promptdown 语言）
 * 2. pdtransform 命令：当前文档 PD ↔ JSON 双向转换（pd→JSON 新开 Untitled，JSON→pd 变更当前）
 * 3. pdcompile 命令：选中段编译为单份完整 pd（引用内联展开 + format），新开 Untitled
 * 4. //!pd 自动检测：untitled / 未知扩展名等弱语法文件中出现 //!pd 段标记行时，
 *    把整个文档语言切换为 promptdown（打开时 + 输入时均检测）。
 */
export function activate(context: vscode.ExtensionContext): void {
	// ---- pdtransform 命令 ----
	context.subscriptions.push(
		vscode.commands.registerCommand("pdtransform", runPdTransform),
	);

	// ---- pdcompile 命令 ----
	context.subscriptions.push(
		vscode.commands.registerCommand("pdcompile", runPdCompile),
	);

	// ---- Tab 键：序列项行（`-` 开头）整行右缩进，其余插入 tab ----
	context.subscriptions.push(registerTabCommand());

	// ---- 格式化程序（promptdown 语言） ----
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(PD_LANGUAGE, {
			provideDocumentFormattingEdits(
				document: vscode.TextDocument,
			): vscode.TextEdit[] {
				const text = document.getText();
				const formatted = format(text);
				if (formatted === text) return [];
				const fullRange = new vscode.Range(
					document.positionAt(0),
					document.positionAt(text.length),
				);
				return [vscode.TextEdit.replace(fullRange, formatted)];
			},
		}),
	);

	// ---- //!pd 自动检测 ----
	/** 会话内已切换（或已判定无需切换）的文档，每文档最多一次语言切换 */
	const switched = new Set<string>();

	function shouldAutoDetect(): boolean {
		return vscode.workspace
			.getConfiguration("promptdown")
			.get<boolean>("autoDetect", true);
	}

	/** 切换为 promptdown 语言（守卫：开关/语言类型/已处理） */
	function switchDocument(document: vscode.TextDocument): void {
		const uri = document.uri.toString();
		if (switched.has(uri)) return;
		if (!shouldAutoDetect()) return;
		// 只对无格式归属的弱语法文件生效，不覆盖用户已选语言（md/js/ts...）
		if (!DETECT_LANGUAGES.has(document.languageId)) return;
		if (document.languageId === PD_LANGUAGE) return;

		switched.add(uri);
		// 切换失败（如文档并发关闭/语言被占用）时回滚标记，允许下一次输入重试
		void vscode.languages.setTextDocumentLanguage(
			document,
			PD_LANGUAGE,
		).then(
			() => undefined, // 成功：保持标记（本会话不再切）
			() => switched.delete(uri), // 失败：允许重试
		);
	}

	// 打开时：扫前 50 行，出现 //!pd 段标记行即切换
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (detectPdIntent(document.getText())) switchDocument(document);
		}),
	);

	// 激活补扫：onStartupFinished 激活晚于会话恢复的文档打开事件——
	// 恢复的 untitled（含 //!pd）等已打开文档在此补一次检测，不依赖错过的事件
	for (const document of vscode.workspace.textDocuments) {
		if (detectPdIntent(document.getText())) switchDocument(document);
	}

	// 输入时：三层预筛（语言 → 行首注释特征 → 段标记行），把正则执行压到最低
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (!DETECT_LANGUAGES.has(event.document.languageId)) return;
			for (const change of event.contentChanges) {
				const line = event.document.lineAt(change.range.start.line).text;
				if (!mayBeCommentLine(line)) continue;
				if (isPdMarkerLine(line)) {
					switchDocument(event.document);
					return;
				}
			}
		}),
	);

	// 关闭时：移除记录，重开文件可重新检测
	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument((document) => {
			switched.delete(document.uri.toString());
		}),
	);
}

export function deactivate(): void {}
