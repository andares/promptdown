import { lexLine, matchKeyValue, splitInlineCode } from "./parser/lexer";

/**
 * JSON → pd 渲染器（`toJson` 的反向，仅接受 toJson 可产出的"规范 JSON"子集）。
 *
 * 值类型规则：
 * - 字符串（单行、非空、首尾无空白）→ `key: value` / `- key: value`（与折叠规则互逆）
 * - number / boolean / null → `${v}` 转文本（逐条警告，不丢弃）
 * - 对象 → `key:` + 子内容；空对象 → 裸 `key:`
 * - InfoN（编号连续递增、中间隔有键/代码块、非空数组）→ 内容行；
 *   键形首项（来自键行内联值）→ 还原为 `key: <值>` 内联行
 * - CodeN（编号连续递增、仅顶层块、body/lang 形状合法）→ ``` 围栏；
 *   无法作为围栏渲染的 CodeN 键（无 body/非顶层/编号不符）按命名子键渲染（回环安全）
 * - 结构性不符合的条目 → 丢弃（逐条警告）
 *
 * 顶层渲染：
 * - 带子域键值后跟下一个顶层条目 → 空一行（唯一空行来源）
 * - 裸 Subject 块（全 InfoN/CodeN 的 SubjectN）→ 裸文本行/代码块，不输出 SubjectN: 头
 * - 非首个裸 Subject 块前输出 `---`（解析器只有 `---` 能把栈回根；
 *   键块/Subject 后的裸内容行都会附着到前一块）
 */

export interface JsonToPdResult {
	pd: string;
	warnings: string[];
}

const KEY_RE = /^[^\s:][^:]*$/; // lexer 键名约束（首字符非空白/冒号，其余非冒号）
const INFO_RE = /^Info(\d+)$/;
const CODE_RE = /^Code(\d+)$/;
const SUBJECT_RE = /^Subject\d+$/;

type EntryKind = "dropped" | "simple" | "structured" | "bare";

/** 根必须是对象；整棵树的渲染入口 */
export function jsonToPdText(jsonText: string): JsonToPdResult {
	let data: unknown;
	try {
		data = JSON.parse(jsonText.trim()); // trim 同时吃掉 BOM
	} catch {
		throw new Error("不是有效的 JSON 文本");
	}
	if (typeof data !== "object" || data === null || Array.isArray(data)) {
		throw new Error("JSON 根必须是对象");
	}
	const warnings: string[] = [];
	const out: string[] = [];
	renderRoot(data as Record<string, unknown>, out, warnings);
	return { pd: out.join("\n"), warnings };
}

/**
 * 键名可回环判定（与 lexer 严格键值规则一致：首字符非空白/冒号、不含冒号、不以空白结尾）。
 */
function validKey(key: string): boolean {
	return KEY_RE.test(key) && !/\s$/.test(key);
}

