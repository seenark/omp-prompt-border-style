import { describe, expect, test, vi } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme } from "@oh-my-pi/pi-tui";
import promptBorderStyle, {
	DEFAULT_PROMPT_BORDER_CONFIG,
	PromptBorderEditor,
	borderStyles,
	buildTimedSpinnerFrames,
	createSpinnerFrameDebugReport,
	ensurePromptBorderConfigFile,
	formatSpinnerFrameDebugReport,
	getPromptBorderArgumentCompletions,
	getPromptLoadingGlyphArgumentCompletions,
	installSpinnerGlyphFrames,
	normalizePromptBorderConfig,
	parseGlyphFrames,
	parsePromptBorderArgs,
	parsePromptLoadingGlyphArgs,
	readPromptBorderConfig,
	renderBottomBorderLine,
	replaceBodyLeftGlyph,
	writePromptBorderConfigSelection,
} from "./main";

const symbols: EditorTheme["symbols"] = {
	cursor: "█",
	inputCursor: "▌",
	boxRound: borderStyles.round,
	boxSharp: {
		topLeft: "┌",
		topRight: "┐",
		bottomLeft: "└",
		bottomRight: "┘",
		horizontal: "─",
		vertical: "│",
		teeDown: "┬",
		teeUp: "┴",
		teeLeft: "┤",
		teeRight: "├",
		cross: "┼",
	},
	table: {
		topLeft: "┌",
		topRight: "┐",
		bottomLeft: "└",
		bottomRight: "┘",
		horizontal: "─",
		vertical: "│",
		teeDown: "┬",
		teeUp: "┴",
		teeLeft: "┤",
		teeRight: "├",
		cross: "┼",
	},
	quoteBorder: "│",
	hrChar: "─",
	spinnerFrames: ["-"],
};

const theme: EditorTheme = {
	borderColor: value => value,
	selectList: {
		selectedPrefix: value => value,
		selectedText: value => value,
		description: value => value,
		scrollInfo: value => value,
		noMatch: value => value,
		symbols,
	},
	symbols,
};

const emptySpinnerGlyphs = () => ({
	status: { frameMs: 80, glyphs: "", frames: [] as string[] },
	activity: { frameMs: 80, glyphs: "", frames: [] as string[] },
});

const slashAutocomplete: AutocompleteProvider = {
	getSuggestions: async () => ({
		prefix: "/",
		items: [{ value: "/prompt-border", label: "/prompt-border", description: "Change prompt border" }],
	}),
	applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
	trySyncSlashCompletion: () => ({
		prefix: "/",
		items: [{ value: "/prompt-border", label: "/prompt-border", description: "Change prompt border" }],
	}),
};

describe("parsePromptBorderArgs", () => {
	test("keeps the current layout when only a style is provided", () => {
		expect(parsePromptBorderArgs("heavy", { style: "double", layout: "sides" })).toEqual({
			kind: "apply",
			state: { style: "heavy", layout: "sides" },
		});
	});

	test("updates style and layout together", () => {
		expect(parsePromptBorderArgs("double bottom", { style: "round", layout: "full" })).toEqual({
			kind: "apply",
			state: { style: "double", layout: "bottom" },
		});
	});

	test("updates only layout with the layout subcommand", () => {
		expect(parsePromptBorderArgs("layout sides", { style: "double", layout: "full" })).toEqual({
			kind: "apply",
			state: { style: "double", layout: "sides" },
		});
	});

	test("accepts the top-bottom and default layouts", () => {
		expect(parsePromptBorderArgs("double top-bottom", { style: "round", layout: "full" })).toEqual({
			kind: "apply",
			state: { style: "double", layout: "top-bottom" },
		});
		expect(parsePromptBorderArgs("layout default", { style: "double", layout: "sides" })).toEqual({
			kind: "apply",
			state: { style: "double", layout: "default" },
		});
	});

	test("rejects unknown tokens", () => {
		expect(parsePromptBorderArgs("double neon", { style: "double", layout: "full" })).toEqual({ kind: "invalid" });
	});
});

test("parses glyph frames from space separated text", () => {
	expect(parseGlyphFrames("AA  BB\nCC")).toEqual(["AA", "BB", "CC"]);
});

test("builds timed spinner frames by repeating slow frames", () => {
	expect(buildTimedSpinnerFrames(["A0", "A1"], 240)).toEqual(["A0", "A0", "A0", "A1", "A1", "A1"]);
});

test("builds timed spinner frames by preserving 80ms frames", () => {
	expect(buildTimedSpinnerFrames(["A0", "A1"], 80)).toEqual(["A0", "A1"]);
});

test("builds timed spinner frames by skipping faster source frames", () => {
	expect(buildTimedSpinnerFrames(["A0", "A1", "A2", "A3"], 40)).toEqual(["A0", "A2"]);
});

