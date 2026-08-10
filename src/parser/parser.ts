import { Block, type PdDoc, type PError, type PLine } from "./types";

const NEG_INF = Number.NEGATIVE_INFINITY;

function newBlock(name: string, baseIndent: number, parent: Block): Block {
	const b = new Block();
	b.name = name;
	b.baseIndent = baseIndent;
	b.parent = parent;
	return b;
}

/** 压入无 key 内容：无 Info 或刚遇键值 → 新 Info 段（编号自增）；否则续压当前段 */
function pushInfo(b: Block, item: string): void {
	if (b.curInfo === -1 || b.lastWasKey) {
		b.infos.push([]);
		b.curInfo = b.infos.length - 1;
		b.lastWasKey = false;
		b.order.push({ kind: "info", index: b.curInfo });
	}
	(b.infos[b.curInfo] as string[]).push(item);
}

/**
 * 按缩进找爸爸：栈中最近一个 baseIndent < indent 的块；
 * 同时把基准 ≥ indent 的块弹出（闭块）。
 * 返回 [爸爸, 新栈长度]
 */
function findParent(stack: Block[], indent: number): [Block, number] {
	let i = stack.length - 1;
	while (i > 0 && (stack[i] as Block).baseIndent >= indent) i--;
	return [stack[i] as Block, i + 1];
}

/**
 * 块栈构建。规则：
 * - 裸键值行：根创建（不找爸爸），隐式回根
 * - 带-键值行：按缩进找爸爸；爸爸是根（顶层）→ 进 Subject；顶层带-缩进 → 语法错误
 * - 内容行（裸/带-）：按缩进找爸爸；爸爸是根 → 进 Subject
 * - `---`：回根，关闭当前 Subject
 */
export function parse(lines: PLine[]): PdDoc {
	const root = newBlock("", NEG_INF, null as unknown as Block);
	const doc: PdDoc = { root, blocks: [root], errors: [] };
	const stack: Block[] = [root];
	let curSubject: Block | null = null;
	let subjectSeq = 0;

	const error = (line: PLine, message: string): void => {
		doc.errors.push({
			lineNo: line.lineNo,
			message,
			raw: line.raw,
		} satisfies PError);
	};

	for (const line of lines) {
		switch (line.kind) {
			case "blank":
			case "section":
				break;

			case "separator":
				stack.length = 1;
				curSubject = null;
				root.lastWasKey = false;
				break;

			case "key": {
				// 裸键值：根创建，独立成父亲
				const b = newBlock(line.key as string, NEG_INF, root);
				if (line.value !== undefined) {
					b.inline = line.value;
					b.infos = [[line.value]];
					b.curInfo = 0;
					b.order.push({ kind: "info", index: 0 });
				}
				root.entries.set(b.name, b);
				root.order.push({ kind: "key", name: b.name });
				root.lastWasKey = true;
				stack.length = 1;
				stack.push(b);
				break;
			}

			case "item-key": {
				let [parent, len] = findParent(stack, line.indent);
				if (parent === root) {
					// 顶层带-缩进 = 语法错误（忽略该行）
					if (line.indent > 0) {
						error(line, "顶层 `-` 不允许缩进");
						break;
					}
					// 找不到爸爸又是顶层 → 自己进 Subject
					if (!curSubject || root.lastWasKey) {
						curSubject = newBlock(`Subject${++subjectSeq}`, NEG_INF, root);
						root.entries.set(curSubject.name, curSubject);
						root.order.push({ kind: "key", name: curSubject.name });
						root.lastWasKey = false;
						stack.length = 1;
						stack.push(curSubject);
					}
					parent = curSubject;
					len = stack.length;
				}
				const b = newBlock(line.key as string, line.indent, parent);
				if (line.value !== undefined) {
					b.inline = line.value;
					b.infos = [[line.value]];
					b.curInfo = 0;
					b.order.push({ kind: "info", index: 0 });
				}
				parent.entries.set(b.name, b);
				parent.order.push({ kind: "key", name: b.name });
				parent.lastWasKey = true;
				stack.length = len;
				stack.push(b);
				break;
			}

			case "item":
			case "text": {
				let [parent, len] = findParent(stack, line.indent);
				if (parent === root) {
					if (line.indent > 0) {
						// 顶层带-缩进错误（仅 item；裸 text 缩进容忍）
						if (line.kind === "item") {
							error(line, "顶层 `-` 不允许缩进");
							break;
						}
						parent = root; // 裸内容行缩进容忍：仍进根
					}
					if (!curSubject || root.lastWasKey) {
						curSubject = newBlock(`Subject${++subjectSeq}`, NEG_INF, root);
						root.entries.set(curSubject.name, curSubject);
						root.order.push({ kind: "key", name: curSubject.name });
						root.lastWasKey = false;
						stack.length = 1;
						stack.push(curSubject);
					}
					parent = curSubject;
					len = stack.length;
				}
				if (line.text !== "") pushInfo(parent, line.text);
				parent.lastWasKey = false;
				stack.length = len;
				break;
			}
		}
	}

	return doc;
}
