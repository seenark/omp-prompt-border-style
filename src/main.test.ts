import { describe, expect, test } from "bun:test";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { AutocompleteProvider, EditorTheme } from "@oh-my-pi/pi-tui";
import promptBorderStyle, {
	PromptBorderEditor,
	borderStyles,
	getPromptBorderArgumentCompletions,
	parsePromptBorderArgs,
	renderBottomBorderLine,
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