describe("parsePromptLoadingGlyphArgs", () => {
	test("accepts debug frames", () => {
		expect(parsePromptLoadingGlyphArgs("debug frames")).toEqual({ kind: "frames" });
	});

	test("accepts debug demo", () => {
		expect(parsePromptLoadingGlyphArgs("debug demo")).toEqual({ kind: "demo" });
	});

	test("accepts debug on and off", () => {
		expect(parsePromptLoadingGlyphArgs("debug on")).toEqual({ kind: "on" });
		expect(parsePromptLoadingGlyphArgs("debug off")).toEqual({ kind: "off" });
	});

	test("rejects unknown loading glyph commands", () => {
		expect(parsePromptLoadingGlyphArgs("debug wobble")).toEqual({ kind: "invalid" });
	});
});

describe("getPromptLoadingGlyphArgumentCompletions", () => {
	test("offers the debug subcommand at the root", () => {
		expect(getPromptLoadingGlyphArgumentCompletions("")).toEqual([{ value: "debug", label: "debug" }]);
	});

	test("offers debug actions after the subcommand", () => {
		expect(getPromptLoadingGlyphArgumentCompletions("debug ")).toEqual([
			{ value: "debug frames", label: "frames" },
			{ value: "debug demo", label: "demo" },
			{ value: "debug on", label: "on" },
			{ value: "debug off", label: "off" },
		]);
	});
});

test("reports skipped frames for a 20ms activity spinner", () => {
	const report = createSpinnerFrameDebugReport("activity", {
		frames: ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
		frameMs: 20,
	});

	expect(report).toEqual({
		type: "activity",
		frameMs: 20,
		sourceFrames: ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
		visibleFrames: ["F0", "F4"],
		mode: "skipped",
	});
});

test("formats a frame debug report with the visible subsequence note", () => {
	const formatted = formatSpinnerFrameDebugReport({
		type: "activity",
		frameMs: 20,
		sourceFrames: ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
		visibleFrames: ["F0", "F4"],
		mode: "skipped",
	});

	expect(formatted).toContain("Prompt loading glyphs: activity");
	expect(formatted).toContain("visible (2): F0 F4");
	expect(formatted).toContain("mode: skips source frames to match 80ms host tick");
	expect(formatted).toContain("visible subsequence");
});

