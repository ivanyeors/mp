export const RICH_TEXT_EMPTY = "is-editor-empty";

export const RICH_TEXT_BOX = [
  "min-h-24 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base break-words whitespace-pre-wrap shadow-xs outline-none md:text-sm",
  "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
  "[&_li]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&>*+*]:mt-3",
].join(" ");

export const VARIABLE_CHIP =
  "mx-0.5 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-px align-baseline text-[0.85em] font-medium whitespace-nowrap text-foreground";

export const RICH_TEXT_ONE_LINE = [
  "min-h-9",
  "[&_.is-editor-empty:first-child]:relative [&_.is-editor-empty:first-child]:before:absolute [&_.is-editor-empty:first-child]:before:inset-x-0 [&_.is-editor-empty:first-child]:before:h-auto [&_.is-editor-empty:first-child]:before:truncate",
].join(" ");
