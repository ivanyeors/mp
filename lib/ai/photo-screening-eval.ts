import type { PhotoScreeningAnswer, SizingPhotoView } from "./photo-screening";

/**
 * The Sizing photo screening eval (ADR 0047), run by `scripts/eval-photo-screening.ts`.
 * Pure: what each folder of test photos truly shows, how one answer is graded,
 * and what a run adds up to. The photos are people's bodies, so they are never
 * in git: a photo's folder is its label, and the folders live outside the repo.
 *
 * Every photo is asked about once per run, and the one answer is read for both
 * uploads (the request is the same for both; Claude isn't told which it is).
 * A side photo offered as the front upload is a mistake customers make, so a
 * photo that one upload must keep is a photo the other must turn down.
 */

export const SIZING_VIEWS = ["front", "side"] as const satisfies readonly SizingPhotoView[];

export interface PhotoFolder {
  /**
   * What Claude should answer about every photo in the folder. A field left out
   * has no single right answer there (is a too-dark photo of a person a "real
   * person"?) and isn't graded; the decision is the same whatever it says.
   */
  truth: Partial<PhotoScreeningAnswer>;
  /** Which upload must keep the photo. Written from ADR 0047, not read from the code, so the eval checks the code. */
  keep: Record<SizingPhotoView, boolean>;
  /** How many photos the shot list asks for. */
  count: number;
  /** The shot list: what to photograph. */
  shoot: string;
}

const PERSON = { real_person: true, explicit: false } as const;
const FRONT_UPLOAD = { front: true, side: false } as const;
const SIDE_UPLOAD = { front: false, side: true } as const;
const NEITHER = { front: false, side: false } as const;

/** The folders a photo can be in, in shot-list order. */
export const PHOTO_FOLDERS = {
  front: {
    truth: { ...PERSON, view: "front", head_and_shoulders: true },
    keep: FRONT_UPLOAD,
    count: 6,
    shoot: "Facing the camera, head and both shoulders in the picture.",
  },
  back: {
    truth: { ...PERSON, view: "back", head_and_shoulders: true },
    keep: FRONT_UPLOAD,
    count: 6,
    shoot: "Back to the camera, head and both shoulders in the picture. The front upload takes these: the face needn't show.",
  },
  side: {
    truth: { ...PERSON, view: "side", head_and_shoulders: true },
    keep: SIDE_UPLOAD,
    count: 8,
    shoot: "Standing side-on: the side of the head, the neck and the nearer shoulder. Some facing left, some right.",
  },
  "front-cropped": {
    truth: { ...PERSON, view: "front", head_and_shoulders: false },
    keep: NEITHER,
    count: 2,
    shoot: "Facing the camera, but the top of the head or a shoulder is cut off.",
  },
  "back-cropped": {
    truth: { ...PERSON, view: "back", head_and_shoulders: false },
    keep: NEITHER,
    count: 2,
    shoot: "Back to the camera, but the top of the head or a shoulder is cut off.",
  },
  "side-cropped": {
    truth: { ...PERSON, view: "side", head_and_shoulders: false },
    keep: NEITHER,
    count: 3,
    shoot: "Side-on, but the head or the shoulder is cut off.",
  },
  "other-view": {
    truth: { explicit: false, view: "other" },
    keep: NEITHER,
    count: 4,
    shoot: "A person, but nothing to size from: a face close-up, the torso only, or too dark or blurred to make out.",
  },
  "no-person": {
    truth: { real_person: false, explicit: false },
    keep: NEITHER,
    count: 4,
    shoot: "No real person: an empty room, a mannequin, a drawing or poster of a person, a pillow.",
  },
} as const satisfies Record<string, PhotoFolder>;

export type PhotoFolderName = keyof typeof PHOTO_FOLDERS;

export function isPhotoFolderName(name: string): name is PhotoFolderName {
  return Object.hasOwn(PHOTO_FOLDERS, name);
}