describe("PromptBorderEditor", () => {
	test("renders a separate bottom border in bottom layout", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "bottom" });
		const lines = editor.render(8);
		expect(lines.at(-1)).toBe("╚══════╝");
		expect(renderBottomBorderLine(8, borderStyles.double, value => value)).toBe("╚══════╝");
	});
	test("renders full layout with side-only body row and separate bottom border", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" });
		const lines = editor.render(8);
		expect(lines[0]).toBe("╔══════╗");
		expect(lines[1]).toBe("║  ▌   ║");
		expect(lines.at(-1)).toBe("╚══════╝");
	});

	test("restyles status gap horizontal runs to the selected border glyph", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" });
		editor.setTopBorder({ content: "left ───── right", width: 16 });
		const lines = editor.render(20);
		expect(lines[0]).toBe("╔══left ═════ r…═══╗");
	});

	test("renders only side borders in sides layout", () => {
		const editor = new PromptBorderEditor(theme, { style: "sharp", layout: "sides" });
		const lines = editor.render(8);
		expect(lines.some(line => line.includes("┌") || line.includes("┐") || line.includes("└") || line.includes("┘"))).toBe(false);
		expect(lines.every(line => line.startsWith("│") && line.endsWith("│"))).toBe(true);
	});

	test("keeps status content when bottom layout hides the top border line", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "bottom" });
		editor.setTopBorder({ content: "left ───── right", width: 16 });
		const lines = editor.render(20);
		expect(lines[0]).toBe("               …    ");
		expect(lines[1]).toBe("║  ▌               ║");
		expect(lines.at(-1)).toBe("╚══════════════════╝");
	});

	test("keeps status content when sides layout hides top and bottom border lines", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "sides" });
		editor.setTopBorder({ content: "left ───── right", width: 16 });
		const lines = editor.render(20);
		expect(lines).toEqual(["               …    ", "║  ▌               ║"]);
	});

	test("preserves edge-aligned status glyphs when bottom layout hides top border chrome", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "bottom" });
		editor.setTopBorder({ content: "═ sync jobs ═", width: 12 });
		const lines = editor.render(24);
		expect(lines[0]).toBe("   ═ sync jobs ═         ");
	});

	test("preserves truncated status content when bottom layout hides top border chrome", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "bottom" });
		editor.setTopBorder({ content: "left status really long", width: 23 });
		const lines = editor.render(16);
		expect(lines[0]).toBe("   left sta…    ");
		expect(lines[1]).toBe("║  ▌           ║");
	});

	test("renders top-bottom layout with horizontal borders and an unbordered body row", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "top-bottom" });
		const lines = editor.render(8);
		expect(lines).toEqual(["╔══════╗", "   ▌    ", "╚══════╝"]);
	});

	test("renders default layout using upstream editor body chrome", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "default" });
		const lines = editor.render(8);
		expect(lines).toEqual(["╔══════╗", "╚═ ▌  ═╝"]);
	});

	test("replaces only the body-left glyph", () => {
		expect(replaceBodyLeftGlyph("╚═ ▌  ═╝", borderStyles.double, "AB")).toBe("╚AB▌  ═╝");
		expect(replaceBodyLeftGlyph("╔══════╗", borderStyles.double, "AB")).toBe("╔══════╗");
		expect(replaceBodyLeftGlyph("╚══════╝", borderStyles.double, "AB")).toBe("╚══════╝");
	});

	test("renders configured left glyph frame in default layout", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "default" }, {
			style: "double",
			layout: "default",
			leftGlyph: { frameMs: 70, glyphs: "AB", frames: ["AB"] },
			rightGlyph: { frameMs: 70, glyphs: "", frames: [] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		expect(editor.render(8)).toEqual(["╔══════╗", "╚AB▌  ═╝"]);
	});

	test("renders configured left glyph frame in full layout body row with input spacing", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "AB", frames: ["AB"] },
			rightGlyph: { frameMs: 70, glyphs: "", frames: [] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		expect(editor.render(8)).toEqual(["╔══════╗", "║AB ▌  ║", "╚══════╝"]);
	});

	test("renders configured right glyph frame in full layout body row", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "", frames: [] },
			rightGlyph: { frameMs: 70, glyphs: "CD", frames: ["CD"] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		const lines = editor.render(8);
		expect(lines.filter(line => line.includes("CD"))).toHaveLength(1);
		expect(lines.find(line => line.includes("CD"))).toContain("▌");
		expect(lines[0]?.includes("CD")).toBe(false);
		expect(lines.at(-1)?.includes("CD")).toBe(false);
	});

	test("renders left and right glyphs only on cursor row in multiline full layout", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "AA", frames: ["AA"] },
			rightGlyph: { frameMs: 70, glyphs: "ZZ", frames: ["ZZ"] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		editor.setText("one\ntwo");
		const lines = editor.render(12);
		expect(lines.filter(line => line.includes("AA"))).toHaveLength(1);
		expect(lines.filter(line => line.includes("ZZ"))).toHaveLength(1);
		expect(lines.find(line => line.includes("AA"))).toBe(lines.find(line => line.includes("ZZ")));
		expect(lines.find(line => line.includes("AA"))).toContain("▌");
	});

	test("renders left and right glyphs only on cursor row in default layout", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "default" }, {
			style: "double",
			layout: "default",
			leftGlyph: { frameMs: 70, glyphs: "AA", frames: ["AA"] },
			rightGlyph: { frameMs: 70, glyphs: "ZZ", frames: ["ZZ"] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		editor.setText("one\ntwo");
		const lines = editor.render(12);
		const glyphRows = lines.slice(1).filter(line => line.includes("AA") || line.includes("ZZ"));
		expect(glyphRows).toHaveLength(1);
		expect(glyphRows[0]).toContain("▌");
	});

	test("ignores literal cursor glyphs in user text when locating the active row", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "AA", frames: ["AA"] },
			rightGlyph: { frameMs: 70, glyphs: "ZZ", frames: ["ZZ"] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		editor.setText("one▌\ntwo");
		const lines = editor.render(14);
		expect(lines.find(line => line.includes("AA"))).toContain("two▌");
		expect(lines.find(line => line.includes("AA"))?.includes("one▌")).toBe(false);
	});

	test("keeps default-layout glyph fallback out of autocomplete rows", async () => {
		const mutableTheme: EditorTheme = {
			...theme,
			symbols: {
				...theme.symbols,
			},
			selectList: {
				...theme.selectList,
				symbols: {
					...theme.selectList.symbols,
				},
			},
		};
		const editor = new PromptBorderEditor(mutableTheme, { style: "double", layout: "default" }, {
			style: "double",
			layout: "default",
			leftGlyph: { frameMs: 70, glyphs: "AA", frames: ["AA"] },
			rightGlyph: { frameMs: 70, glyphs: "", frames: [] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		editor.setAutocompleteProvider({
			getSuggestions: async () => ({
				prefix: "/",
				items: [{ value: "/other-command", label: "/other-command", description: "Other command" }],
			}),
			applyCompletion: (lines, cursorLine, cursorCol) => ({ lines, cursorLine, cursorCol }),
			trySyncSlashCompletion: () => ({
				prefix: "/",
				items: [{ value: "/other-command", label: "/other-command", description: "Other command" }],
			}),
		});
		editor.handleInput("/");
		await Promise.resolve();
		mutableTheme.symbols.inputCursor = "?";
		mutableTheme.symbols.cursor = "!";
		const lines = editor.render(20);
		const suggestionRow = lines.find(line => line.includes("/other-command"));
		const glyphRow = lines.find(line => line.includes("AA"));
		expect(suggestionRow?.includes("AA")).toBe(false);
		expect(glyphRow).toContain("▌");
	});

	test("advances the left glyph frame and requests repaint", () => {
		vi.useFakeTimers();
		try {
			const repaints: number[] = [];
			const editor = new PromptBorderEditor(theme, { style: "double", layout: "default" }, {
				style: "double",
				layout: "default",
				leftGlyph: { frameMs: 1, glyphs: "AB CD", frames: ["AB", "CD"] },
				rightGlyph: { frameMs: 70, glyphs: "", frames: [] },
				spinnerGlyphs: emptySpinnerGlyphs(),
			});
			editor.setShimmerRepaintHandler(() => repaints.push(1));
			expect(editor.render(8)[1]).toBe("╚AB▌  ═╝");
			vi.advanceTimersByTime(5);
			expect(repaints.length).toBeGreaterThan(0);
			expect(editor.render(8)[1]).toBe("╚CD▌  ═╝");
		} finally {
			vi.useRealTimers();
		}
	});

	test("advances the right glyph frame and requests repaint", () => {
		vi.useFakeTimers();
		try {
			const repaints: number[] = [];
			const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
				style: "double",
				layout: "full",
				leftGlyph: { frameMs: 70, glyphs: "", frames: [] },
				rightGlyph: { frameMs: 1, glyphs: "RR SS", frames: ["RR", "SS"] },
				spinnerGlyphs: emptySpinnerGlyphs(),
			});
			editor.setShimmerRepaintHandler(() => repaints.push(1));
			expect(editor.render(8).find(line => line.includes("RR"))).toContain("▌");
			vi.advanceTimersByTime(5);
			expect(repaints.length).toBeGreaterThan(0);
			expect(editor.render(8).find(line => line.includes("SS"))).toContain("▌");
		} finally {
			vi.useRealTimers();
		}
	});

	test("keeps the bottom border above autocomplete rows", async () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "bottom" });
		editor.setAutocompleteProvider(slashAutocomplete);
		editor.handleInput("/");
		await Promise.resolve();
		const lines = editor.render(20);
		const borderIndex = lines.findIndex(line => line === "╚══════════════════╝");
		const autocompleteIndex = lines.findIndex(line => line.includes("/prompt-border"));
		expect(editor.isShowingAutocomplete()).toBe(true);
		expect(borderIndex).toBeGreaterThanOrEqual(0);
		expect(autocompleteIndex).toBeGreaterThan(borderIndex);
	});
});

