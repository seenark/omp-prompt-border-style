import { CustomEditor, type ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { mkdir } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	sliceByColumn,
	truncateToWidth,
	visibleWidth,
	type AutocompleteItem,
	type EditorTheme,
	type EditorTopBorder,
} from "@oh-my-pi/pi-tui";

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

export type PromptBorderLeftGlyphConfig = {
	frameMs: number;
	glyphs: string;
	frames: string[];
};

export type PromptBorderConfig = {
	style: BorderStyleName;
	layout: BorderLayoutName;
	leftGlyph: PromptBorderLeftGlyphConfig;
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
const DEFAULT_LEFT_GLYPH_FRAME_MS = 70;

export const CONFIG_PATH = path.join(os.homedir(), ".config", "codesook-omp", "config.json");

export const DEFAULT_LEFT_GLYPH_TEXT =
	"􁦘􁦙  􁦚􁦛  􁦜􁦝  􁦞􁦟  􁦠􁦡  􁦢􁦣  􁦤􁦥  􁦦􁦧  􁦨􁦩  􁦪􁦫  􁦬􁦭  􁦮􁦯  􁦰􁦱  􁦲􁦳  􁦴􁦵  􁦶􁦷  􁦸􁦹  􁦺􁦻  􁦼􁦽  􁦾􁦿  􁧀􁧁  􁧂􁧃  􁧄􁧅  􁧆􁧇  􁧈􁧉  􁧊􁧋  􁧌􁧍  􁧎􁧏  􁧐􁧑  􁧒􁧓  􁧔􁧕  􁧖􁧗  􁧘􁧙  􁧚􁧛  􁧜􁧝  􁧞􁧟  􁧠􁧡  􁧢􁧣  􁧤􁧥  􁧦􁧧  􁧨􁧩  􁧪􁧫  􁧬􁧭  􁧮􁧯  􁧰􁧱  􁧲􁧳  􁧴􁧵  􁧶􁧷  􁧸􁧹  􁧺􁧻  􁧼􁧽  􁧾􁧿  􁨀􁨁  􁨂􁨃  􁨄􁨅  􁨆􁨇  􁨈􁨉  􁨊􁨋  􁨌􁨍  􁨎􁨏  􁨐􁨑  􁨒􁨓  􁨔􁨕  􁨖􁨗  􁨘􁨙  􁨚􁨛  􁨜􁨝  􁨞􁨟  􁨠􁨡  􁨢􁨣  􁨤􁨥  􁨦􁨧  􁨨􁨩";

export function parseLeftGlyphFrames(glyphs: string): string[] {
	return glyphs.trim().split(/\s+/u).filter(Boolean);
}

export const DEFAULT_PROMPT_BORDER_CONFIG: PromptBorderConfig = {
	style: "double",
	layout: "full",
	leftGlyph: { frameMs: DEFAULT_LEFT_GLYPH_FRAME_MS, glyphs: "", frames: [] },
};

export const EXAMPLE_PROMPT_BORDER_CONFIG: PromptBorderConfig = {
	style: "double",
	layout: "full",
	leftGlyph: {
		frameMs: DEFAULT_LEFT_GLYPH_FRAME_MS,
		glyphs: DEFAULT_LEFT_GLYPH_TEXT,
		frames: parseLeftGlyphFrames(DEFAULT_LEFT_GLYPH_TEXT),
	},
};

export type PromptBorderAction =
	| { kind: "reset" }
	| { kind: "apply"; state: PromptBorderState }
	| { kind: "invalid" };

let activeBorder: PromptBorderState = { style: "double", layout: "full" };
let activeConfig: PromptBorderConfig = DEFAULT_PROMPT_BORDER_CONFIG;
let didReadInvalidConfig = false;
const CONFIG_PARSE_WARNING = `Prompt border config at ${CONFIG_PATH} is invalid JSON; using defaults without overwriting the file.`;

function notifyInvalidConfig(ctx: { ui: { notify: (message: string, level?: "info" | "warning" | "error") => void } }): void {
	if (!didReadInvalidConfig) return;
	ctx.ui.notify(CONFIG_PARSE_WARNING, "warning");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function toPromptBorderJson(config: PromptBorderConfig): Record<string, unknown> {
	return {
		style: config.style,
		layout: config.layout,
		leftGlyph: {
			frameMs: config.leftGlyph.frameMs,
			glyphs: config.leftGlyph.glyphs,
		},
	};
}

function mergePromptBorderJson(raw: Record<string, unknown>): Record<string, unknown> {
	const merged = { ...raw };
	const promptBorder = isRecord(raw.promptBorder) ? { ...raw.promptBorder } : {};
	const leftGlyph = isRecord(promptBorder.leftGlyph) ? { ...promptBorder.leftGlyph } : {};
	const examplePromptBorder = toPromptBorderJson(EXAMPLE_PROMPT_BORDER_CONFIG);
	const exampleLeftGlyph = (examplePromptBorder.leftGlyph as Record<string, unknown>) ?? {};

	if (typeof promptBorder.style !== "string") promptBorder.style = examplePromptBorder.style;
	if (typeof promptBorder.layout !== "string") promptBorder.layout = examplePromptBorder.layout;
	if (typeof leftGlyph.frameMs !== "number") leftGlyph.frameMs = exampleLeftGlyph.frameMs;
	if (typeof leftGlyph.glyphs !== "string") leftGlyph.glyphs = exampleLeftGlyph.glyphs;

	promptBorder.leftGlyph = leftGlyph;
	merged.promptBorder = promptBorder;
	return merged;
}

function parsePromptBorderConfigJson(rawText: string): { json: unknown; invalid: boolean } {
	try {
		return { json: JSON.parse(rawText), invalid: false };
	} catch {
		return { json: null, invalid: true };
	}
}

export function normalizePromptBorderConfig(raw: unknown): PromptBorderConfig {
	const promptBorder = isRecord(raw) && isRecord(raw.promptBorder) ? raw.promptBorder : {};
	const leftGlyph = isRecord(promptBorder.leftGlyph) ? promptBorder.leftGlyph : {};
	const style =
		typeof promptBorder.style === "string" && isBorderStyleName(promptBorder.style)
			? promptBorder.style
			: DEFAULT_PROMPT_BORDER_CONFIG.style;
	const layout =
		typeof promptBorder.layout === "string" && isBorderLayoutName(promptBorder.layout)
			? promptBorder.layout
			: DEFAULT_PROMPT_BORDER_CONFIG.layout;
	const frameMs =
		typeof leftGlyph.frameMs === "number" &&
		Number.isFinite(leftGlyph.frameMs) &&
		leftGlyph.frameMs >= 16 &&
		leftGlyph.frameMs <= 1000
			? leftGlyph.frameMs
			: DEFAULT_LEFT_GLYPH_FRAME_MS;
	const glyphText = typeof leftGlyph.glyphs === "string" ? leftGlyph.glyphs : "";
	const frames = glyphText.trim().length > 0 ? parseLeftGlyphFrames(glyphText) : [];
	return {
		style,
		layout,
		leftGlyph: {
			frameMs,
			glyphs: frames.length > 0 ? glyphText : "",
			frames,
		},
	};
}

export async function readPromptBorderConfig(configPath = CONFIG_PATH): Promise<PromptBorderConfig> {
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		didReadInvalidConfig = false;
		return DEFAULT_PROMPT_BORDER_CONFIG;
	}
	const parsed = parsePromptBorderConfigJson(await file.text());
	if (parsed.invalid) {
		didReadInvalidConfig = true;
		return DEFAULT_PROMPT_BORDER_CONFIG;
	}
	didReadInvalidConfig = false;
	return normalizePromptBorderConfig(parsed.json);
}

export async function ensurePromptBorderConfigFile(configPath = CONFIG_PATH): Promise<PromptBorderConfig> {
	await mkdir(path.dirname(configPath), { recursive: true });
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		didReadInvalidConfig = false;
		const created = { promptBorder: toPromptBorderJson(EXAMPLE_PROMPT_BORDER_CONFIG) };
		await Bun.write(configPath, `${JSON.stringify(created, null, 2)}\n`);
		return normalizePromptBorderConfig(created);
	}
	const parsed = parsePromptBorderConfigJson(await file.text());
	if (parsed.invalid || !isRecord(parsed.json)) {
		didReadInvalidConfig = true;
		return DEFAULT_PROMPT_BORDER_CONFIG;
	}
	didReadInvalidConfig = false;
	const merged = mergePromptBorderJson(parsed.json);
	await Bun.write(configPath, `${JSON.stringify(merged, null, 2)}\n`);
	return normalizePromptBorderConfig(merged);
}