/** Pure — the folder's truth with its ungraded fields filled in so the answer leads to the folder's decision: what a perfect screener says. */
export function oracleAnswer(folder: PhotoFolderName): PhotoScreeningAnswer {
  return { real_person: true, view: "other", head_and_shoulders: false, ...PHOTO_FOLDERS[folder].truth };
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|heic|heif|avif|tiff?)$/i;

export interface PhotoCase {
  /** Safe as a file name. */
  id: string;
  /** Relative to the photos folder, with forward slashes. */
  path: string;
  folder: PhotoFolderName;
  /** The folder, then any subfolders under it (`front/mirror-selfie/…` → front, mirror-selfie). */
  tags: string[];
}

/**
 * Pure — the case a file under the photos folder is: null when it isn't a
 * photo (a README, `.DS_Store`), `skipped` when it's a photo in no folder the
 * eval knows, so it can't be graded.
 */
export function photoCase(relPath: string): PhotoCase | { skipped: string } | null {
  const path = relPath.replace(/\\/g, "/").replace(/^\.?\/+/, "");
  const parts = path.split("/").filter(Boolean);
  const name = parts.at(-1) ?? "";
  if (name.startsWith(".") || !IMAGE_FILE.test(name)) return null;
  if (parts.length < 2) return { skipped: `${path}: not in a folder, so there's nothing to say what it shows` };
  const folder = parts[0].toLowerCase();
  if (!isPhotoFolderName(folder)) return { skipped: `${path}: "${parts[0]}" isn't one of the folders (${Object.keys(PHOTO_FOLDERS).join(", ")})` };
  const tags = [folder, ...parts.slice(1, -1).map((t) => t.toLowerCase())];
  const id = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { id, path, folder, tags };
}

export const ANSWER_FIELDS = ["real_person", "view", "head_and_shoulders", "explicit"] as const;
export type AnswerField = (typeof ANSWER_FIELDS)[number];

/** Pure — the graded fields Claude answered wrongly. */
export function wrongFields(folder: PhotoFolderName, answer: PhotoScreeningAnswer): AnswerField[] {
  const truth: Partial<PhotoScreeningAnswer> = PHOTO_FOLDERS[folder].truth;
  return ANSWER_FIELDS.filter((f) => truth[f] !== undefined && answer[f] !== truth[f]);
}

export type Kept = Record<SizingPhotoView, boolean>;

/** One run's grade, as the report's metrics (1 = right). */
export interface PhotoRunGrade {
  /** Both uploads decided right. */
  correct: number;
  front_ok: number;
  side_ok: number;
  /** Claude answered, and every graded field was right. */
  fields_ok: number;
}

/** Pure — one run graded: `kept` is what production's own decision made of the answer, per upload. */
export function gradeRun(folder: PhotoFolderName, answer: PhotoScreeningAnswer | null, kept: Kept): PhotoRunGrade {
  const keep = PHOTO_FOLDERS[folder].keep;
  const front_ok = kept.front === keep.front ? 1 : 0;
  const side_ok = kept.side === keep.side ? 1 : 0;
  return {
    correct: front_ok && side_ok,
    front_ok,
    side_ok,
    fields_ok: answer && wrongFields(folder, answer).length === 0 ? 1 : 0,
  };
}

export interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/**
 * US$ per million tokens, from Anthropic's pricing (2026-11-03), for the
 * models the eval compares. Eval-only: `lib/ai/models.ts` is the AI writing
 * list, and Haiku isn't on it.
 */
export const EVAL_PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-opus-5-5": { in: 4, out: 20 },
};

/** Pure — what one call cost, or null for a model with no price here. Cache writes cost 1.25× input, reads 0.1×. */
export function callCostUsd(model: string, usage: ApiUsage): number | null {
  const price = EVAL_PRICES_PER_MTOK[model];
  if (!price) return null;
  const input =
    usage.input_tokens + 1.25 * (usage.cache_creation_input_tokens ?? 0) + 0.1 * (usage.cache_read_input_tokens ?? 0);
  return (input * price.in + usage.output_tokens * price.out) / 1_000_000;
}