describe("prompt border config", () => {
	test("normalizes prompt border config defaults without showing custom glyphs", () => {
		expect(normalizePromptBorderConfig({})).toEqual(DEFAULT_PROMPT_BORDER_CONFIG);
		expect(normalizePromptBorderConfig({ promptBorder: { leftGlyph: { frameMs: 10, glyphs: "" } } })).toEqual({
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "", frames: [] },
			rightGlyph: { frameMs: 70, glyphs: "", frames: [] },
			spinnerGlyphs: emptySpinnerGlyphs(),
		});
		expect(
			normalizePromptBorderConfig({
				promptBorder: {
					style: "round",
					layout: "default",
					leftGlyph: { frameMs: 80, glyphs: "AA  BB" },
					rightGlyph: { frameMs: 90, glyphs: "RR  SS" },
					spinnerGlyphs: {
						status: { frameMs: 120, glyphs: "LL  MM" },
						activity: { frameMs: 140, glyphs: "QQ  WW" },
					},
				},
			}),
		).toEqual({
			style: "round",
			layout: "default",
			leftGlyph: { frameMs: 80, glyphs: "AA  BB", frames: ["AA", "BB"] },
			rightGlyph: { frameMs: 90, glyphs: "RR  SS", frames: ["RR", "SS"] },
			spinnerGlyphs: {
				status: { frameMs: 120, glyphs: "LL  MM", frames: ["LL", "MM"] },
				activity: { frameMs: 140, glyphs: "QQ  WW", frames: ["QQ", "WW"] },
			},
		});
	});

	test("creates prompt border config json example when missing", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		const leftGlyphPath = path.join(dir, "prompt-border-left-glyphs.txt");
		const rightGlyphPath = path.join(dir, "prompt-border-right-glyphs.txt");
		const statusSpinnerGlyphPath = path.join(dir, "prompt-border-status-spinner-glyphs.txt");
		const activitySpinnerGlyphPath = path.join(dir, "prompt-border-activity-spinner-glyphs.txt");
		const config = await ensurePromptBorderConfigFile(configPath);
		expect(config.leftGlyph.frames.length).toBe(73);
		expect(config.rightGlyph.frames).toEqual([]);
		expect(config.spinnerGlyphs.status.frames).toEqual([]);
		expect(config.spinnerGlyphs.activity.frames).toEqual([]);
		const saved = JSON.parse(await Bun.file(configPath).text());
		expect(saved.promptBorder.style).toBe("double");
		expect(saved.promptBorder.layout).toBe("full");
		expect(saved.promptBorder.leftGlyph).toEqual({ frameMs: 70 });
		expect(saved.promptBorder.rightGlyph).toEqual({ frameMs: 70 });
		expect(saved.promptBorder.spinnerGlyphs).toEqual({
			status: { frameMs: 80 },
			activity: { frameMs: 80 },
		});
		expect(saved.promptBorder.leftGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.rightGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.status.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.activity.glyphs).toBeUndefined();
		expect(saved.promptBorder.leftGlyph.frames).toBeUndefined();
		expect(saved.promptBorder.rightGlyph.frames).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.status.frames).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.activity.frames).toBeUndefined();
		expect((await Bun.file(leftGlyphPath).text()).trim()).toMatch(/^􁦘􁦙[\s\S]*􁨨􁨩$/u);
		expect(await Bun.file(rightGlyphPath).text()).toBe("");
		expect(await Bun.file(statusSpinnerGlyphPath).text()).toBe("");
		expect(await Bun.file(activitySpinnerGlyphPath).text()).toBe("");
	});

	test("reads cursor and spinner glyph frames from sibling text files", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		await Bun.write(
			configPath,
			JSON.stringify({
				promptBorder: {
					leftGlyph: { frameMs: 80 },
					rightGlyph: { frameMs: 90 },
					spinnerGlyphs: {
						status: { frameMs: 85 },
						activity: { frameMs: 95 },
					},
				},
			}, null, 2),
		);
		await Bun.write(path.join(dir, "prompt-border-left-glyphs.txt"), "AA  BB");
		await Bun.write(path.join(dir, "prompt-border-right-glyphs.txt"), "RR  SS");
		await Bun.write(path.join(dir, "prompt-border-status-spinner-glyphs.txt"), "S0  S1");
		await Bun.write(path.join(dir, "prompt-border-activity-spinner-glyphs.txt"), "A0  A1");
		await expect(readPromptBorderConfig(configPath)).resolves.toEqual({
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 80, glyphs: "AA  BB", frames: ["AA", "BB"] },
			rightGlyph: { frameMs: 90, glyphs: "RR  SS", frames: ["RR", "SS"] },
			spinnerGlyphs: {
				status: { frameMs: 85, glyphs: "S0  S1", frames: ["S0", "S1"] },
				activity: { frameMs: 95, glyphs: "A0  A1", frames: ["A0", "A1"] },
			},
		});
	});

	test("migrates legacy inline glyphs to local text files", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		const leftGlyphPath = path.join(dir, "prompt-border-left-glyphs.txt");
		const rightGlyphPath = path.join(dir, "prompt-border-right-glyphs.txt");
		const statusSpinnerGlyphPath = path.join(dir, "prompt-border-status-spinner-glyphs.txt");
		const activitySpinnerGlyphPath = path.join(dir, "prompt-border-activity-spinner-glyphs.txt");
		await Bun.write(
			configPath,
			JSON.stringify({
				promptBorder: {
					leftGlyph: { frameMs: 80, glyphs: "AA  BB" },
					rightGlyph: { frameMs: 90, glyphs: "RR  SS" },
					spinnerGlyphs: {
						status: { frameMs: 85, glyphs: "S0  S1" },
						activity: { frameMs: 95, glyphs: "A0  A1" },
					},
				},
			}, null, 2),
		);
		const config = await ensurePromptBorderConfigFile(configPath);
		expect(config.leftGlyph).toEqual({ frameMs: 80, glyphs: "AA  BB", frames: ["AA", "BB"] });
		expect(config.rightGlyph).toEqual({ frameMs: 90, glyphs: "RR  SS", frames: ["RR", "SS"] });
		expect(config.spinnerGlyphs.status).toEqual({ frameMs: 85, glyphs: "S0  S1", frames: ["S0", "S1"] });
		expect(config.spinnerGlyphs.activity).toEqual({ frameMs: 95, glyphs: "A0  A1", frames: ["A0", "A1"] });
		expect(await Bun.file(leftGlyphPath).text()).toContain("AA  BB");
		expect(await Bun.file(rightGlyphPath).text()).toContain("RR  SS");
		expect(await Bun.file(statusSpinnerGlyphPath).text()).toContain("S0  S1");
		expect(await Bun.file(activitySpinnerGlyphPath).text()).toContain("A0  A1");
		const saved = JSON.parse(await Bun.file(configPath).text());
		expect(saved.promptBorder.leftGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.rightGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.status.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.activity.glyphs).toBeUndefined();
	});

	test("removes obsolete inline loading glyph config without migrating it", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		const activitySpinnerGlyphPath = path.join(dir, "prompt-border-activity-spinner-glyphs.txt");
		await Bun.write(
			configPath,
			JSON.stringify({
				promptBorder: {
					loadingGlyph: { frameMs: 90, glyphs: "LL  MM" },
				},
			}, null, 2),
		);
		const config = await ensurePromptBorderConfigFile(configPath);
		const saved = JSON.parse(await Bun.file(configPath).text());
		expect(saved.promptBorder.loadingGlyph).toBeUndefined();
		expect(config.spinnerGlyphs.activity).toEqual({ frameMs: 80, glyphs: "", frames: [] });
		expect(await Bun.file(activitySpinnerGlyphPath).text()).toBe("");
	});

	test("writes prompt border style and layout while preserving glyph config", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		const leftGlyphPath = path.join(dir, "prompt-border-left-glyphs.txt");
		const rightGlyphPath = path.join(dir, "prompt-border-right-glyphs.txt");
		const statusSpinnerGlyphPath = path.join(dir, "prompt-border-status-spinner-glyphs.txt");
		const activitySpinnerGlyphPath = path.join(dir, "prompt-border-activity-spinner-glyphs.txt");
		await Bun.write(
			configPath,
			JSON.stringify({
				theme: "keep-me",
				promptBorder: {
					style: "double",
					layout: "full",
					custom: "preserved",
					leftGlyph: { frameMs: 80, glyphs: "" },
					rightGlyph: { frameMs: 90, glyphs: "" },
					spinnerGlyphs: {
						status: { frameMs: 85, glyphs: "" },
						activity: { frameMs: 95, glyphs: "" },
					},
				},
			}, null, 2),
		);
		await Bun.write(leftGlyphPath, "AA  BB");
		await Bun.write(rightGlyphPath, "RR  SS");
		await Bun.write(statusSpinnerGlyphPath, "S0  S1");
		await Bun.write(activitySpinnerGlyphPath, "A0  A1");

		const config = await writePromptBorderConfigSelection({ style: "round", layout: "sides" }, configPath);
		const saved = JSON.parse(await Bun.file(configPath).text());

		expect(config).toEqual({
			style: "round",
			layout: "sides",
			leftGlyph: { frameMs: 80, glyphs: "AA  BB", frames: ["AA", "BB"] },
			rightGlyph: { frameMs: 90, glyphs: "RR  SS", frames: ["RR", "SS"] },
			spinnerGlyphs: {
				status: { frameMs: 85, glyphs: "S0  S1", frames: ["S0", "S1"] },
				activity: { frameMs: 95, glyphs: "A0  A1", frames: ["A0", "A1"] },
			},
		});
		expect(saved.theme).toBe("keep-me");
		expect(saved.promptBorder.style).toBe("round");
		expect(saved.promptBorder.layout).toBe("sides");
		expect(saved.promptBorder.custom).toBe("preserved");
		expect(saved.promptBorder.leftGlyph.frameMs).toBe(80);
		expect(saved.promptBorder.rightGlyph.frameMs).toBe(90);
		expect(saved.promptBorder.spinnerGlyphs.status.frameMs).toBe(85);
		expect(saved.promptBorder.spinnerGlyphs.activity.frameMs).toBe(95);
		expect(saved.promptBorder.leftGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.rightGlyph.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.status.glyphs).toBeUndefined();
		expect(saved.promptBorder.spinnerGlyphs.activity.glyphs).toBeUndefined();
		expect(await Bun.file(leftGlyphPath).text()).toBe("AA  BB");
		expect(await Bun.file(rightGlyphPath).text()).toBe("RR  SS");
		expect(await Bun.file(statusSpinnerGlyphPath).text()).toBe("S0  S1");
		expect(await Bun.file(activitySpinnerGlyphPath).text()).toBe("A0  A1");
	});

	test("preserves welcome screen config when writing prompt border selection", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		await Bun.write(configPath, JSON.stringify({
			welcomeScreen: { mainText: "Keep Me" },
			promptBorder: {
				style: "double",
				layout: "full",
				leftGlyph: { frameMs: 80, glyphs: "" },
			},
		}, null, 2));

		await writePromptBorderConfigSelection({ style: "round", layout: "sides" }, configPath);
		const saved = JSON.parse(await Bun.file(configPath).text());

		expect(saved.welcomeScreen.mainText).toBe("Keep Me");
		expect(saved.promptBorder.style).toBe("round");
		expect(saved.promptBorder.layout).toBe("sides");
	});
});