export async function writePromptBorderConfigSelection(
	state: PromptBorderState,
	configPath = CONFIG_PATH,
): Promise<PromptBorderConfig> {
	await mkdir(path.dirname(configPath), { recursive: true });
	const file = Bun.file(configPath);
	if (!(await file.exists())) {
		const created = { promptBorder: toPromptBorderJson(EXAMPLE_PROMPT_BORDER_CONFIG) };
		const promptBorder = created.promptBorder as Record<string, unknown>;
		promptBorder.style = state.style;
		promptBorder.layout = state.layout;
		didReadInvalidConfig = false;
		await Bun.write(configPath, `${JSON.stringify(created, null, 2)}\n`);
		return normalizePromptBorderConfig(created);
	}
	const parsed = parsePromptBorderConfigJson(await file.text());
	if (parsed.invalid || !isRecord(parsed.json)) {
		didReadInvalidConfig = true;
		return DEFAULT_PROMPT_BORDER_CONFIG;
	}
	const merged = mergePromptBorderJson(parsed.json);
	const promptBorder = isRecord(merged.promptBorder) ? merged.promptBorder : {};
	promptBorder.style = state.style;
	promptBorder.layout = state.layout;
	merged.promptBorder = promptBorder;
	didReadInvalidConfig = false;
	await Bun.write(configPath, `${JSON.stringify(merged, null, 2)}\n`);
	return normalizePromptBorderConfig(merged);
}

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

