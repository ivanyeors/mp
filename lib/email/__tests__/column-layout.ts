import { renderEmailShell } from "../base";
import { LAYOUT } from "../theme";

const SHELL = renderEmailShell({ bodyHtml: "" });
const PHONE_BELOW = Number(/@media only screen and \(max-width: (\d+)px\)/.exec(SHELL)![1]);
const PHONE_PADDING = Number(/\.mp-pad \{ padding: (\d+)px/.exec(SHELL)![1]);

export function columnOn(screen: number, mediaQueries = true): number {
  const card = Math.min(LAYOUT.containerWidth, screen - 2 * LAYOUT.outerPadding);
  const padding = mediaQueries && screen <= PHONE_BELOW ? PHONE_PADDING : LAYOUT.cardPadding;
  return card - 2 * padding - 2;
}

function length(value: string, row: number, calc: boolean): number | null {
  const px = /^(\d+)px$/.exec(value);
  if (px) return Number(px[1]);
  const pct = /^(\d+)%$/.exec(value);
  if (pct) return (row * Number(pct[1])) / 100;
  const fab = /^calc\(\((\d+)px - 100%\) \* (\d+)\)$/.exec(value);
  if (fab) return calc ? (Number(fab[1]) - row) * Number(fab[2]) : null;
  throw new Error(`No layout for ${value}`);
}

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
  return Math.max(min, Math.min(max, width));
}

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

export const sideBySide = (cols: HTMLElement[], screen: number, mediaQueries = true) => linesOn(cols, screen, mediaQueries).length === 1;

export const stacked = (cols: HTMLElement[], screen: number, mediaQueries = true) => linesOn(cols, screen, mediaQueries).every((n) => n === 1);
