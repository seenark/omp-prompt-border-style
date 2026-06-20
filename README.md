# omp-prompt-border-style

Prompt border styles for the oh-my-pi input editor.

## What this plugin does

This plugin registers a `/prompt-border` command that lets you switch the prompt editor border style and layout at runtime.

It customizes:
- the top status-line border glyphs
- the editor side borders
- a synthetic bottom border for layouts that use one
- slash-command argument completions for the command itself

The default active state is:
- style: `double`
- layout: `full`

## Requirements

- `omp` with plugin support
- `@oh-my-pi/pi-coding-agent` `>=16.1.7`
- `@oh-my-pi/pi-tui` `>=16.1.7`

This package declares the OMP packages as peer dependencies because it extends the host editor UI.

## Install

From a published package name:

```bash
omp plugin install omp-prompt-border-style
```

From a local checkout during development:

```bash
omp plugin install /absolute/path/to/omp-prompt-border-style
```

This repo exposes the extension through `omp.extensions` in `package.json`, pointing at `./src/main.ts`.

## Command

```text
/prompt-border <style> [layout]
/prompt-border layout <layout>
/prompt-border reset
```

If the arguments are invalid, the plugin shows the command usage string in the UI.

## Styles

- `round`
- `sharp`
- `heavy`
- `dashed`
- `heavy-dashed`
- `heavy-top`
- `double`
- `double-top`
- `double-side`
- `ascii`
- `block`
- `vertical`
- `double-vertical`
- `horizontal`
- `double-horizontal`

## Layouts

- `full` — full top border, side borders, and a separate synthetic bottom border
- `bottom` — keeps the upstream top/status row and adds only the separate synthetic bottom border
- `sides` — keeps only the left and right editor borders around the body rows
- `top-bottom` — keeps the top border and separate synthetic bottom border, hides side borders in body rows
- `default` — uses the upstream editor layout, restyled with the selected border glyph set

For non-`default` layouts, the plugin inserts the synthetic bottom border before autocomplete rows so slash-command suggestions stay below the editor body.

## Examples

```text
/prompt-border round
/prompt-border heavy
/prompt-border dashed
/prompt-border double bottom
/prompt-border sharp sides
/prompt-border double top-bottom
/prompt-border layout full
/prompt-border layout bottom
/prompt-border layout sides
/prompt-border layout default
/prompt-border reset
```

## Autocomplete behavior

Typing `/prompt-border ` and then pressing Space or Tab opens command completions.

- First position: all style names, plus `layout` and `reset`
- After a style: all layout names
- After `layout`: all layout names, returned as `layout <name>` completions

## Development

Install dependencies:

```bash
bun install
```

Run the typecheck:

```bash
bun run check
```

Run the tests:

```bash
bun test src/main.test.ts
```

## Repository contents

- `src/main.ts` — plugin implementation, border rendering, command parsing, and command registration
- `src/main.test.ts` — parser, renderer, command, and completion tests
- `package.json` — package metadata, peer dependencies, scripts, and OMP extension entrypoint
- `tsconfig.json` — TypeScript configuration
