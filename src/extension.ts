import * as vscode from "vscode";
import { format } from "./format";
import {
	detectPdIntent,
	isPdMarkerLine,
	mayBeCommentLine,
} from "./auto-detect";
import { jsonToPdText, type JsonToPdResult } from "./jsonToPd";
import { splitSections } from "./parser/expand";
import {
	pdToJsonText,
	resolveSectionName,
	detectTransformKind,
} from "./pdtransform";
import { isListItemLine, listItemWsRun, tabUnit } from "./tab";

const PD_LANGUAGE = "promptdown";
/** 参与自动检测的语言：无格式归属的弱语法文件（untitled/txt/log 默认即 plaintext） */
const DETECT_LANGUAGES = new Set(["plaintext"]);

/**
 * pdtransform 命令：当前文档 PD ↔ JSON 双向转换。
 * 结果一律新开一个 Untitled（未保存）文件展示，**绝不覆盖原文档**（两个方向都是）。
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
	// ③ PD → JSON：多段文件弹 QuickPick 选段（带序号，未命名段也能选）
	if (kind === "pd") {
		const sections = splitSections(doc.getText());
		let section: string | undefined;
		if (sections.length > 1) {
			const pick = await vscode.window.showQuickPick(
				sections.map((s, i) => ({
					label: s.name ? `#${i + 1} ${s.name}` : `#${i + 1} (未命名段)`,
					index: i,
				})),
				{ placeHolder: "文件包含多个 //!pd 段，请选择要转换的段" },
			);
			if (!pick) return;
			try {
				section = resolveSectionName(sections, String(pick.index + 1));
			} catch (e) {
				vscode.window.showErrorMessage(`pdtransform: ${(e as Error).message}`);
				return;
			}
		}
		let json: string;
		try {
			json = pdToJsonText(doc.getText(), section);
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
	// ⑤ JSON → PD：先转换，再新开 untitled PD 文件；警告合并弹一次错误窗
	let result: JsonToPdResult;
	try {
		result = jsonToPdText(doc.getText());
	} catch (e) {
		vscode.window.showErrorMessage(`pdtransform: ${(e as Error).message}`);
		return;
	}
	const untitled = await vscode.workspace.openTextDocument({
		language: PD_LANGUAGE,
		content: result.pd,
	});
	await vscode.window.showTextDocument(untitled, {
		preview: true,
		viewColumn: vscode.ViewColumn.Beside,
	});
	if (result.warnings.length > 0) {
		vscode.window.showErrorMessage(`pdtransform: ${result.warnings.join("\n")}`);
	}
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
 * 2. pdtransform 命令：当前文档 PD ↔ JSON 双向转换，结果新开 untitled 文件（不覆盖原文档）
 * 3. //!pd 自动检测：untitled / 未知扩展名等弱语法文件中出现 //!pd 段标记行时，
 *    把整个文档语言切换为 promptdown（打开时 + 输入时均检测）。
 */
export function activate(context: vscode.ExtensionContext): void {
	// ---- pdtransform 命令 ----
	context.subscriptions.push(
		vscode.commands.registerCommand("pdtransform", runPdTransform),
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
		void vscode.languages.setTextDocumentLanguage(document, PD_LANGUAGE);
	}

	// 打开时：扫前 50 行，出现 //!pd 段标记行即切换
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument((document) => {
			if (detectPdIntent(document.getText())) switchDocument(document);
		}),
	);

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
