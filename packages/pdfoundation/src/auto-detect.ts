/**
 * //!pd 自动检测的纯逻辑（不依赖 vscode API，可单测）。
 *
 * 用途：untitled / 未知扩展名等**无格式归属的弱语法文件**（默认 plaintext）中，
 * 出现 //!pd 段标记行时，把整个文档语言切换为 promptdown，从而获得语法高亮与格式化。
 * 有自身语法的文件（md/js/ts...）不参与检测（由 extension.ts 的 languageId 守卫排除）。
 */

/** 段标记行：行首（允许缩进）+ //!pd + 词边界（防 //!pdx 误判） */
const PD_MARKER_LINE_RE = /^\s*\/\/!pd\b/;

/** 预筛：行首（允许缩进）是 // —— 只有注释风格的行才可能成为段标记 */
const PD_PREFIX_RE = /^\s*\/\//;

/**
 * 打开时检测：只扫前 maxLines 行（段标记总在文档开头附近），
 * 任一行为段标记行即判定为 pd 意图；避免全文扫描大文件。
 * ``` 围栏内的 //!pd 行不算段标记（与 splitSections 同规则）。
 */
export function detectPdIntent(text: string, maxLines = 50): boolean {
 const lines = text.split(/\r?\n/, maxLines + 1);
 const n = Math.min(lines.length, maxLines);
 let inFence = false;
 for (let i = 0; i < n; i++) {
  const line = lines[i] as string;
  if (!inFence && PD_MARKER_LINE_RE.test(line)) return true;
  if (line.trim().startsWith("```")) inFence = !inFence;
 }
 return false;
}

/**
 * 输入时预筛：变更行行首是 //（含缩进）才可能成为段标记。
 * 普通文本行 / IME 输入 / 行中编辑直接跳过，避免无谓正则。
 */
export function mayBeCommentLine(line: string): boolean {
 return PD_PREFIX_RE.test(line);
}

/** 输入时完整判定：变更行已是 //!pd 段标记行 */
export function isPdMarkerLine(line: string): boolean {
 return PD_MARKER_LINE_RE.test(line);
}
