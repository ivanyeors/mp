/**
 * A text block's words between the shared `RichText` input and the
 * campaign's content (PRD-campaign-email-editor slice 04). Pure. The input's
 * runs and the content's runs are the same shape; this keeps only what the
 * content can hold: a link that is https, a Variable the catalogue has, and
 * no empty run. Anything else stays words.
 */
import type { RichTextRun, RichTextValue, RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { isHttpsUrl, type Paragraph, type Run } from "@/lib/email-campaigns/content";
import { campaignVariable, isVariableKey, POINTS_NOT_LIVE, VARIABLE_KEYS } from "@/lib/email-campaigns/variables";

/**
 * Pure — the campaign's Variables as the editor offers them (slice 13): every
 * one in the catalogue, *Points balance* greyed, with why, while points are
 * not live. A greyed one still shows as its chip where the words hold it.
 */
export function campaignVariables({ pointsLive }: { pointsLive: boolean }): RichTextVariable[] {
  return VARIABLE_KEYS.map((key) => {
    const v = campaignVariable(key);
    return { key, label: v.label, description: v.description, disabledReason: v.needsPoints && !pointsLive ? POINTS_NOT_LIVE : null };
  });
}

/** The Variables a text block offers, as chips, with nothing greyed. */
export const TEXT_VARIABLES: readonly RichTextVariable[] = campaignVariables({ pointsLive: true });

function contentRuns(runs: readonly RichTextRun[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if ("var" in r) {
      if (isVariableKey(r.var)) out.push({ var: r.var });
      else push(out, { text: `{${r.var}}` });
      continue;
    }
    if (!r.text) continue;
    push(out, {
      text: r.text,
      ...(r.bold ? { bold: true } : {}),
      ...(r.italic ? { italic: true } : {}),
      ...(r.href && isHttpsUrl(r.href) ? { href: r.href } : {}),
    });
  }
  return out;
}

/** Runs with the same marks side by side become one. */
function push(out: Run[], r: Extract<Run, { text: string }>) {
  const last = out.at(-1);
  if (last && "text" in last && last.bold === r.bold && last.italic === r.italic && last.href === r.href) last.text += r.text;
  else out.push(r);
}

/** Pure — the input's value as a text block's paragraphs. */
export function paragraphsOf(value: RichTextValue): Paragraph[] {
  const out: Paragraph[] = [];
  for (const p of value) {
    if (p.kind === "p") {
      const runs = contentRuns(p.runs);
      if (runs.length) out.push({ kind: "p", runs });
    } else {
      const items = p.items.map(contentRuns).filter((r) => r.length);
      if (items.length) out.push({ kind: "bullets", items });
    }
  }
  return out;
}

/** Pure — a text block's paragraphs as the input's value. */
export function richTextOf(paragraphs: readonly Paragraph[]): RichTextValue {
  const runs = (rs: readonly Run[]): RichTextRun[] =>
    rs.map((r) =>
      "var" in r
        ? { var: r.var }
        : { text: r.text, ...(r.bold ? { bold: true as const } : {}), ...(r.italic ? { italic: true as const } : {}), ...(r.href ? { href: r.href } : {}) },
    );
  return paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) }));
}