test("spinner frame override preserves unconfigured groups and restores defaults", () => {
	const fakeTheme = {
		getSpinnerFrames(type = "status") {
			return type === "activity" ? ["a0", "a1"] : ["s0", "s1"];
		},
	};

	const restore = installSpinnerGlyphFrames(fakeTheme, { activity: { frames: ["x0", "x1"], frameMs: 80 } });

	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["x0", "x1"]);
	expect(fakeTheme.getSpinnerFrames("status")).toEqual(["s0", "s1"]);
	const leaked = fakeTheme.getSpinnerFrames("activity");
	leaked.push("leak");
	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["x0", "x1"]);
	restore?.();
	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["a0", "a1"]);
});

test("spinner frame override can replace both status and activity groups", () => {
	const fakeTheme = {
		getSpinnerFrames(type = "status") {
			return type === "activity" ? ["a0", "a1"] : ["s0", "s1"];
		},
	};

	const restore = installSpinnerGlyphFrames(fakeTheme, {
		status: { frames: ["S0", "S1"], frameMs: 80 },
		activity: { frames: ["A0", "A1"], frameMs: 80 },
	});

	expect(fakeTheme.getSpinnerFrames()).toEqual(["S0", "S1"]);
	expect(fakeTheme.getSpinnerFrames("status")).toEqual(["S0", "S1"]);
	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["A0", "A1"]);
	restore?.();
	expect(fakeTheme.getSpinnerFrames("status")).toEqual(["s0", "s1"]);
	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["a0", "a1"]);
});

