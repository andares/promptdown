import * as vscode from "vscode";
import { format } from "./format";

/**
 * promptdown 扩展入口：注册文档格式化程序。
 * 触发方式：默认格式化热键（Shift+Alt+F）、右键 Format Document、
 * 或用户自定义的 keybinding；配合 editor.formatOnSave 可保存时格式化。
 */
export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider("promptdown", {
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
}

export function deactivate(): void {}
