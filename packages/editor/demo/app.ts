import { format, jsonToPdText, pdToJsonText } from "@andares/pdfoundation";
import { definePdEditor, type PdEditorElement } from "../src/element";
import { highlightPd, prismHighlighter } from "../src/index";

const SAMPLE = `//!pd 任务
角色: 资深视觉特效导演
语气: 克制、具体
任务: 把下面的镜头描述改写成可执行的拍摄清单
- 约束:
  - 只输出清单
  - 不编造事实
说明: 用 \`a: b\` 表示键值对
时间戳: clock:- 12:30 表示时间

\`\`\`json
{"镜头": {"运镜": "50mm", "光线": "雨夜霓虹"}}
\`\`\`
`;

const SAMPLE_LINES = Array.from(
	{ length: 40 },
	(_, i) => `镜头${i + 1}: 低角度跟拍，雨夜霓虹，${i % 3 === 0 ? "长焦压缩" : "手持轻微晃动"}`,
).join("\n");

type Q = <T extends Element>(sel: string) => T | null;

function makeQ(root: ParentNode): Q {
	return <T extends Element>(sel: string) => root.querySelector<T>(sel);
}

function frame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

/**
 * 装配 demo。root 默认为 document；测试可传入一个已填充 DOM 的容器。
 * 缺少可选 DOM 时静默跳过，便于 demo 冒烟测试只搭最小结构。
 */
export function mountDemo(root: ParentNode = document): void {
	definePdEditor();
	const q = makeQ(root);

	const main = q<PdEditorElement>("#main-editor");
	if (!main) return;

	// 元素默认只带 pd tokenizer；这里演示注入 Prism（主入口导出，宿主按需付费）
	main.highlight = (source, lang) =>
		lang === "pd" ? highlightPd(source) : prismHighlighter(source, lang);
	if (!main.value) main.value = SAMPLE.trimEnd();

	const lang = q<HTMLSelectElement>("#lang");
	const statusEl = q<HTMLElement>("#status");
	const countEl = q<HTMLElement>("#count");
	const setStatus = (text: string) => {
		if (statusEl) statusEl.textContent = text;
	};
	const updateCount = () => {
		if (!countEl) return;
		const value = main.value;
		const lines = value === "" ? 0 : value.split("\n").length;
		countEl.textContent = `${lines} 行 · ${value.length} 字符`;
	};
	const syncLang = (value: string) => {
		if (lang) lang.value = value;
	};
	updateCount();
	main.addEventListener("pd-input", updateCount);

	lang?.addEventListener("change", () => {
		main.language = lang.value;
		setStatus(`语言：${lang.value}`);
	});

	q<HTMLButtonElement>("#format")?.addEventListener("click", () => {
		if (main.language !== "pd") {
			setStatus("格式化只支持 pd 语法");
			return;
		}
		const before = main.value;
		const after = format(before);
		main.value = after;
		updateCount();
		setStatus(after === before ? "已是最佳格式" : "已格式化");
	});

	q<HTMLButtonElement>("#transform")?.addEventListener("click", () => {
		try {
			if (main.language === "pd") {
				const json = pdToJsonText(main.value);
				main.value = json;
				main.language = "json";
				syncLang("json");
				updateCount();
				setStatus("已转换 JSON");
			} else if (main.language === "json") {
				const result = jsonToPdText(main.value);
				main.value = result.pd;
				main.language = "pd";
				syncLang("pd");
				updateCount();
				setStatus(
					result.warnings.length > 0
						? `已转换 PD（${result.warnings.length} 条警告）`
						: "已转换 PD",
				);
			} else {
				setStatus("仅 pd / json 支持相互转换");
			}
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error));
		}
	});

	q<HTMLButtonElement>("#copy")?.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(main.value);
			setStatus("已复制");
		} catch {
			// file:// 或权限受限：选中文本让用户手动复制
			main.textarea?.select();
			setStatus("剪贴板不可用，已全选文本");
		}
	});

	q<HTMLButtonElement>("#clear")?.addEventListener("click", () => {
		main.value = "";
		updateCount();
		setStatus("已清空");
	});
	q<HTMLButtonElement>("#undo")?.addEventListener("click", () => main.undo());
	q<HTMLButtonElement>("#redo")?.addEventListener("click", () => main.redo());

	// ---- 低 UI 示例：聊天输入 ----
	const chat = q<PdEditorElement>("#chat");
	const mirror = q<HTMLElement>("#chat-mirror");
	const send = q<HTMLButtonElement>("#chat-send");
	if (chat && mirror && send) {
		chat.addEventListener("pd-input", (event) => {
			const value = (event as CustomEvent<{ value: string }>).detail.value;
			mirror.textContent = value || "（这里镜像当前值）";
			send.disabled = value.trim() === "";
		});
		send.addEventListener("click", () => {
			chat.value = "";
			send.disabled = true;
			mirror.textContent = "（这里镜像当前值）";
			setStatus("已发送（demo 不真的发送）");
		});
	}

	// ---- 主题切换 ----
	const themeButton = q<HTMLButtonElement>("#theme-toggle");
	themeButton?.addEventListener("click", () => {
		const dark = document.documentElement.dataset.theme !== "dark";
		document.documentElement.dataset.theme = dark ? "dark" : "light";
		themeButton.textContent = dark ? "切换浅色" : "切换深色";
	});

	// ---- 浏览器几何自检 ----
	const selftestButton = q<HTMLButtonElement>("#selftest");
	const selftestOut = q<HTMLElement>("#selftest-out");
	selftestButton?.addEventListener("click", async () => {
		if (selftestOut) selftestOut.textContent = "运行中…";
		const report = await runSelfTest();
		if (selftestOut) selftestOut.textContent = report;
	});
}