test("empty spinner glyph frames leave theme untouched", () => {
	const fakeTheme = {
		getSpinnerFrames(type = "status") {
			return type === "activity" ? ["a0", "a1"] : ["s0", "s1"];
		},
	};

	const original = fakeTheme.getSpinnerFrames;
	expect(installSpinnerGlyphFrames(fakeTheme, { status: { frames: [], frameMs: 240 }, activity: { frames: [], frameMs: 240 } })).toBeUndefined();
	expect(fakeTheme.getSpinnerFrames).toBe(original);
});

test("spinner frame override expands slow activity frames", () => {
	const fakeTheme = {
		getSpinnerFrames(type = "status") {
			return type === "activity" ? ["a0", "a1"] : ["s0", "s1"];
		},
	};

	const restore = installSpinnerGlyphFrames(fakeTheme, {
		activity: { frames: ["A0", "A1"], frameMs: 240 },
	});

	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["A0", "A0", "A0", "A1", "A1", "A1"]);
	expect(fakeTheme.getSpinnerFrames("status")).toEqual(["s0", "s1"]);
	restore?.();
});

test("session start applies status and activity spinner frames to the UI theme", async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
	const configPath = path.join(dir, "config.json");
	await Bun.write(configPath, JSON.stringify({
		promptBorder: {
			style: "double",
			layout: "full",
			spinnerGlyphs: {
				status: { frameMs: 80 },
				activity: { frameMs: 80 },
			},
		},
	}, null, 2));
	await Bun.write(path.join(dir, "prompt-border-left-glyphs.txt"), "");
	await Bun.write(path.join(dir, "prompt-border-right-glyphs.txt"), "");
	await Bun.write(path.join(dir, "prompt-border-status-spinner-glyphs.txt"), "S0  S1");
	await Bun.write(path.join(dir, "prompt-border-activity-spinner-glyphs.txt"), "A0  A1");

	let sessionStart:
		| ((event: unknown, ctx: {
			hasUI: true;
			ui: {
				theme: { getSpinnerFrames: (type?: string) => string[] };
				setEditorComponent: (value: unknown) => void;
				notify: (message: string, level?: string) => void;
			};
		}) => Promise<void>)
		| undefined;
	const pi = {
		setLabel: () => {},
		on: (event: string, handler: typeof sessionStart) => {
			if (event === "session_start") sessionStart = handler;
		},
		registerCommand: () => {},
	} as unknown as ExtensionAPI;
	const fakeTheme = {
		getSpinnerFrames(type = "status") {
			return type === "activity" ? ["a0", "a1"] : ["s0", "s1"];
		},
	};
	const ctx = {
		hasUI: true as const,
		ui: {
			theme: fakeTheme,
			setEditorComponent: () => {},
			notify: () => {},
		},
	};

	promptBorderStyle(pi, configPath);
	await sessionStart?.({}, ctx);
	expect(fakeTheme.getSpinnerFrames()).toEqual(["S0", "S1"]);
	expect(fakeTheme.getSpinnerFrames("status")).toEqual(["S0", "S1"]);
	expect(fakeTheme.getSpinnerFrames("activity")).toEqual(["A0", "A1"]);
});

