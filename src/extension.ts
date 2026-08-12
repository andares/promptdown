import * as vscode from "vscode";
import { format } from "./format";
import {
	detectPdIntent,
	isPdMarkerLine,
	mayBeCommentLine,
} from "./auto-detect";
import { isPdFileName, pdToJsonText, sectionNames } from "./pd2json";

const PD_LANGUAGE = "promptdown";
/** 参与自动检测的语言：无格式归属的弱语法文件（untitled/txt/log 默认即 plaintext） */
const DETECT_LANGUAGES = new Set(["plaintext"]);

/** pd2json 命令：当前 PD 文档 → JSON（新开 untitled 文件，不覆盖原文档） */
async function runPd2Json(): Promise<void> {
	// ① 焦点判断：无活动编辑器 → 报错返回
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showErrorMessage(
			"pd2json: 当前没有活动编辑器，请先在编辑窗口打开 PD 文档",
		);
		return;
	}
	// ② 宽松 PD 判断：语言已识别 OR 文件名 .pd OR 内容含 //!pd 段标记（与自动检测同源）
	const doc = editor.document;
	const isPd =
		doc.languageId === PD_LANGUAGE ||
		isPdFileName(doc.fileName) ||
		detectPdIntent(doc.getText());
	if (!isPd) {
		vscode.window.showErrorMessage(
			`pd2json: 当前文档不是 PD 文档（语言: ${doc.languageId}）`,
		);
		return;
	}
	// ③ 多段文件：弹 QuickPick 选段（取消则静默返回）；单段/隐式段直接跳过
	const names = sectionNames(doc.getText());
	let section: string | undefined;
	if (names.length > 1) {
		const pick = await vscode.window.showQuickPick(
			names.map((n, i) => ({ label: n || "(未命名段)", index: i })),
			{ placeHolder: "文件包含多个 //!pd 段，请选择要转换的段" },
		);
		if (!pick) return;
		section = names[pick.index];
	}
	// ④ 解析（错误 → showErrorMessage）
	let json: string;
	try {
		json = pdToJsonText(doc.getText(), section);
	} catch (e) {
		vscode.window.showErrorMessage(`pd2json: ${(e as Error).message}`);
		return;
	}
	// ⑤ 新开 untitled JSON 文件（preview 模式 + 侧边打开，原文档不动）
	const untitled = await vscode.workspace.openTextDocument({
		language: "json",
		content: json,
	});
	await vscode.window.showTextDocument(untitled, {
		preview: true,
		viewColumn: vscode.ViewColumn.Beside,
	});
}

/**
 * promptdown 扩展入口：
 * 1. 注册文档格式化程序（promptdown 语言）
 * 2. pd2json 命令：当前 PD 文档解析为 JSON，新开 untitled 文件展示（不覆盖原文档）
 * 3. //!pd 自动检测：untitled / 未知扩展名等弱语法文件中出现 //!pd 段标记行时，
 *    把整个文档语言切换为 promptdown（打开时 + 输入时均检测）。
 */
export function activate(context: vscode.ExtensionContext): void {
	// ---- pd2json 命令 ----
	context.subscriptions.push(
		vscode.commands.registerCommand("promptdown.pd2json", runPd2Json),
	);

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