/** A count out of a total, with its 95% Wilson interval: where the true rate likely is, given how few there are. */
export interface Rate {
  k: number;
  n: number;
  lo: number;
  hi: number;
}

/** Pure — `k` of `n` with its 95% Wilson interval (0–0 when there are none). */
export function rate(k: number, n: number): Rate {
  if (n === 0) return { k, n, lo: 0, hi: 0 };
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { k, n, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** One run of one photo, as the runner records it. */
export interface PhotoRun {
  id: string;
  path: string;
  folder: PhotoFolderName;
  tags: string[];
  rep: number;
  /** Claude's four answers; null when it refused, ran out of room or answered something unreadable. */
  answer: PhotoScreeningAnswer | null;
  stopReason: string | null;
  /** What production's decision made of the answer, per upload. */
  kept: Kept;
  /** What the customer is told, for each upload that turned the photo down. */
  reasons: Partial<Record<SizingPhotoView, string>>;
  model: string;
  usage: ApiUsage;
  /** The call that answered, without retries or waiting for a turn. */
  latencyS: number;
  attempts: number;
}

/** A photo one upload decided wrongly in at least one run. */
export interface PhotoMistake {
  path: string;
  slot: SizingPhotoView;
  /** Whether that upload should have kept it. */
  shouldKeep: boolean;
  wrongRuns: number;
  runs: number;
  /** Claude's distinct answers in the wrong runs. */
  said: string[];
  /** What the customer was told, when the photo was turned down. */
  told?: string;
}

export interface PhotoEvalSummary {
  photos: number;
  runs: number;
  /** Uploads that should have kept the photo and turned it down: a customer asked to retake a good photo. */
  wrongRejections: Rate;
  /** Uploads that should have turned the photo down and kept it: a useless photo reaches the build team. */
  wrongPasses: Rate;
  bySlot: Record<SizingPhotoView, { wrongRejections: Rate; wrongPasses: Rate }>;
  byFolder: { folder: PhotoFolderName; photos: number; keptAs: Record<SizingPhotoView, Rate> }[];
  /** Subfolder tags (mirror-selfie, sports-top, …): runs where both uploads decided right. */
  byTag: { tag: string; photos: number; correct: Rate }[];
  /** Wrong answers per field, over runs Claude answered and that field is graded. */
  fields: Record<AnswerField, Rate & { paths: string[] }>;
  /** Runs with no answer, which production treats as a rejection. */
  noAnswer: { refused: number; truncated: number; unreadable: number; of: number };
  /** Photos whose decision for an upload changed from one run to another, of photos run more than once. */
  changed: Rate & { paths: string[] };
  cost: { totalUsd: number | null; perRunUsd: number | null; meanInputTokens: number; meanOutputTokens: number };
  latency: { p50: number; p90: number; max: number; over20s: number };
  mistakes: PhotoMistake[];
}

/** Production's per-call timeout on the upload (`screenSizingPhoto`): slower than this, the photo is kept unchecked. */
export const PRODUCTION_TIMEOUT_S = 20;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/** Pure — Claude's answer in a few words. */
export function describeAnswer(answer: PhotoScreeningAnswer | null, stopReason: string | null): string {
  if (!answer) {
    if (stopReason === "refusal") return "refused to answer";
    if (stopReason === "max_tokens") return "ran out of room before answering";
    return "an answer that couldn't be read";
  }
  const yn = (b: boolean) => (b ? "yes" : "no");
  return `person ${yn(answer.real_person)}, view ${answer.view}, head and shoulders ${yn(answer.head_and_shoulders)}, explicit ${yn(answer.explicit)}`;
}

/** Pure — what a set of runs adds up to. Runs with no answer count as rejections, as they are in production. */
export function summarize(runs: readonly PhotoRun[]): PhotoEvalSummary {
  const byPhoto = new Map<string, PhotoRun[]>();
  for (const r of runs) byPhoto.set(r.id, [...(byPhoto.get(r.id) ?? []), r]);

  const counts = (filter: (r: PhotoRun, slot: SizingPhotoView) => boolean, slots: readonly SizingPhotoView[] = SIZING_VIEWS) => {
    let k = 0;
    let n = 0;
    for (const r of runs)
      for (const slot of slots) {
        const keep = PHOTO_FOLDERS[r.folder].keep[slot];
        if (!filter(r, slot)) continue;
        n++;
        if (r.kept[slot] !== keep) k++;
      }
    return rate(k, n);
  };
  const shouldKeep = (r: PhotoRun, slot: SizingPhotoView) => PHOTO_FOLDERS[r.folder].keep[slot];
  const shouldReject = (r: PhotoRun, slot: SizingPhotoView) => !PHOTO_FOLDERS[r.folder].keep[slot];

  const bySlot = Object.fromEntries(
    SIZING_VIEWS.map((slot) => [slot, { wrongRejections: counts(shouldKeep, [slot]), wrongPasses: counts(shouldReject, [slot]) }]),
  ) as PhotoEvalSummary["bySlot"];

  const byFolder = (Object.keys(PHOTO_FOLDERS) as PhotoFolderName[])
    .map((folder) => {
      const rs = runs.filter((r) => r.folder === folder);
      const keptAs = Object.fromEntries(SIZING_VIEWS.map((slot) => [slot, rate(rs.filter((r) => r.kept[slot]).length, rs.length)])) as Record<
        SizingPhotoView,
        Rate
      >;
      return { folder, photos: new Set(rs.map((r) => r.id)).size, keptAs };
    })
    .filter((f) => f.photos > 0);

  const tagNames = [...new Set(runs.flatMap((r) => r.tags.slice(1)))].sort();
  const byTag = tagNames.map((tag) => {
    const rs = runs.filter((r) => r.tags.slice(1).includes(tag));
    const right = rs.filter((r) => SIZING_VIEWS.every((slot) => r.kept[slot] === PHOTO_FOLDERS[r.folder].keep[slot])).length;
    return { tag, photos: new Set(rs.map((r) => r.id)).size, correct: rate(right, rs.length) };
  });

  const fields = Object.fromEntries(
    ANSWER_FIELDS.map((field) => {
      const graded = runs.filter((r) => r.answer && (PHOTO_FOLDERS[r.folder].truth as Partial<PhotoScreeningAnswer>)[field] !== undefined);
      const wrong = graded.filter((r) => wrongFields(r.folder, r.answer!).includes(field));
      return [field, { ...rate(wrong.length, graded.length), paths: [...new Set(wrong.map((r) => r.path))] }];
    }),
  ) as PhotoEvalSummary["fields"];

  const unanswered = runs.filter((r) => !r.answer);
  const noAnswer = {
    refused: unanswered.filter((r) => r.stopReason === "refusal").length,
    truncated: unanswered.filter((r) => r.stopReason === "max_tokens").length,
    unreadable: unanswered.filter((r) => r.stopReason !== "refusal" && r.stopReason !== "max_tokens").length,
    of: runs.length,
  };

  const repeated = [...byPhoto.values()].filter((rs) => rs.length > 1);
  const changedPaths = repeated
    .filter((rs) => SIZING_VIEWS.some((slot) => new Set(rs.map((r) => r.kept[slot])).size > 1))
    .map((rs) => rs[0].path);

  const costs = runs.map((r) => callCostUsd(r.model, r.usage));
  const totalUsd = costs.some((c) => c === null) ? null : costs.reduce<number>((s, c) => s + (c ?? 0), 0);
  const latencies = runs.map((r) => r.latencyS).sort((a, b) => a - b);

  const mistakes: PhotoMistake[] = [];
  for (const rs of byPhoto.values()) {
    for (const slot of SIZING_VIEWS) {
      const keep = PHOTO_FOLDERS[rs[0].folder].keep[slot];
      const wrong = rs.filter((r) => r.kept[slot] !== keep);
      if (!wrong.length) continue;
      mistakes.push({
        path: rs[0].path,
        slot,
        shouldKeep: keep,
        wrongRuns: wrong.length,
        runs: rs.length,
        said: [...new Set(wrong.map((r) => describeAnswer(r.answer, r.stopReason)))],
        told: wrong.find((r) => r.reasons[slot])?.reasons[slot],
      });
    }
  }
  mistakes.sort((a, b) => Number(b.shouldKeep) - Number(a.shouldKeep) || b.wrongRuns / b.runs - a.wrongRuns / a.runs || a.path.localeCompare(b.path));

  return {
    photos: byPhoto.size,
    runs: runs.length,
    wrongRejections: counts(shouldKeep),
    wrongPasses: counts(shouldReject),
    bySlot,
    byFolder,
    byTag,
    fields,
    noAnswer,
    changed: { ...rate(changedPaths.length, repeated.length), paths: changedPaths },
    cost: {
      totalUsd,
      perRunUsd: totalUsd === null || !runs.length ? null : totalUsd / runs.length,
      meanInputTokens: runs.length ? runs.reduce((s, r) => s + r.usage.input_tokens, 0) / runs.length : 0,
      meanOutputTokens: runs.length ? runs.reduce((s, r) => s + r.usage.output_tokens, 0) / runs.length : 0,
    },
    latency: {
      p50: percentile(latencies, 0.5),
      p90: percentile(latencies, 0.9),
      max: latencies.at(-1) ?? 0,
      over20s: latencies.filter((s) => s > PRODUCTION_TIMEOUT_S).length,
    },
    mistakes,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Pure — "3 of 60 (5%, likely 2–14%)". */
export function formatRate(r: Rate): string {
  if (!r.n) return "none to count";
  return `${r.k} of ${r.n} (${pct(r.k / r.n)}, likely ${pct(r.lo)}–${pct(r.hi)})`;
}

const usd = (x: number | null, digits = 4) => (x === null ? "no price for this model" : `US$${x.toFixed(digits)}`);

export interface PhotoEvalConfig {
  variant: string;
  model: string;
  effort: string;
  reps: number;
}

/** Pure — one variant's summary as Markdown, for `<variant>/summary.md` and the terminal. */
export function formatSummary(s: PhotoEvalSummary, config: PhotoEvalConfig): string {
  const lines: string[] = [];
  lines.push(`# Sizing photo screening: ${config.variant}`);
  lines.push("");
  lines.push(`${config.model} at ${config.effort} effort. ${s.photos} photos, ${s.runs} runs (${config.reps} a photo), each read for both uploads.`);
  lines.push("");
  lines.push(`- **Good photos turned down:** ${formatRate(s.wrongRejections)}`);
  lines.push(`  - front upload ${formatRate(s.bySlot.front.wrongRejections)}; side upload ${formatRate(s.bySlot.side.wrongRejections)}`);
  lines.push(`- **Bad photos kept:** ${formatRate(s.wrongPasses)}`);
  lines.push(`  - front upload ${formatRate(s.bySlot.front.wrongPasses)}; side upload ${formatRate(s.bySlot.side.wrongPasses)}`);
  lines.push(`- **Decision changed between runs:** ${formatRate(s.changed)}${s.changed.paths.length ? `: ${s.changed.paths.join(", ")}` : ""}`);
  const na = s.noAnswer;
  lines.push(
    `- **No answer** (a rejection in production): ${na.refused + na.truncated + na.unreadable} of ${na.of} runs` +
      (na.refused + na.truncated + na.unreadable ? ` (refused ${na.refused}, ran out of room ${na.truncated}, unreadable ${na.unreadable})` : ""),
  );
  lines.push(
    `- **Cost:** ${usd(s.cost.perRunUsd, 5)} a photo (${Math.round(s.cost.meanInputTokens)} tokens in, ${Math.round(s.cost.meanOutputTokens)} out); ${usd(s.cost.totalUsd)} this run`,
  );
  lines.push(
    `- **Time:** ${s.latency.p50.toFixed(1)} s typical, ${s.latency.p90.toFixed(1)} s for the slowest tenth, ${s.latency.max.toFixed(1)} s at most; ${s.latency.over20s} over the upload's ${PRODUCTION_TIMEOUT_S} s limit`,
  );
  // Good photo-uploads per round of runs: repeating a photo measures whether
  // Claude is consistent, not how it does on photos it hasn't seen.
  if (s.wrongRejections.n && s.wrongRejections.n / config.reps < 30) {
    lines.push("");
    lines.push(
      `_"Likely" is the 95% range. With few good photos the range is wide: add photos before reading a small difference between two variants._`,
    );
  }

  lines.push("");
  lines.push("## By folder");
  lines.push("");
  lines.push("| Folder | Photos | Kept as front | Kept as side |");
  lines.push("|---|---|---|---|");
  for (const f of s.byFolder) {
    const keep = PHOTO_FOLDERS[f.folder].keep;
    const cell = (slot: SizingPhotoView) => `${keep[slot] ? "should: " : "shouldn't: "}${f.keptAs[slot].k}/${f.keptAs[slot].n}`;
    lines.push(`| ${f.folder} | ${f.photos} | ${cell("front")} | ${cell("side")} |`);
  }

  if (s.byTag.length) {
    lines.push("");
    lines.push("## By subfolder");
    lines.push("");
    lines.push("| Subfolder | Photos | Both uploads right |");
    lines.push("|---|---|---|");
    for (const t of s.byTag) lines.push(`| ${t.tag} | ${t.photos} | ${t.correct.k}/${t.correct.n} |`);
  }

  lines.push("");
  lines.push("## Claude's answers, field by field");
  lines.push("");
  for (const field of ANSWER_FIELDS) {
    const f = s.fields[field];
    lines.push(`- ${field}: wrong in ${f.k} of ${f.n}${f.paths.length ? ` (${f.paths.join(", ")})` : ""}`);
  }

  lines.push("");
  lines.push("## Photos decided wrongly");
  lines.push("");
  if (!s.mistakes.length) lines.push("None.");
  for (const m of s.mistakes) {
    const what = m.shouldKeep ? "turned down" : "kept";
    lines.push(`- \`${m.path}\` as the **${m.slot}** upload: ${what} in ${m.wrongRuns} of ${m.runs} runs. Claude said: ${m.said.join("; ")}.`);
    if (m.told) lines.push(`  The customer read: "${m.told}"`);
  }
  return lines.join("\n") + "\n";
}

/** Pure — every variant's headline side by side, for `--report`. */
export function formatComparison(cols: { config: PhotoEvalConfig; summary: PhotoEvalSummary }[]): string {
  const rows: [string, (c: (typeof cols)[number]) => string][] = [
    ["Model", (c) => c.config.model],
    ["Effort", (c) => c.config.effort],
    ["Photos × runs", (c) => `${c.summary.photos} × ${c.config.reps}`],
    ["Good photos turned down", (c) => formatRate(c.summary.wrongRejections)],
    ["Bad photos kept", (c) => formatRate(c.summary.wrongPasses)],
    ["Decision changed between runs", (c) => `${c.summary.changed.k} of ${c.summary.changed.n} photos`],
    ["No answer", (c) => `${c.summary.noAnswer.refused + c.summary.noAnswer.truncated + c.summary.noAnswer.unreadable} of ${c.summary.noAnswer.of}`],
    ["Cost a photo", (c) => usd(c.summary.cost.perRunUsd, 5)],
    ["Seconds (typical / slowest)", (c) => `${c.summary.latency.p50.toFixed(1)} / ${c.summary.latency.max.toFixed(1)}`],
    [`Over ${PRODUCTION_TIMEOUT_S} s`, (c) => String(c.summary.latency.over20s)],
  ];
  const lines = [`| | ${cols.map((c) => c.config.variant).join(" | ")} |`, `|---|${cols.map(() => "---").join("|")}|`];
  for (const [label, cell] of rows) lines.push(`| ${label} | ${cols.map(cell).join(" | ")} |`);
  return lines.join("\n") + "\n";
}