describe("promptBorderStyle", () => {
	test("reset restores the default full layout for later style-only commands", async () => {
		let handler: ((args: string, ctx: { hasUI: true; ui: { setEditorComponent: (value: unknown) => void; notify: (message: string) => void } }) => Promise<void>) | undefined;
		const notifications: string[] = [];
		const pi = {
			setLabel: () => {},
			on: () => {},
			registerCommand: (_name: string, command: { handler: typeof handler }) => {
				handler = command.handler;
			},
		} as unknown as ExtensionAPI;
		const ctx = {
			hasUI: true as const,
			ui: {
				setEditorComponent: () => {},
				notify: (message: string) => {
					notifications.push(message);
				},
			},
		};

		promptBorderStyle(pi);
		expect(handler).toBeDefined();
		await handler?.("double sides", ctx);
		await handler?.("reset", ctx);
		await handler?.("round", ctx);

		expect(notifications.at(-1)).toBe("Prompt border: round full");
	});

	test("command persists applied style and layout to the config file", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-border-"));
		const configPath = path.join(dir, "config.json");
		const leftGlyphPath = path.join(dir, "prompt-border-left-glyphs.txt");
		const rightGlyphPath = path.join(dir, "prompt-border-right-glyphs.txt");
		const statusSpinnerGlyphPath = path.join(dir, "prompt-border-status-spinner-glyphs.txt");
		const activitySpinnerGlyphPath = path.join(dir, "prompt-border-activity-spinner-glyphs.txt");
		await Bun.write(configPath, JSON.stringify({
			promptBorder: {
				style: "double",
				layout: "full",
				leftGlyph: { frameMs: 80, glyphs: "AA  BB" },
				rightGlyph: { frameMs: 90, glyphs: "RR  SS" },
				spinnerGlyphs: {
					status: { frameMs: 85, glyphs: "S0  S1" },
					activity: { frameMs: 95, glyphs: "A0  A1" },
				},
			},
		}, null, 2));
		await Bun.write(leftGlyphPath, "AA  BB");
		await Bun.write(rightGlyphPath, "RR  SS");
		await Bun.write(statusSpinnerGlyphPath, "S0  S1");
		await Bun.write(activitySpinnerGlyphPath, "A0  A1");
		let handler: ((args: string, ctx: { hasUI: true; ui: { setEditorComponent: (value: unknown) => void; notify: (message: string, level?: string) => void } }) => Promise<void>) | undefined;
		const notifications: string[] = [];
		const pi = {
			setLabel: () => {},
			on: () => {},
			registerCommand: (_name: string, command: { handler: typeof handler }) => {
				handler = command.handler;
			},
		} as unknown as ExtensionAPI;
		const ctx = {
			hasUI: true as const,
			ui: {
				setEditorComponent: () => {},
				notify: (message: string) => {
					notifications.push(message);
				},
			},
		};

		promptBorderStyle(pi, configPath);
		await handler?.("round sides", ctx);
		const saved = JSON.parse(await Bun.file(configPath).text());

		expect(saved.promptBorder.style).toBe("round");
		expect(saved.promptBorder.layout).toBe("sides");
		expect(saved.promptBorder.leftGlyph).toEqual({ frameMs: 80 });
		expect(saved.promptBorder.rightGlyph).toEqual({ frameMs: 90 });
		expect(saved.promptBorder.spinnerGlyphs).toEqual({
			status: { frameMs: 85 },
			activity: { frameMs: 95 },
		});
		expect(await Bun.file(leftGlyphPath).text()).toBe("AA  BB");
		expect(await Bun.file(rightGlyphPath).text()).toBe("RR  SS");
		expect(await Bun.file(statusSpinnerGlyphPath).text()).toBe("S0  S1");
		expect(await Bun.file(activitySpinnerGlyphPath).text()).toBe("A0  A1");
		expect(notifications.at(-1)).toBe("Prompt border: round sides");
	});
});

