import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const mergesAsClsxPlusTailwindMerge3: Array<[Parameters<typeof cn>, string]> = [
  [
    ["rounded-lg border px-2 py-2 text-xs", "border-primary bg-primary/5 font-medium text-primary", "text-muted-foreground"],
    "rounded-lg border px-2 py-2 text-xs border-primary bg-primary/5 font-medium text-muted-foreground",
  ],
  [
    ["min-w-0 rounded-xl border bg-card shadow-xs transition-opacity", "bg-muted/20", "border-dashed opacity-40 shadow-none"],
    "min-w-0 rounded-xl border transition-opacity bg-muted/20 border-dashed opacity-40 shadow-none",
  ],
  [
    ["min-w-0 rounded-lg ring-offset-2 ring-offset-background", "ring-2 ring-primary/50", "ring-2 ring-sky-400"],
    "min-w-0 rounded-lg ring-offset-2 ring-offset-background ring-2 ring-sky-400",
  ],
  [["ring-1 ring-inset ring-sky-400/50", "ring-2 ring-inset ring-sky-400"], "ring-2 ring-inset ring-sky-400"],
  [
    [
      "rounded-xl border",
      "border-[#1298ff]/40 bg-[#eaf3ff] dark:bg-[#0b2550]/70",
      "border-slate-200 bg-slate-50/80 dark:bg-white/5",
    ],
    "rounded-xl border border-slate-200 bg-slate-50/80 dark:bg-white/5",
  ],
  [
    ["relative min-h-0 overflow-hidden", "h-[calc(100svh-8rem)] min-h-[28rem] md:h-[calc(100svh-19rem)]"],
    "relative overflow-hidden h-[calc(100svh-8rem)] min-h-[28rem] md:h-[calc(100svh-19rem)]",
  ],
  [["flex h-8 px-3 text-sm [&>svg]:size-4", "h-7 px-2 text-xs [&>svg]:size-3"], "flex h-7 px-2 text-xs [&>svg]:size-3"],
  [
    ["relative h-9 border-l px-2 pointer-coarse:h-11", "outline outline-2 -outline-offset-2 outline-primary"],
    "relative h-9 border-l px-2 pointer-coarse:h-11 outline-2 -outline-offset-2 outline-primary",
  ],
  [["absolute", "fixed"], "fixed"],
  [
    ["hover:bg-accent data-[state=open]:bg-accent", "hover:bg-transparent data-[state=open]:bg-muted"],
    "hover:bg-transparent data-[state=open]:bg-muted",
  ],
  [
    ["px-2", false, null, undefined, 0, "", ["py-1", ["px-4"]], { "text-white": true, "text-black": false }],
    "py-1 px-4 text-white",
  ],
];

describe("cn", () => {
  it.each(mergesAsClsxPlusTailwindMerge3)("merges %j the way clsx + tailwind-merge 3 did", (args, expected) => {
    expect(cn(...args)).toBe(expected);
  });
});
