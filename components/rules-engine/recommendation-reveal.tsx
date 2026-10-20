"use client";

import { Badge } from "@/components/ui/badge";
import type { MixLine } from "@/lib/rules-engine/why";

const SPECIALISTS =
  "Recommended — our specialists confirm every build.";

type Props = {
  sizeLabel: string;
  templateName: string | null;
  mixLines: MixLine[];
  /** When false, render nothing (incomplete / unresolved route). */
  reveal: boolean;
};

/**
 * Completed-preview recommendation block (size + mix). No "why" line: the
 * trace-built one named only the shoulder band, so it is withdrawn until a
 * reason that covers the whole decision replaces it.
 */
export function RecommendationReveal({
  sizeLabel,
  templateName,
  mixLines,
  reveal,
}: Props) {
  if (!reveal) return null;

  return (
    <div className="max-w-sm space-y-2 rounded-lg bg-black/25 px-4 py-3 text-center text-white backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="secondary" className="px-3 py-1 text-sm">
          {sizeLabel}
        </Badge>
      </div>
      {templateName ? (
        <div className="space-y-1 text-left text-xs text-white/85">
          <p className="font-medium text-white">{templateName}</p>
          {mixLines.length > 0 ? (
            <ul className="space-y-0.5">
              {mixLines.map((line, i) => (
                <li key={`${line.label}-${i}`}>
                  {line.label} ×{line.qty}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="pt-1 text-[11px] italic text-white/70">{SPECIALISTS}</p>
        </div>
      ) : (
        <p className="text-[11px] italic text-white/70">{SPECIALISTS}</p>
      )}
    </div>
  );
}