/** 真实浏览器里的几何/行为自检（不依赖测试框架；file:// 下也可运行） */
async function runSelfTest(): Promise<string> {
	const results: string[] = [];
	const check = (label: string, ok: boolean, detail = "") => {
		results.push(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
	};
	const hosts: HTMLElement[] = [];
	const makeHost = (css: string) => {
		const host = document.createElement("div");
		host.style.cssText = `position:absolute;left:-10000px;top:0;width:420px;${css}`;
		document.body.appendChild(host);
		hosts.push(host);
		return host;
	};
	const makeEditor = (host: HTMLElement, value: string, attrs: Record<string, string> = {}) => {
		const el = document.createElement("pd-editor") as PdEditorElement;
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		el.style.cssText = "--pd-font-size:14px;--pd-line-height:1.5";
		host.appendChild(el);
		el.value = value;
		return el;
	};

	try {
		const fixedHost = makeHost("height:120px;overflow:hidden");
		const fixed = makeEditor(fixedHost, SAMPLE_LINES);
		// 固定高度模式：元素宿主需要一个明确高度（height:100% 填满 120px 容器）
		fixed.style.height = "100%";
		await frame();
		const ta = fixed.textarea;
		const root = fixed.editor?.root;
		const pre = fixed.shadowRoot?.querySelector("pre.pd-highlight");
		if (!ta || !root || !pre) return "✗ 元素未挂载（shadow root / textarea 缺失）";
		check("固定高度：textarea 内部可滚动", ta.scrollHeight > ta.clientHeight + 1);
		check(
			"固定高度：root 占满宿主",
			Math.abs(fixedHost.clientHeight - root.clientHeight) <= 1,
			`${root.clientHeight}px`,
		);
		check("两层内容宽度一致", ta.clientWidth === pre.clientWidth, `${ta.clientWidth}px`);
		check("覆盖层 aria-hidden", pre.getAttribute("aria-hidden") === "true");
		ta.scrollTop = 120;
		await frame();
		check("滚动同步", Math.abs(pre.scrollTop - ta.scrollTop) <= 1, `${pre.scrollTop}px`);

		const autoHost = makeHost("height:auto");
		const auto = makeEditor(autoHost, "a: 1\nb: 2\nc: 3");
		await frame();
		const autoRoot = auto.editor?.root;
		const autoPre = auto.shadowRoot?.querySelector("pre.pd-highlight");
		check(
			"auto-grow：root 高度跟随内容",
			!!autoRoot && !!autoPre && Math.abs(autoRoot.clientHeight - autoPre.clientHeight) <= 1,
			autoRoot ? `${autoRoot.clientHeight}px` : "",
		);

		const phHost = makeHost("height:auto");
		const ph = makeEditor(phHost, "", { placeholder: "请输入提示词…" });
		await frame();
		const phEl = ph.shadowRoot?.querySelector(".pd-placeholder");
		check(
			"placeholder 覆盖层可见",
			!!phEl && getComputedStyle(phEl).display !== "none" && phEl.textContent === "请输入提示词…",
		);
		ph.value = "x";
		await frame();
		check(
			"有值时 placeholder 隐藏",
			!!phEl && getComputedStyle(phEl).display === "none",
		);

		const lnHost = makeHost("height:auto");
		const ln = makeEditor(lnHost, SAMPLE_LINES, { "line-numbers": "" });
		await frame();
		const numbers = ln.shadowRoot?.querySelectorAll(".pd-lines .pd-ln").length ?? 0;
		check("行号数量与逻辑行一致", numbers === 40, `${numbers} 个`);
		check("普通输入框无原生 placeholder 依赖", !ln.textarea?.getAttribute("placeholder"));
	} finally {
		for (const host of hosts) host.remove();
	}
	return results.join("\n");
}
