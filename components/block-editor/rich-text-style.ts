/**
 * How `RichText` looks, shared by the TipTap editor and its read-only view
 * so one never jumps to the other, and kept apart from both so the view never
 * pulls TipTap into a page's first load.
 */

/** An empty paragraph's class in the editor (TipTap's Placeholder), which shows its `data-placeholder`. */
export const RICH_TEXT_EMPTY = "is-editor-empty";

/**
 * The input's box, with its few rules for what is inside: the placeholder an
 * empty input shows, the space between paragraphs, and the bullets.
 */
export const RICH_TEXT_BOX = [
  "min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base break-words whitespace-pre-wrap shadow-xs outline-none md:text-sm",
  "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
  "[&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&>*+*]:mt-3",
].join(" ");

/**
 * A Variable wherever the editor shows one: a chip with its label, never its
 * `{key}` (PRD-campaign-email-editor decision 3).
 */
export const VARIABLE_CHIP =
  "mx-0.5 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-px align-baseline text-[0.85em] font-medium whitespace-nowrap text-foreground";
