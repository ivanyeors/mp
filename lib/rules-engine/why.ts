import type { RecommendationRecord } from "./recommendation-record";
import type { TraceStep } from "./types";

const INPUT_LABELS: Record<string, string> = {
  shoulder_length_cm: "Shoulder",
  neck_to_back_cm: "Neck-to-back",
  head_to_back_cm: "Head-to-back",
  neck_length_cm: "Neck length",
  height_cm: "Height",
  sleep_position: "Sleep position",
  bed_firmness: "Bed firmness",
};

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function bandBits(trace: TraceStep[]): string[] {
  const bits: string[] = [];
  const inputs = trace.filter((s) => s.type === "input" && s.detail);
  let inputIdx = 0;
  for (const step of trace) {
    if (!step.detail?.startsWith("band:")) continue;
    const band = step.detail.slice("band:".length);
    const inputKey = inputs[inputIdx]?.detail;
    if (inputIdx < inputs.length) inputIdx += 1;
    const label = inputKey
      ? INPUT_LABELS[inputKey] ?? humanize(inputKey)
      : "Measurement";
    if (/^(XS|S|M|L|XL|short|medium|long)$/i.test(band)) {
      bits.push(`${label} band ${band}`);
    } else {
      bits.push(`${label} ${band}`);
    }
  }
  return bits;
}

function matchBits(trace: TraceStep[]): string[] {
  const bits: string[] = [];
  for (const step of trace) {
    if (step.type !== "match" || !step.detail?.startsWith("match:")) continue;
    const raw = step.detail.slice("match:".length);
    if (raw === "true" || raw === "false") continue;
    bits.push(humanize(raw));
  }
  return bits;
}

export function plainLanguageWhy(
  record: Pick<
    RecommendationRecord,
    "size" | "trace" | "usedFallback" | "usedLegacyBootstrap"
  >,
  answers?: { sleep_position?: unknown },
): string {
  if (!record.size) return "We need a complete set of answers to recommend a size.";

  const sizeWord = /^(short|medium|long)$/i.test(String(record.size))
    ? "Length"
    : "Size";

  if (record.usedLegacyBootstrap) {
    return `Based on your measurements → ${sizeWord} ${record.size}`;
  }

  const parts = [...bandBits(record.trace), ...matchBits(record.trace)];
  const sleep =
    answers?.sleep_position != null && String(answers.sleep_position).trim() !== ""
      ? humanize(String(answers.sleep_position))
      : null;
  if (sleep && !parts.some((p) => p.toLowerCase().includes(sleep.toLowerCase()))) {
    parts.push(`${sleep} sleeping`);
  }

  if (record.usedFallback && parts.length === 0) {
    return `Default path → ${sizeWord} ${record.size}`;
  }

  if (parts.length === 0) {
    return `Your measurements → ${sizeWord} ${record.size}`;
  }

  return `${parts.join(" + ")} → ${sizeWord} ${record.size}`;
}

export type MixLine = { label: string; qty: number };

export function formatMixSummary(
  templateName: string | null | undefined,
  lines: MixLine[],
): { templateName: string; lines: MixLine[] } {
  return {
    templateName: templateName?.trim() || "Recommended mix",
    lines,
  };
}