/** CodeN 值形状（对象；body/lang 类型在渲染时再校验） */
function isCodeObj(v: unknown): boolean {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 块首 Info1 首元素是否为可内联的键形内容。
 * toJson 中键形 Info 项只可能来自键行内联值（`a: a: b` + 后续内容行 →
 * {"a": {"Info1": ["a: b", ...]}}）；它无法作为 `- a: b` 渲染（会变成 item-key），
 * 只能还原为 `key: a: b` 内联行。仅键形（matchKeyValue 命中）才需要内联。
 */
function inlineCandidate(obj: Record<string, unknown>): string | null {
	const first = Object.entries(obj)[0];
	if (!first) return null;
	const [k, v] = first;
	if (k !== "Info1" || !Array.isArray(v) || v.length === 0) return null;
	const el = v[0];
	if (typeof el !== "string") return null;
	if (el === "" || el.includes("\n") || /^\s/.test(el) || /\s$/.test(el)) {
		return null;
	}
	return matchKeyValue(el) ? el : null;
}

/** CodeN 完整校验：body 必为字符串、lang 可选字符串 */
function codeParts(v: object): { lang?: string; body: string } | null {
	const obj = v as Record<string, unknown>;
	if (typeof obj.body !== "string") return null;
	if (obj.lang !== undefined && typeof obj.lang !== "string") return null;
	return { lang: obj.lang as string | undefined, body: obj.body };
}

/** 顶层渲染：空行规则 + 裸 Subject 块的 `---` 规则 */
function renderRoot(
	obj: Record<string, unknown>,
	out: string[],
	warnings: string[],
): void {
	let first = true;
	for (const [key, value] of Object.entries(obj)) {
		const entry: string[] = [];
		const kind = renderRootEntry(key, value, entry, warnings);
		if (entry.length === 0) continue; // 整条目被丢弃，不留痕迹
		if (!first && kind === "bare") out.push("---"); // 裸块回根
		out.push(...entry);
		first = false;
	}
	// 空行规则（带子域键值后空一行）已移入 format() 统一处理
}

function renderRootEntry(
	key: string,
	value: unknown,
	entry: string[],
	warnings: string[],
): EntryKind {
	if (!validKey(key)) {
		warnings.push(`${key}: 键名不符合规则，已丢弃`);
		return "dropped";
	}
	if (typeof value === "string") {
		const before = entry.length;
		renderStringValue(key, value, "", entry, warnings, "");
		return entry.length > before ? "simple" : "dropped";
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null
	) {
		entry.push(`${key}: ${String(value)}`);
		warnings.push(`${key}: ${String(value)} 已转文本`);
		return "simple";
	}
	if (Array.isArray(value)) {
		warnings.push(
			INFO_RE.test(key)
				? `${key}: 顶层不支持 InfoN 键，已丢弃`
				: `${key}: 数组，不符合 pd 结构，已丢弃`,
		);
		return "dropped";
	}
	if (typeof value !== "object" || value === null) return "dropped";

	const obj = value as Record<string, unknown>;
	// 根 CodeN（如 {"Code1": {"body": "x"}}）在 toJson 里就是名为 Code1 的键块，按普通键块渲染

	// SubjectN 全 InfoN/CodeN → 裸内容块（还原手写 pd 的散文/代码块观感）
	// （首项可内联的键块除外——内联行才能回环）
	const inline = inlineCandidate(obj);
	if (SUBJECT_RE.test(key) && inline === null && isAllInfoCode(obj)) {
		const sub: string[] = [];
		renderBlock(obj, 1, sub, warnings, `${key}.`, true);
		if (sub.length === 0) {
			// 内容全被丢弃 / 空对象 → 退化为裸键（回环安全）
			entry.push(`${key}:`);
			return "simple";
		}
		entry.push(...sub);
		return "bare";
	}

	// 常规键块；Info1 首项键形 → 渲染为内联键值行
	if (inline === null) {
		entry.push(`${key}:`);
		renderBlock(obj, 1, entry, warnings, `${key}.`);
	} else {
		entry.push(`${key}: ${inline}`);
		renderBlock(obj, 1, entry, warnings, `${key}.`, false, true);
	}
	return entry.length > 1 ? "structured" : "simple";
}

/** SubjectN 是否全部为 InfoN/CodeN 条目（无命名子键） */
function isAllInfoCode(obj: Record<string, unknown>): boolean {
	if (Object.keys(obj).length === 0) return false;
	for (const [k, v] of Object.entries(obj)) {
		if (INFO_RE.test(k) && Array.isArray(v)) continue;
		if (CODE_RE.test(k) && isCodeObj(v)) continue;
		return false;
	}
	return true;
}

/**
 * 渲染块的子内容。depth = 块深度（根 0 / 根键块 1），子行缩进 = 2 * (depth - 1)：
 * 根键块的子行在缩进 0，孙块在 2，依此类推（与 parser 按 baseIndent 找爸爸兼容）。
 * bare=true：Info 内容渲染为裸文本行（顶层 Subject 专用）。
 */
function renderBlock(
	obj: Record<string, unknown>,
	depth: number,
	out: string[],
	warnings: string[],
	path: string,
	bare = false,
	skipFirstInfoItem = false,
): void {
	const indent = " ".repeat(Math.max(0, 2 * (depth - 1)));
	let expectedInfo = 1;
	let expectedCode = 1;
	let lastWasInfo = false; // 相邻 Info 段中间必须隔键/代码块，否则解析时会合并
	let skipped = false; // 首段首项已内联 → 跳过（只作用于首个 InfoN）

	for (const [key, value] of Object.entries(obj)) {
		const infoMatch = INFO_RE.exec(key);
		if (infoMatch && Array.isArray(value)) {
			const n = Number(infoMatch[1]);
			if (n !== expectedInfo || lastWasInfo) {
				warnings.push(`${path}${key}: Info 编号不连续或相邻段，已丢弃`);
				continue;
			}
			let items: unknown[] = value;
			if (skipFirstInfoItem && !skipped) {
				items = value.slice(1); // 首项已渲染为内联键值行
				skipped = true;
			}
			if (items.length === 0) {
				// 单条内联内容：无需内容行（键行本身携带）
				expectedInfo++;
				lastWasInfo = true;
				continue;
			}
			renderInfoItems(key, items, indent, out, warnings, path, bare);
			expectedInfo++;
			lastWasInfo = true;
			continue;
		}

		const codeMatch = CODE_RE.exec(key);
		if (codeMatch && isCodeObj(value)) {
			const n = Number(codeMatch[1]);
			const parts = codeParts(value as object);
			if (
				depth === 1 &&
				parts &&
				n === expectedCode &&
				!(parts.lang !== undefined && parts.lang.includes("\n")) &&
				!parts.body.split(/\r?\n/).some((l) => l.startsWith("```"))
			) {
				out.push(`${indent}\`\`\`${(parts.lang ?? "").trim()}`);
				out.push(...parts.body.split(/\r?\n/));
				out.push(`${indent}\`\`\``);
				expectedCode++;
				lastWasInfo = false;
				continue;
			}
			// 无法作为围栏渲染（无 body/非顶层/编号不符/内容含围栏标记）：
			// 它是名为 CodeN 的普通子键块，落到命名子键分支（回环安全）。
		}

		// 命名子键
		if (!validKey(key)) {
			warnings.push(`${path}${key}: 键名不符合规则，已丢弃`);
			continue;
		}
		if (renderNamedKey(key, value, indent, depth, out, warnings, path)) {
			lastWasInfo = false; // 渲染成功的键值行打断 Info 连续段；被丢弃的不算
		}
	}
}

function renderNamedKey(
	key: string,
	value: unknown,
	indent: string,
	depth: number,
	out: string[],
	warnings: string[],
	path: string,
): boolean {
	if (typeof value === "string") {
		const before = out.length;
		renderStringValue(key, value, `${indent}- `, out, warnings, path);
		return out.length > before;
	}
	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		value === null
	) {
		out.push(`${indent}- ${key}: ${String(value)}`);
		warnings.push(`${path}${key}: ${String(value)} 已转文本`);
		return true;
	}
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const obj = value as Record<string, unknown>;
		const inline = inlineCandidate(obj);
		if (inline === null) {
			out.push(`${indent}- ${key}:`);
			renderBlock(obj, depth + 1, out, warnings, `${path}${key}.`);
		} else {
			out.push(`${indent}- ${key}: ${inline}`);
			renderBlock(obj, depth + 1, out, warnings, `${path}${key}.`, false, true);
		}
		return true;
	}
	warnings.push(`${path}${key}: 数组，不符合 pd 结构，已丢弃`);
	return false;
}