describe("getPromptBorderArgumentCompletions", () => {
	test("shows primary options after an empty argument prefix", () => {
		expect(getPromptBorderArgumentCompletions("")?.map(item => item.value)).toEqual(
			expect.arrayContaining(["round", "double", "heavy", "layout", "reset"]),
		);
	});

	test("filters primary options by the current token", () => {
		expect(getPromptBorderArgumentCompletions("do")?.map(item => item.value)).toEqual([
			"double",
			"double-top",
			"double-side",
			"double-vertical",
			"double-horizontal",
		]);
	});

	test("shows layouts after a completed style token", () => {
		expect(getPromptBorderArgumentCompletions("double ")?.map(item => item.value)).toEqual([
			"full",
			"bottom",
			"sides",
			"top-bottom",
			"default",
		]);
	});

	test("shows layouts after the layout subcommand", () => {
		expect(getPromptBorderArgumentCompletions("layout ")?.map(item => item.label)).toEqual([
			"full",
			"bottom",
			"sides",
			"top-bottom",
			"default",
		]);
	});
	
	test("inserts layout subcommand values without dropping the layout token", () => {
		expect(getPromptBorderArgumentCompletions("layout")?.find(item => item.label === "full")).toEqual({
			value: "layout full",
			label: "full",
		});
		expect(getPromptBorderArgumentCompletions("layout ")?.map(item => item.value)).toEqual([
			"layout full",
			"layout bottom",
			"layout sides",
			"layout top-bottom",
			"layout default",
		]);
		expect(getPromptBorderArgumentCompletions("layout f")?.map(item => item.value)).toEqual(["layout full"]);
	});

	test("returns no options after a complete two-token command", () => {
		expect(getPromptBorderArgumentCompletions("double bottom ")).toBeNull();
	});
});
