/** 词法行类型 */
export type LineKind =
	| "section" // //!pd <name>
	| "separator" // ---
	| "key" // key: content（裸键值）
	| "item-key" // - key: content（带-键值）
	| "item" // - content
	| "text" // content（裸内容行）
	| "blank"; // 空行

export interface PLine {
	kind: LineKind;
	indent: number; // 行首空格数
	text: string; // 语义内容（trim 后）
	raw: string; // 原始行
	lineNo: number; // 1-based
	key?: string; // key/item-key：键名
	value?: string; // key/item-key：冒号后内容（trim，可空）
}

/** 顺序条目：键 或 Info 段（保持 JSON 键顺序） */
export type OrderEntry =
	| { kind: "key"; name: string }
	| { kind: "info"; index: number };

/** AST 块（根/裸键值块/Subject/带-块 共用） */
export class Block {
	name = ""; // 键名 / SubjectN / 根 ""
	baseIndent = Number.NEGATIVE_INFINITY; // 带-块 = 行缩进；其余 -∞
	parent: Block | null = null;
	inline: string | null = null; // key 行冒号后内容（若有）
	entries = new Map<string, Block>(); // 子键
	order: OrderEntry[] = []; // 键 + Info 混合顺序
	infos: string[][] = []; // Info1 = infos[0]...
	/** 解析内部状态 */
	curInfo = -1; // 当前 Info 索引（-1 = 无）
	lastWasKey = false; // 上一个操作是否键值（决定新 Info 段/新 Subject）
}

export interface PError {
	lineNo: number;
	message: string;
	raw: string;
}

export interface PdDoc {
	root: Block;
	blocks: Block[];
	errors: PError[];
}