/** 字符串值渲染（`key: value` 或 `- key: value`）；不符合规则的丢弃 */
function renderStringValue(
	key: string,
	value: string,
	prefix: string,
	out: string[],
	warnings: string[],
	path: string,
): void {
	if (value === "") {
		warnings.push(`${path}${key}: 空字符串，已丢弃`);
		return;
	}
	if (value.includes("\n")) {
		warnings.push(`${path}${key}: 多行字符串，已丢弃`);
		return;
	}
	if (/^\s/.test(value) || /\s$/.test(value)) {
		warnings.push(`${path}${key}: 首尾空白，已丢弃`);
		return;
	}
	out.push(`${prefix}${key}: ${value}`);
}

/**
 * InfoN 内容项的第一个冒号转义（仅对 InfoN 数组内字串）：
 * 半角 `:` → `:-`、全角 `：` → `：-`，冒号后字符保留（`: ` → `:- `）。
 * 防自动 format 把内容项变成键值（format 会把无空格冒号/全角冒号规范化为 `: `）。
 * 行内代码段内的冒号不转义（整体字串）；已含 `:-`/`：-` 的项整行已安全，不转。
 * 无需要转义的冒号 → 返回 null。
 */
function escapeColonInItem(el: string): string | null {
	let pos = 0;
	for (const { code, seg } of splitInlineCode(el)) {
		if (!code) {
			if (seg.includes(":-") || seg.includes("：-")) return null; // 整行已转义
			const idx = seg.search(/[：:]/);
			if (idx !== -1) {
				const at = pos + idx;
				return el.slice(0, at + 1) + "-" + el.slice(at + 1); // 冒号后插 `-`，后续保留
			}
		}
		pos += seg.length;
	}
	return null;
}

