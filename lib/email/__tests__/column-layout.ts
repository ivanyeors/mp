import { renderEmailShell } from "../base";
import { LAYOUT } from "../theme";

/**
 * Where a row of columns lands (PRD-campaign-email-editor slices 06 and 07),
 * worked out from the shell's own numbers and each column's inline style, as
 * a browser lays inline-blocks out: side by side while they fit the line, the
 * next one on a new line when it doesn't. The owner's inbox matrix (slice 12)
 * checks the real clients.
 */

// The shell's phone layout, read from its own <style>.
const SHELL = renderEmailShell({ bodyHtml: "" });
const PHONE_BELOW = Number(/@media only screen and \(max-width: (\d+)px\)/.exec(SHELL)![1]);
const PHONE_PADDING = Number(/\.mp-pad \{ padding: (\d+)px/.exec(SHELL)![1]);

/**
 * The card's inner column on a screen `screen` px wide: what a row of columns
 * has to fit in. `mediaQueries` false is Gmail's apps for an account they
 * ignore media queries for: the card keeps its computer padding.
 */
export function columnOn(screen: number, mediaQueries = true): number {
  const card = Math.min(LAYOUT.containerWidth, screen - 2 * LAYOUT.outerPadding);
  const padding = mediaQueries && screen <= PHONE_BELOW ? PHONE_PADDING : LAYOUT.cardPadding;
  return card - 2 * padding - 2;
}

/** A length in a column's style, in a row `row` px wide; null for a calc() the reader drops. */
function length(value: string, row: number, calc: boolean): number | null {
  const px = /^(\d+)px$/.exec(value);
  if (px) return Number(px[1]);
  const pct = /^(\d+)%$/.exec(value);
  if (pct) return (row * Number(pct[1])) / 100;
  const fab = /^calc\(\((\d+)px - 100%\) \* (\d+)\)$/.exec(value);
  if (fab) return calc ? (Number(fab[1]) - row) * Number(fab[2]) : null;
  throw new Error(`No layout for ${value}`);
}

/** A column's width in a row `row` px wide: its last width the reader keeps, held between its min- and max-width. */
function widthOf(el: HTMLElement, row: number, calc: boolean): number {
  let width = row;
  let min = 0;
  let max = Infinity;
  for (const decl of (el.getAttribute("style") ?? "").split(";")) {
    const at = decl.indexOf(":");
    const [prop, value] = [decl.slice(0, at), decl.slice(at + 1)];
    if (prop !== "width" && prop !== "min-width" && prop !== "max-width") continue;
    const px = length(value, row, calc);
    if (px === null) continue;
    if (prop === "width") width = px;
    else if (prop === "min-width") min = px;
    else max = px;
  }
  // A min-width wins over a max-width, as in CSS.
  return Math.max(min, Math.min(max, width));
}

/**
 * How many columns sit on each line on a screen `screen` px wide: `[3]` side
 * by side, `[1, 1, 1]` one per row. `mediaQueries` false is Gmail's apps for
 * a non-Google account, which drop calc() too.
 */
export function linesOn(cols: HTMLElement[], screen: number, mediaQueries = true): number[] {
  const row = columnOn(screen, mediaQueries);
  const lines: number[] = [];
  let used = 0;
  for (const c of cols) {
    const w = widthOf(c, row, mediaQueries);
    if (lines.length && used + w <= row) {
      lines[lines.length - 1] += 1;
      used += w;
    } else {
      lines.push(1);
      used = w;
    }
  }
  return lines;
}

/** Every column on one line. */
export const sideBySide = (cols: HTMLElement[], screen: number, mediaQueries = true) => linesOn(cols, screen, mediaQueries).length === 1;

/** One column per line: no two side by side. */
export const stacked = (cols: HTMLElement[], screen: number, mediaQueries = true) => linesOn(cols, screen, mediaQueries).every((n) => n === 1);
