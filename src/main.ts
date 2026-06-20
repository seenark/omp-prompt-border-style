import { CustomEditor, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { truncateToWidth, type AutocompleteItem, type EditorTheme, type EditorTopBorder } from "@oh-my-pi/pi-tui";

export type BorderStyleName =
	| "round"
	| "sharp"
	| "heavy"
	| "dashed"
	| "heavy-dashed"
	| "heavy-top"
	| "double"
	| "double-top"
	| "double-side"
	| "ascii"
	| "block"
	| "vertical"
	| "double-vertical"
	| "horizontal"
	| "double-horizontal";

export type BorderLayoutName = "full" | "bottom" | "sides" | "top-bottom" | "default";

export type PromptBorderState = {
	style: BorderStyleName;
	layout: BorderLayoutName;
};

export type PromptBorderGlyphs = Pick<
	EditorTheme["symbols"]["boxRound"],
	"topLeft" | "topRight" | "bottomLeft" | "bottomRight" | "horizontal" | "vertical"
>;

export const borderStyles: Record<BorderStyleName, PromptBorderGlyphs> = {
	round: { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" },
	sharp: { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" },
	heavy: { topLeft: "┏", topRight: "┓", bottomLeft: "┗", bottomRight: "┛", horizontal: "━", vertical: "┃" },
	dashed: { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "╌", vertical: "╎" },
	"heavy-dashed": { topLeft: "┏", topRight: "┓", bottomLeft: "┗", bottomRight: "┛", horizontal: "╍", vertical: "╏" },
	"heavy-top": { topLeft: "┍", topRight: "┑", bottomLeft: "┕", bottomRight: "┙", horizontal: "━", vertical: "│" },
	double: { topLeft: "╔", topRight: "╗", bottomLeft: "╚", bottomRight: "╝", horizontal: "═", vertical: "║" },
	"double-top": { topLeft: "╒", topRight: "╕", bottomLeft: "╘", bottomRight: "╛", horizontal: "═", vertical: "│" },
	"double-side": { topLeft: "╓", topRight: "╖", bottomLeft: "╙", bottomRight: "╜", horizontal: "─", vertical: "║" },
	ascii: { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" },
	block: { topLeft: "▲", topRight: "▲", bottomLeft: "▼", bottomRight: "▼", horizontal: " ", vertical: "█" },
	vertical: { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: " ", vertical: "│" },
	"double-vertical": { topLeft: "╓", topRight: "╖", bottomLeft: "╙", bottomRight: "╜", horizontal: " ", vertical: "║" },
	horizontal: { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: " " },
	"double-horizontal": { topLeft: "╒", topRight: "╕", bottomLeft: "╘", bottomRight: "╛", horizontal: "═", vertical: " " },
};

const STYLE_NAMES = Object.keys(borderStyles) as BorderStyleName[];
const LAYOUT_NAMES = ["full", "bottom", "sides", "top-bottom", "default"] as const;
const PRIMARY_COMMAND_OPTIONS = [...STYLE_NAMES, "layout", "reset"] as const;
const USAGE = `Usage: /prompt-border <${STYLE_NAMES.join("|")}> [full|bottom|sides|top-bottom|default] | /prompt-border layout <full|bottom|sides|top-bottom|default> | /prompt-border reset`;

export type PromptBorderAction =
	| { kind: "reset" }
	| { kind: "apply"; state: PromptBorderState }
	| { kind: "invalid" };

let activeBorder: PromptBorderState = { style: "double", layout: "full" };

export function isBorderStyleName(value: string): value is BorderStyleName {
	return (STYLE_NAMES as readonly string[]).includes(value);
}

export function isBorderLayoutName(value: string): value is BorderLayoutName {
	return (LAYOUT_NAMES as readonly string[]).includes(value);
}

export function getPromptBorderArgumentCompletions(argumentPrefix: string): AutocompleteItem[] | null {
	const normalized = argumentPrefix.toLowerCase();
	const hasTrailingSpace = /\s$/.test(normalized);
	const parts = normalized.trim().split(/\s+/).filter(Boolean);
	const tokenPrefix = hasTrailingSpace ? "" : (parts.at(-1) ?? "");
	const complete = (value: string): AutocompleteItem => ({ value, label: value });
	const completeLayoutSubcommand = (layout: BorderLayoutName): AutocompleteItem => ({ value: `layout ${layout}`, label: layout });
	if (parts.length === 0) {
		return PRIMARY_COMMAND_OPTIONS.map(complete);
	}
	const first = parts[0]!;
	if (parts.length === 1 && first === "layout" && !hasTrailingSpace) {
		return LAYOUT_NAMES.map(completeLayoutSubcommand);
	}
	if (parts.length === 1 && !hasTrailingSpace) {
		return PRIMARY_COMMAND_OPTIONS.filter(option => option.startsWith(tokenPrefix)).map(complete);
	}
	if (first === "layout" && (parts.length === 1 || (parts.length === 2 && !hasTrailingSpace))) {
		return LAYOUT_NAMES.filter(layout => layout.startsWith(tokenPrefix)).map(completeLayoutSubcommand);
	}
	if (isBorderStyleName(first) && (parts.length === 1 || (parts.length === 2 && !hasTrailingSpace))) {
		return LAYOUT_NAMES.filter(layout => layout.startsWith(tokenPrefix)).map(complete);
	}
	return null;
}

export function parsePromptBorderArgs(args: string, current: PromptBorderState): PromptBorderAction {
	const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { kind: "invalid" };
	if (parts.length === 1 && parts[0] === "reset") return { kind: "reset" };
	if (parts[0] === "layout") {
		if (parts.length !== 2 || !isBorderLayoutName(parts[1]!)) return { kind: "invalid" };
		return { kind: "apply", state: { ...current, layout: parts[1]! } };
	}
	if (!isBorderStyleName(parts[0]!)) return { kind: "invalid" };
	if (parts.length === 1) return { kind: "apply", state: { ...current, style: parts[0]! } };
	if (parts.length === 2 && isBorderLayoutName(parts[1]!)) {
		return { kind: "apply", state: { style: parts[0]!, layout: parts[1]! } };
	}
	return { kind: "invalid" };
}

export function withPromptBorder(theme: EditorTheme, state: PromptBorderState, glyphOverride?: PromptBorderGlyphs): EditorTheme {
	return {
		...theme,
		symbols: {
			...theme.symbols,
			boxRound: {
				...theme.symbols.boxRound,
				...(glyphOverride ?? borderStyles[state.style]),
			},
		},
	};
}


function withSeparateBottomGlyphs(glyphs: PromptBorderGlyphs): PromptBorderGlyphs {
	return {
		...glyphs,
		bottomLeft: glyphs.vertical,
		bottomRight: glyphs.vertical,
	};
}

const ANSI_SGR_PATTERN = /\x1b\[[0-9;:]*m/g;

function stripSideRowHorizontalPadding(line: string, glyphs: PromptBorderGlyphs): string {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const chars = [...plain];
	if (chars.length < 4 || chars[0] !== glyphs.vertical || chars.at(-1) !== glyphs.vertical) return line;
	const leftPaddingIndex = 1;
	const rightPaddingIndex = chars.length - 2;
	let visibleIndex = 0;
	return line.replace(/\x1b\[[0-9;:]*m|./gu, token => {
		if (token.startsWith("\x1b[")) return token;
		const shouldReplace =
			token === glyphs.horizontal && (visibleIndex === leftPaddingIndex || visibleIndex === rightPaddingIndex);
		visibleIndex += 1;
		return shouldReplace ? " " : token;
	});
}

function restyleTopBorderHorizontalRuns(line: string, glyphs: PromptBorderGlyphs): string {
	if (glyphs.horizontal === " ") return line;
	return line.replace(/([─━╌╍═-])\1+/gu, match => glyphs.horizontal.repeat([...match].length));
}

function hideSideBorderGlyphs(line: string, glyphs: PromptBorderGlyphs): string {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const chars = [...plain];
	if (chars.length < 2 || chars[0] !== glyphs.vertical || chars.at(-1) !== glyphs.vertical) return line;
	let visibleIndex = 0;
	return line.replace(/\x1b\[[0-9;:]*m|./gu, token => {
		if (token.startsWith("\x1b[")) return token;
		const shouldReplace = visibleIndex === 0 || visibleIndex === chars.length - 1;
		visibleIndex += 1;
		return shouldReplace ? " " : token;
	});
}

function hideTopBorderLine(line: string, glyphs: PromptBorderGlyphs, topBorder: EditorTopBorder | undefined): string | null {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const chars = [...plain];
	if (chars.length < 2 || chars[0] !== glyphs.topLeft || chars.at(-1) !== glyphs.topRight) return line;
	if (!topBorder) return null;
	let plainContent = topBorder.content.replace(ANSI_SGR_PATTERN, "");
	let firstContentIndex = plain.indexOf(plainContent, 1);
	if (firstContentIndex === -1) {
		for (let width = topBorder.width - 1; width > 0; width -= 1) {
			const truncated = truncateToWidth(topBorder.content, width);
			plainContent = truncated.replace(ANSI_SGR_PATTERN, "");
			firstContentIndex = plain.indexOf(plainContent, 1);
			if (plainContent.length > 0 && firstContentIndex !== -1) break;
		}
	}
	if (plainContent.length === 0 || firstContentIndex === -1) return null;
	const lastContentIndex = firstContentIndex + [...plainContent].length - 1;
	let visibleIndex = 0;
	return line.replace(/\x1b\[[0-9;:]*m|./gu, token => {
		if (token.startsWith("\x1b[")) return token;
		const shouldReplace = visibleIndex < firstContentIndex || visibleIndex > lastContentIndex;
		visibleIndex += 1;
		return shouldReplace ? " " : token;
	});
}

export function renderBottomBorderLine(width: number, glyphs: PromptBorderGlyphs, color: (str: string) => string): string {
	return color(`${glyphs.bottomLeft}${glyphs.horizontal.repeat(Math.max(0, width - 2))}${glyphs.bottomRight}`);
}

export class PromptBorderEditor extends CustomEditor {
	readonly #state: PromptBorderState;
	readonly #glyphs: PromptBorderGlyphs;
	#topBorder: EditorTopBorder | undefined;

	constructor(theme: EditorTheme, state: PromptBorderState) {
		const glyphs = borderStyles[state.style];
		const editorTheme =
			state.layout === "default"
				? withPromptBorder(theme, state)
				: withPromptBorder(theme, state, withSeparateBottomGlyphs(glyphs));
		super(editorTheme);
		this.#state = state;
		this.#glyphs = glyphs;
	}
	override setTopBorder(content: EditorTopBorder | undefined): void {
		this.#topBorder = content;
		super.setTopBorder(content);
	}
	render(width: number): readonly string[] {
		const lines = [...super.render(width)];
		if (this.#state.layout === "default") {
			if (lines[0] === undefined) return lines;
			return [restyleTopBorderHorizontalRuns(lines[0], this.#glyphs), ...lines.slice(1)];
		}
		const restyledTopRow = lines[0] === undefined ? undefined : restyleTopBorderHorizontalRuns(lines[0], this.#glyphs);
		const hiddenTopRow = restyledTopRow === undefined ? null : hideTopBorderLine(restyledTopRow, this.#glyphs, this.#topBorder);
		const topRows =
			this.#state.layout === "full" || this.#state.layout === "top-bottom"
				? restyledTopRow === undefined
					? []
					: [restyledTopRow]
				: hiddenTopRow === null
					? []
					: [hiddenTopRow];
		const bodyAndAutocompleteRows = lines.slice(1);
		const splitIndex = bodyAndAutocompleteRows.findIndex(line => {
			const plain = line.replace(ANSI_SGR_PATTERN, "");
			return !plain.startsWith(this.#glyphs.vertical) || !plain.endsWith(this.#glyphs.vertical);
		});
		const borderedBodyRows =
			splitIndex === -1 ? bodyAndAutocompleteRows : bodyAndAutocompleteRows.slice(0, splitIndex);
		const sideOnlyBodyRows = borderedBodyRows.map(line => stripSideRowHorizontalPadding(line, this.#glyphs));
		const normalizedBodyRows =
			this.#state.layout === "top-bottom"
				? sideOnlyBodyRows.map(line => hideSideBorderGlyphs(line, this.#glyphs))
				: sideOnlyBodyRows;
		const borderLine = renderBottomBorderLine(width, this.#glyphs, this.borderColor);
		if (this.#state.layout === "sides") {
			if (splitIndex === -1) return [...topRows, ...normalizedBodyRows];
			return [...topRows, ...normalizedBodyRows, ...bodyAndAutocompleteRows.slice(splitIndex)];
		}
		if (splitIndex === -1) return [...topRows, ...normalizedBodyRows, borderLine];
		return [...topRows, ...normalizedBodyRows, borderLine, ...bodyAndAutocompleteRows.slice(splitIndex)];
	}
}


export default function promptBorderStyle(pi: ExtensionAPI): void {
	pi.setLabel("Prompt Border Style");

	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setEditorComponent((_tui, theme) => new PromptBorderEditor(theme, activeBorder));
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setEditorComponent(undefined);
	});

	pi.registerCommand("prompt-border", {
		description: "Change the prompt input border style",
		getArgumentCompletions: getPromptBorderArgumentCompletions,
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;

			const action = parsePromptBorderArgs(args, activeBorder);
			if (action.kind === "reset") {
				activeBorder = { style: "double", layout: "full" };
				ctx.ui.setEditorComponent(undefined);
				ctx.ui.notify("Prompt border reset", "info");
				return;
			}
			if (action.kind === "invalid") {
				ctx.ui.notify(USAGE, "warning");
				return;
			}
			activeBorder = action.state;
			ctx.ui.setEditorComponent((_tui, theme) => new PromptBorderEditor(theme, activeBorder));
			ctx.ui.notify(`Prompt border: ${activeBorder.style} ${activeBorder.layout}`, "info");
		},
	});
}
