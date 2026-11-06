/**
 * What a pillow read from a Fitting record gave up to be drawn (ADR 0042 j),
 * in the words the Customer page shows. Pure.
 */
import { formatTemplateKeys } from "@/lib/filling-templates/keys";
import type { FittingTemplateMatch } from "./match";

const baseName = (name: string) => name.replace(/\s*\(\s*short\s*neck\s*\)\s*$/i, "");

/** Every way the match is not exactly what the fitting recorded; empty when it is. */
export function matchNotices(match: FittingTemplateMatch | null): string[] {
  if (!match) return [];
  const out: string[] = [];
  if (!match.code) out.push("The fitting recorded no configuration type, so no filling is drawn.");
  else if (!match.template) out.push(`No active Filling Template is named Type-${match.code}, so no filling is drawn.`);
  const t = match.template;
  if (t && match.otherSize && match.size) {
    const serves = t.keys.length ? formatTemplateKeys("pillow", t.keys) : "no size";
    out.push(
      `${t.name} serves ${serves}, not ${match.size}, so it is drawn at ${match.size}. Add ${match.size} to its sizes in Configure, or link another template.`,
    );
  }
  if (t && match.otherNeck) {
    out.push(
      match.neck === "short"
        ? `There is no Short Neck ${baseName(t.name)}, so the standard one is shown.`
        : `There is only a Short Neck ${baseName(t.name)}, though the fitting recorded a long neck.`,
    );
  }
  if (!match.size) out.push("The fitting recorded no pillow size, so it is drawn at M.");
  return out;
}
