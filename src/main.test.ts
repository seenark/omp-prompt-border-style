import { describe, expect, test } from "bun:test";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme } from "@oh-my-pi/pi-tui";
import promptBorderStyle, {
	DEFAULT_PROMPT_BORDER_CONFIG,
	EXAMPLE_PROMPT_BORDER_CONFIG,
	PromptBorderEditor,
	borderStyles,
	ensurePromptBorderConfigFile,
	getPromptBorderArgumentCompletions,
	normalizePromptBorderConfig,
	parseLeftGlyphFrames,
	parsePromptBorderArgs,
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

test("parses left glyph frames from space separated text", () => {
	expect(parseLeftGlyphFrames("AA  BB\nCC")).toEqual(["AA", "BB", "CC"]);
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
		expect(lines[0]).toBe("╔═left ═════ right═╗");
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
		expect(lines[0]).toBe("  left ═════ right  ");
		expect(lines[1]).toBe("║  ▌               ║");
		expect(lines.at(-1)).toBe("╚══════════════════╝");
	});

	test("keeps status content when sides layout hides top and bottom border lines", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "sides" });
		editor.setTopBorder({ content: "left ───── right", width: 16 });
		const lines = editor.render(20);
		expect(lines).toEqual(["  left ═════ right  ", "║  ▌               ║"]);
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
		});
		expect(editor.render(8)).toEqual(["╔══════╗", "╚AB▌  ═╝"]);
	});

	test("renders configured left glyph frame in full layout body row with input spacing", () => {
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "full" }, {
			style: "double",
			layout: "full",
			leftGlyph: { frameMs: 70, glyphs: "AB", frames: ["AB"] },
		});
		expect(editor.render(8)).toEqual(["╔══════╗", "║AB ▌  ║", "╚══════╝"]);
	});

	test("advances the left glyph frame and requests repaint", async () => {
		const repaints: number[] = [];
		const editor = new PromptBorderEditor(theme, { style: "double", layout: "default" }, {
			style: "double",
			layout: "default",
			leftGlyph: { frameMs: 1, glyphs: "AB CD", frames: ["AB", "CD"] },
		});
		editor.setShimmerRepaintHandler(() => repaints.push(1));
		expect(editor.render(8)[1]).toBe("╚AB▌  ═╝");
		await new Promise(resolve => setTimeout(resolve, 5));
		expect(repaints.length).toBeGreaterThan(0);
		expect(editor.render(8)[1]).toBe("╚CD▌  ═╝");
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
		});
		expect(
			normalizePromptBorderConfig({
				promptBorder: { style: "round", layout: "default", leftGlyph: { frameMs: 80, glyphs: "AA  BB" } },
			}),
		).toEqual({
			style: "round",
			layout: "default",
			leftGlyph: { frameMs: 80, glyphs: "AA  BB", frames: ["AA", "BB"] },
		});
	});

	test("creates prompt border config json example when missing", async () => {
		const dir = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "prompt-border-")));
		const configPath = path.join(dir, "config.json");
		const config = await ensurePromptBorderConfigFile(configPath);
		expect(config.leftGlyph.frames.length).toBe(73);
		expect(config).toEqual(EXAMPLE_PROMPT_BORDER_CONFIG);
		const saved = JSON.parse(await Bun.file(configPath).text());
		expect(saved.promptBorder.style).toBe("double");
		expect(saved.promptBorder.layout).toBe("full");
		expect(saved.promptBorder.leftGlyph.frameMs).toBe(70);
		expect(saved.promptBorder.leftGlyph.glyphs.startsWith("􁦘􁦙")).toBe(true);
		expect(saved.promptBorder.leftGlyph.glyphs.endsWith("􁨨􁨩")).toBe(true);
		expect(saved.promptBorder.leftGlyph.frames).toBeUndefined();
		expect(saved.promptBorder.leftGlyph.enabled).toBeUndefined();
		expect(await readPromptBorderConfig(configPath)).toEqual(EXAMPLE_PROMPT_BORDER_CONFIG);
	});

	test("writes prompt border style and layout while preserving glyph config", async () => {
		const dir = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "prompt-border-")));
		const configPath = path.join(dir, "config.json");
		await Bun.write(configPath, JSON.stringify({
			theme: "keep-me",
			promptBorder: {
				style: "double",
				layout: "full",
				custom: "preserved",
				leftGlyph: { frameMs: 80, glyphs: "" },
			},
		}, null, 2));

		const config = await writePromptBorderConfigSelection({ style: "round", layout: "sides" }, configPath);
		const saved = JSON.parse(await Bun.file(configPath).text());

		expect(config).toEqual({
			style: "round",
			layout: "sides",
			leftGlyph: { frameMs: 80, glyphs: "", frames: [] },
		});
		expect(saved.theme).toBe("keep-me");
		expect(saved.promptBorder.style).toBe("round");
		expect(saved.promptBorder.layout).toBe("sides");
		expect(saved.promptBorder.custom).toBe("preserved");
		expect(saved.promptBorder.leftGlyph).toEqual({ frameMs: 80, glyphs: "" });
		expect(saved.promptBorder.leftGlyph.frames).toBeUndefined();
		expect(saved.promptBorder.leftGlyph.enabled).toBeUndefined();
	});

	test("preserves welcome screen config when writing prompt border selection", async () => {
		const dir = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "prompt-border-")));
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
		const dir = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(os.tmpdir(), "prompt-border-")));
		const configPath = path.join(dir, "config.json");
		await Bun.write(configPath, JSON.stringify({
			promptBorder: {
				style: "double",
				layout: "full",
				leftGlyph: { frameMs: 80, glyphs: "AA  BB" },
			},
		}, null, 2));
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
		expect(saved.promptBorder.leftGlyph).toEqual({ frameMs: 80, glyphs: "AA  BB" });
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