function replaceVisibleGlyphAt(line: string, targetIndex: number, targetWidth: number, frame: string): string {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const tokens = [...line.matchAll(/\x1b\[[0-9;:]*m|./gu)].map(match => match[0]);
	let visibleIndex = 0;
	let targetTokenIndex = -1;
	for (let index = 0; index < tokens.length; index += 1) {
		if (tokens[index]!.startsWith("\x1b[")) continue;
		if (visibleIndex === targetIndex) {
			targetTokenIndex = index;
			break;
		}
		visibleIndex += 1;
	}
	if (targetTokenIndex === -1) return line;

	const originalWidth = visibleWidth(plain);
	const frameWidth = visibleWidth(frame);
	let suffix = tokens.slice(targetTokenIndex + 1).join("");
	let consumedSpaces = 0;

	if (frameWidth > targetWidth) {
		const availableSpaces = suffix.replace(ANSI_SGR_PATTERN, "").match(/^ +/u)?.[0].length ?? 0;
		consumedSpaces = Math.min(frameWidth - targetWidth, availableSpaces);
		if (consumedSpaces > 0) {
			const suffixWidth = visibleWidth(suffix);
			suffix = sliceByColumn(suffix, consumedSpaces, Math.max(0, suffixWidth - consumedSpaces));
		}
	}

	const allowedFrameWidth = targetWidth + consumedSpaces;
	const fittedFrame = frameWidth > allowedFrameWidth ? truncateToWidth(frame, allowedFrameWidth, "") : frame;
	let replacement = fittedFrame;
	const replacementWidth = visibleWidth(replacement);
	if (replacementWidth < targetWidth) {
		replacement = `${replacement}${" ".repeat(targetWidth - replacementWidth)}`;
	}

	const prefix = tokens.slice(0, targetTokenIndex).join("");
	const result = `${prefix}${replacement}${suffix}`;
	if (visibleWidth(result.replace(ANSI_SGR_PATTERN, "")) <= originalWidth) return result;

	const suffixWidth = visibleWidth(suffix.replace(ANSI_SGR_PATTERN, ""));
	const prefixWidth = visibleWidth(prefix.replace(ANSI_SGR_PATTERN, ""));
	const maxReplacementWidth = Math.max(0, originalWidth - prefixWidth - suffixWidth);
	replacement = truncateToWidth(replacement, maxReplacementWidth, "");
	return `${prefix}${replacement}${suffix}`;
}

export function replaceBodyLeftGlyph(line: string, glyphs: PromptBorderGlyphs, frame: string): string {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const plainChars = [...plain];
	if (plainChars[0] !== glyphs.bottomLeft || plainChars[1] !== glyphs.horizontal) return line;
	if (plainChars.at(-1) === glyphs.bottomRight && plainChars.slice(2, -1).every(char => char === glyphs.horizontal)) {
		return line;
	}
	return replaceVisibleGlyphAt(line, 1, visibleWidth(glyphs.horizontal), frame);
}

function replaceSideBodyLeftGlyph(line: string, glyphs: PromptBorderGlyphs, frame: string): string {
	const plain = line.replace(ANSI_SGR_PATTERN, "");
	const plainChars = [...plain];
	if (plainChars.length < 4 || plainChars[0] !== glyphs.vertical || plainChars.at(-1) !== glyphs.vertical) return line;
	if (plainChars[1] !== " " || plainChars[2] !== " ") return line;

	const tokens = [...line.matchAll(/\x1b\[[0-9;:]*m|./gu)].map(match => match[0]);
	let visibleIndex = 0;
	let leftPaddingTokenIndex = -1;
	for (let index = 0; index < tokens.length; index += 1) {
		if (tokens[index]!.startsWith("\x1b[")) continue;
		if (visibleIndex === 1) {
			leftPaddingTokenIndex = index;
			break;
		}
		visibleIndex += 1;
	}
	if (leftPaddingTokenIndex === -1) return line;

	const prefix = tokens.slice(0, leftPaddingTokenIndex).join("");
	const suffixTokens = tokens.slice(leftPaddingTokenIndex + 1);
	let result = `${prefix}${frame}${suffixTokens.join("")}`;
	let overflow = visibleWidth(result.replace(ANSI_SGR_PATTERN, "")) - visibleWidth(plain);

	for (let index = suffixTokens.length - 2; overflow > 0 && index >= 0; index -= 1) {
		const token = suffixTokens[index]!;
		if (token.startsWith("\x1b[")) continue;
		if (token !== " ") continue;
		suffixTokens.splice(index, 1);
		overflow -= 1;
	}

	let fittedFrame = frame;
	if (overflow > 0) {
		fittedFrame = truncateToWidth(frame, Math.max(1, visibleWidth(frame) - overflow), "");
	}
	return `${prefix}${fittedFrame}${suffixTokens.join("")}`;
}

export class PromptBorderEditor extends CustomEditor {
	readonly #state: PromptBorderState;
	readonly #glyphs: PromptBorderGlyphs;
	readonly #config: PromptBorderConfig;
	#topBorder: EditorTopBorder | undefined;
	#leftGlyphFrameIndex = 0;
	#leftGlyphTimer: Timer | undefined;
	#requestLeftGlyphRepaint: (() => void) | undefined;

	constructor(theme: EditorTheme, state: PromptBorderState, config: PromptBorderConfig = DEFAULT_PROMPT_BORDER_CONFIG) {
		const glyphs = borderStyles[state.style];
		const editorTheme =
			state.layout === "default"
				? withPromptBorder(theme, state)
				: withPromptBorder(theme, state, withSeparateBottomGlyphs(glyphs));
		super(editorTheme);
		this.#state = state;
		this.#glyphs = glyphs;
		this.#config = config;
	}
	override setTopBorder(content: EditorTopBorder | undefined): void {
		this.#topBorder = content;
		super.setTopBorder(content);
	}
	override setShimmerRepaintHandler(handler: (() => void) | undefined): void {
		super.setShimmerRepaintHandler(handler);
		this.#requestLeftGlyphRepaint = handler;
		if (handler !== undefined) return;
		if (this.#leftGlyphTimer !== undefined) clearTimeout(this.#leftGlyphTimer);
		this.#leftGlyphTimer = undefined;
	}
	#currentLeftGlyphFrame(): string | undefined {
		const frames = this.#config.leftGlyph.frames;
		if (frames.length === 0) return undefined;
		return frames[this.#leftGlyphFrameIndex % frames.length];
	}
	#scheduleLeftGlyphFrame(): void {
		const frames = this.#config.leftGlyph.frames;
		if (frames.length <= 1 || this.#leftGlyphTimer !== undefined || this.#requestLeftGlyphRepaint === undefined) return;
		this.#leftGlyphTimer = setTimeout(() => {
			this.#leftGlyphTimer = undefined;
			this.#leftGlyphFrameIndex = (this.#leftGlyphFrameIndex + 1) % frames.length;
			this.#requestLeftGlyphRepaint?.();
		}, this.#config.leftGlyph.frameMs);
		this.#leftGlyphTimer.unref?.();
	}
	override render(width: number): readonly string[] {
		const lines = [...super.render(width)];
		const frame = this.#currentLeftGlyphFrame();
		if (frame !== undefined) this.#scheduleLeftGlyphFrame();
		if (this.#state.layout === "default") {
			if (lines[0] === undefined) return lines;
			const bodyRows =
				frame === undefined ? lines.slice(1) : lines.slice(1).map(line => replaceBodyLeftGlyph(line, this.#glyphs, frame));
			return [restyleTopBorderHorizontalRuns(lines[0], this.#glyphs), ...bodyRows];
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
		const applyLeftGlyph = (rows: readonly string[]) =>
			frame === undefined
				? rows
				: rows.map(line => (line === borderLine ? line : replaceSideBodyLeftGlyph(replaceBodyLeftGlyph(line, this.#glyphs, frame), this.#glyphs, frame)));
		if (this.#state.layout === "sides") {
			if (splitIndex === -1) return [...topRows, ...applyLeftGlyph(normalizedBodyRows)];
			return [...topRows, ...applyLeftGlyph(normalizedBodyRows), ...bodyAndAutocompleteRows.slice(splitIndex)];
		}
		if (splitIndex === -1) return [...topRows, ...applyLeftGlyph(normalizedBodyRows), borderLine];
		return [...topRows, ...applyLeftGlyph(normalizedBodyRows), borderLine, ...bodyAndAutocompleteRows.slice(splitIndex)];
	}
	dispose(): void {
		if (this.#leftGlyphTimer !== undefined) clearTimeout(this.#leftGlyphTimer);
		this.#leftGlyphTimer = undefined;
		super.setShimmerRepaintHandler(undefined);
	}
}
export default function promptBorderStyle(pi: ExtensionAPI, configPath = CONFIG_PATH): void {
	pi.setLabel("Prompt Border Style");

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		activeConfig = await ensurePromptBorderConfigFile(configPath);
		notifyInvalidConfig(ctx);
		activeBorder = { style: activeConfig.style, layout: activeConfig.layout };
		ctx.ui.setEditorComponent((_tui, theme) => new PromptBorderEditor(theme, activeBorder, activeConfig));
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
			activeConfig = await ensurePromptBorderConfigFile(configPath);
			notifyInvalidConfig(ctx);
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
			activeConfig = await writePromptBorderConfigSelection(activeBorder, configPath);
			notifyInvalidConfig(ctx);
			ctx.ui.setEditorComponent((_tui, theme) => new PromptBorderEditor(theme, activeBorder, activeConfig));
			ctx.ui.notify(`Prompt border: ${activeBorder.style} ${activeBorder.layout}`, "info");
		},
	});
}
