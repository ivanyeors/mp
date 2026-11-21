import type { RichTextRun, RichTextValue, RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { isHttpsUrl, type Paragraph, type Run } from "@/lib/email-campaigns/content";
import { campaignVariable, isVariableKey, POINTS_NOT_LIVE, VARIABLE_KEYS } from "@/lib/email-campaigns/variables";

export function campaignVariables({ pointsLive }: { pointsLive: boolean }): RichTextVariable[] {
  return VARIABLE_KEYS.map((key) => {
    const v = campaignVariable(key);
    return { key, label: v.label, description: v.description, disabledReason: v.needsPoints && !pointsLive ? POINTS_NOT_LIVE : null };
  });
}

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

function push(out: Run[], r: Extract<Run, { text: string }>) {
  const last = out.at(-1);
  if (last && "text" in last && last.bold === r.bold && last.italic === r.italic && last.href === r.href) last.text += r.text;
  else out.push(r);
}

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

export function richTextOf(paragraphs: readonly Paragraph[]): RichTextValue {
  const runs = (rs: readonly Run[]): RichTextRun[] =>
    rs.map((r) =>
      "var" in r
        ? { var: r.var }
        : { text: r.text, ...(r.bold ? { bold: true as const } : {}), ...(r.italic ? { italic: true as const } : {}), ...(r.href ? { href: r.href } : {}) },
    );
  return paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) }));
}