/**
 * InfoN 内容项渲染。bare=true（顶层 Subject）时输出裸文本行。
 * 含冒号的内容项：第一个冒号（代码段外）转义为 `:-` / `：-`（保留后续字符），
 * 转回后仍是文本不是键值；段标记/分隔线/围栏形内容仍丢弃（无法转义）。
 */
function renderInfoItems(
	key: string,
	items: unknown[],
	indent: string,
	out: string[],
	warnings: string[],
	path: string,
	bare: boolean,
): void {
	for (let i = 0; i < items.length; i++) {
		const el = items[i] as unknown;
		const loc = `${path}${key}[${i}]`;
		if (typeof el === "string") {
			if (el === "") {
				warnings.push(`${loc}: 空字符串，已丢弃`);
				continue;
			}
			if (el.includes("\n")) {
				warnings.push(`${loc}: 多行字符串，已丢弃`);
				continue;
			}
			if (/^\s/.test(el) || /\s$/.test(el)) {
				warnings.push(`${loc}: 首尾空白，已丢弃`);
				continue;
			}
			if (el.startsWith("```")) {
				warnings.push(`${loc}: 内容形似围栏标记，已丢弃`);
				continue;
			}
			const escaped = escapeColonInItem(el);
			if (escaped !== null) {
				out.push(bare ? escaped : `${indent}- ${escaped}`);
				continue;
			}
			// 无冒号：段标记/分隔线/空序列项形内容仍丢弃
			if (bare) {
				const kind = lexLine(el, 0).kind;
				if (
					kind === "section" ||
					kind === "separator" ||
					(kind === "item" && el.trim() === "-")
				) {
					warnings.push(`${loc}: 内容形似段标记/分隔线，已丢弃`);
					continue;
				}
			}
			out.push(bare ? el : `${indent}- ${el}`);
			continue;
		}
		if (typeof el === "number" || typeof el === "boolean" || el === null) {
			out.push(bare ? String(el) : `${indent}- ${String(el)}`);
			warnings.push(`${loc}: ${String(el)} 已转文本`);
			continue;
		}
		warnings.push(`${loc}: 对象/数组元素，已丢弃`);
	}
}
