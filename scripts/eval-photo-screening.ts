/**
 * The Sizing photo screening eval (ADR 0047), run by hand with a real key.
 * Claude Haiku decides whether a customer's front and side Sizing photos are
 * kept; this measures how often it gets that wrong, on photos whose answer we
 * know. Each photo sits in a folder named for what it really shows (`front/`,
 * `back/`, `side/`, `side-cropped/`, `no-person/` …; the shot list is in
 * `lib/ai/photo-screening-eval.ts`), and the folder is its label.
 *
 * Every photo is sent the way production sends it: through the server's own
 * WebP conversion (`sizingPhotoAsWebp`), with production's own request
 * (`photoScreeningParams`). Claude isn't told which upload a photo is for, so
 * its one answer is read for both by production's own decision
 * (`screeningFromResponse`): a good side photo must be kept as the side upload
 * and turned down as the front one. Each photo runs 3 times by default, to
 * catch answers that change from one run to the next.
 *
 * The report leads with good photos turned down (a customer asked to retake)
 * and bad photos kept (a useless photo for the build team), each with its 95%
 * range, then every photo decided wrongly and what the customer was told.
 *
 *   pnpm ai:eval-photos -- --init                # make the photo folders and their shot list
 *   pnpm ai:eval-photos -- --dry-run             # check every photo is readable and in a folder; no calls
 *   pnpm ai:eval-photos                          # baseline: production's model and effort, 3 runs a photo
 *   pnpm ai:eval-photos -- --variant=v1 --effort=medium
 *   pnpm ai:eval-photos -- --variant=v2 --model=claude-sonnet-5-5
 *   pnpm ai:eval-photos -- --report              # every variant so far, side by side; no calls
 *   pnpm ai:eval-photos -- --fake=oracle         # check the harness itself on the photos; no calls
 *
 * Options: --dir=.scratch/photo-eval (photos in <dir>/photos), --reps=3,
 * --concurrency=4, --only=<text in the photo's path>.
 *
 * Photos of people never go in git: the default folder is under `.scratch/`,
 * which git ignores, and `--dir` can point anywhere private. A run writes
 * `<dir>/<variant>/` in the layout the claude-api skill's eval report reads
 * (`results.jsonl`, `errors.jsonl`, `traces/`), plus `summary.md`. A stopped
 * run picks up where it left off. `baseline` is always production's request;
 * a changed prompt or setting is a new variant (`v1`, `v2` …), so a variant's
 * runs always come from one request.
 *
 * Needs ANTHROPIC_API_KEY in .env.local (the key saved on General is read
 * inside the app only). On Haiku it should cost well under a cent a photo,
 * about US$0.05 for 35 photos × 3 runs; an estimate from a photo's size in
 * tokens until a run reports what it actually cost.
 *
 * The one difference from production: the phone turns a photo into a JPEG
 * before uploading it (`lib/images/shrink-photo.ts`, browser-only). Here the
 * photo goes straight to the server's WebP conversion, which reads JPEG and
 * PNG the same way and turns it upright as the phone does. An iPhone's HEIC
 * photos have to be exported as JPEG first.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { claudeCallError, claudeClient } from "@/lib/ai/claude";
import { AI_EFFORTS, type AiEffort } from "@/lib/ai/models";
import {
  photoScreeningParams,
  screeningAnswerOf,
  screeningFromResponse,
  type ScreenableImage,
} from "@/lib/ai/photo-screening";
import {
  PHOTO_FOLDERS,
  SIZING_VIEWS,
  formatComparison,
  formatSummary,
  gradeRun,
  oracleAnswer,
  photoCase,
  summarize,
  type PhotoCase,
  type PhotoEvalConfig,
  type PhotoFolderName,
  type PhotoRun,
} from "@/lib/ai/photo-screening-eval";
import { sizingPhotoAsWebp } from "@/lib/results/sizing-photo-webp";

const FAKES = ["oracle", "reject-all", "always-front", "refuse", "error"] as const;
type Fake = (typeof FAKES)[number];

const KNOWN = ["init", "dry-run", "report", "fake", "dir", "variant", "model", "effort", "reps", "concurrency", "only"];
const args = process.argv.slice(2).filter((a) => a !== "--");
for (const a of args) {
  const name = /^--([a-z-]+)/.exec(a)?.[1];
  if (!name || !KNOWN.includes(name)) {
    console.error(`Unknown option ${a}. Options: ${KNOWN.map((k) => `--${k}`).join(" ")}`);
    process.exit(2);
  }
}
const opt = (name: string): string | undefined => {
  const a = args.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? undefined : a.includes("=") ? a.slice(a.indexOf("=") + 1) : "";
};
const intOpt = (name: string, fallback: number) => {
  const v = opt(name);
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} takes a whole number of 1 or more.`);
    process.exit(2);
  }
  return n;
};

const dirArg = opt("dir") || ".scratch/photo-eval";
const DIR = resolve(dirArg.startsWith("~") ? join(homedir(), dirArg.slice(1)) : dirArg);
const PHOTOS = join(DIR, "photos");
const fake = opt("fake") as Fake | undefined;
if (fake !== undefined && !FAKES.includes(fake)) {
  console.error(`--fake takes one of: ${FAKES.join(", ")}`);
  process.exit(2);
}

/** Production's request, its photo left out: what `baseline` must be, and what a variant's resume must still match. */
const PRODUCTION = photoScreeningParams({ mediaType: "image/webp", base64: "" });
const PRODUCTION_EFFORT = PRODUCTION.output_config?.effort ?? "medium";
const REQUEST_SHA = createHash("sha256")
  .update(JSON.stringify({ ...PRODUCTION, model: undefined, output_config: { ...PRODUCTION.output_config, effort: undefined } }))
  .digest("hex")
  .slice(0, 16);

interface VariantConfig extends PhotoEvalConfig {
  /** The request's prompt, schema and limits: a variant's runs all come from one request. */
  request_sha: string;
  started_at: string;
}

// ── The photos ────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

function loadCases(): PhotoCase[] {
  if (!existsSync(PHOTOS)) {
    console.error(`No photos at ${PHOTOS}. Run with --init to make the folders and their shot list.`);
    process.exit(1);
  }
  const cases: PhotoCase[] = [];
  const skipped: string[] = [];
  const ids = new Map<string, string>();
  for (const file of walk(PHOTOS)) {
    const c = photoCase(relative(PHOTOS, file));
    if (!c) continue;
    if ("skipped" in c) {
      skipped.push(c.skipped);
      continue;
    }
    const clash = ids.get(c.id);
    if (clash) {
      console.error(`${c.path} and ${clash} have names too alike to tell apart in the results. Rename one.`);
      process.exit(1);
    }
    ids.set(c.id, c.path);
    cases.push(c);
  }
  for (const s of skipped) console.warn(`Skipped ${s}`);
  const only = opt("only");
  return cases.filter((c) => !only || c.path.toLowerCase().includes(only.toLowerCase())).sort((a, b) => a.path.localeCompare(b.path));
}

/** Each photo as the server keeps it: WebP, upright, at most 2,000 px. Null when sharp can't read it. */
async function prepare(cases: PhotoCase[]): Promise<{ ready: { c: PhotoCase; image: ScreenableImage }[]; unreadable: string[] }> {
  const ready: { c: PhotoCase; image: ScreenableImage }[] = [];
  const unreadable: string[] = [];
  for (const c of cases) {
    // The type is only a label here: sharp reads whatever the bytes are.
    const stored = await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64: readFileSync(join(PHOTOS, c.path)).toString("base64") });
    if (stored) ready.push({ c, image: stored.image });
    else unreadable.push(/\.hei[cf]$/i.test(c.path) ? `${c.path}: HEIC; export it as JPEG` : `${c.path}: not a photo this can read`);
  }
  return { ready, unreadable };
}

function shotList(): string {
  const rows = (Object.keys(PHOTO_FOLDERS) as PhotoFolderName[]).map((f) => {
    const { keep, count, shoot } = PHOTO_FOLDERS[f];
    const keptBy = keep.front ? "the front upload" : keep.side ? "the side upload" : "neither";
    return `| \`${f}/\` | ${count} | ${shoot} | ${keptBy} |`;
  });
  return `# Sizing photo screening eval: the photos

Put each photo in the folder for what it really shows. The folder is its label:
the eval offers every photo as both the front upload and the side upload, and
checks what Claude decides against it. A photo from behind belongs in \`back/\`;
the front upload keeps it, since the face needn't show.

| Folder | How many | What to photograph | Kept by |
|---|---|---|---|
${rows.join("\n")}

Mix in what customers really send: mirror selfies, a friend holding the phone,
messy rooms, glasses, long hair, a hoodie, dim light, and the clothing that's
allowed (a sports top, swimwear, a man's bare chest), which must never be
flagged as explicit. A subfolder becomes a tag in the report, so you can see how
each kind does: \`front/mirror-selfie/\`, \`side/sports-top/\`, \`back/long-hair/\`.

- Only photograph people who have agreed, and keep this folder private. It is
  never committed: the default place for it, \`.scratch/\`, is ignored by git.
- JPEG or PNG. Export an iPhone's HEIC photos as JPEG first (or set Settings →
  Camera → Formats → Most Compatible before taking them).
- No explicit photos. Claude refuses them, and a refusal is already a rejection.
- A pose with no clear answer (a three-quarter turn) tells us nothing: leave it out.

Then run \`pnpm ai:eval-photos -- --dry-run\` to check them, and \`pnpm ai:eval-photos\`.
`;
}

const STATE = {
  flow: "photo-screening",
  metrics: [
    { id: "correct", label: "Both uploads", kind: "binary" },
    { id: "front_ok", label: "Front upload", kind: "binary" },
    { id: "side_ok", label: "Side upload", kind: "binary" },
    { id: "fields_ok", label: "All 4 answers", kind: "binary" },
  ],
  perf_fields: [
    { id: "latency_s", label: "Seconds", unit: "s" },
    { id: "attempts", label: "Attempts" },
  ],
};

function init() {
  for (const f of Object.keys(PHOTO_FOLDERS)) mkdirSync(join(PHOTOS, f), { recursive: true });
  const readme = join(PHOTOS, "README.md");
  if (!existsSync(readme)) writeFileSync(readme, shotList(), "utf8");
  if (!existsSync(join(DIR, "_state.json"))) writeFileSync(join(DIR, "_state.json"), JSON.stringify(STATE, null, 2) + "\n", "utf8");
  console.log(`Folders ready in ${PHOTOS}. The shot list is in ${readme}.`);
}

// ── Calling Claude ────────────────────────────────────────────────────────

class CallFailed extends Error {
  constructor(
    readonly failure: "timeout" | "api_error" | "api_error_after_retries" | "model_mismatch",
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

const MAX_ATTEMPTS = 5;
/** Per attempt: a call this slow is a timeout, recorded as one, never scored as a wrong answer. */
const CEILING_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One answer, retrying a busy or unreachable API with growing, jittered waits. The time is the answering call's alone. */
async function ask(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming) {
  for (let attempt = 1; ; attempt++) {
    const started = performance.now();
    try {
      const response = await client.messages.create(params, { timeout: CEILING_MS, maxRetries: 0 });
      return { response, latencyS: (performance.now() - started) / 1000, attempts: attempt };
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new CallFailed("timeout", `no answer within ${CEILING_MS / 1000} s`, attempt);
      const retryable = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw new CallFailed(retryable ? "api_error_after_retries" : "api_error", claudeCallError(e), attempt);
      await sleep(Math.min(30_000, (fake ? 5 : 1_000) * 2 ** (attempt - 1)) * (0.5 + Math.random()));
    }
  }
}

/** A stand-in for Claude that answers from each photo's folder, to check the harness and grading end to end. */
function fakeClient(mode: Fake, caseOf: Map<string, PhotoCase>): Anthropic {
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    await sleep(5);
    if (mode === "error") throw new Anthropic.APIConnectionError({ message: "Fake: the API can't be reached." });
    const content = params.messages[0].content as Anthropic.ContentBlockParam[];
    const image = content.find((b): b is Anthropic.ImageBlockParam => b.type === "image");
    const c = image?.source.type === "base64" ? caseOf.get(image.source.data) : undefined;
    if (!c) throw new Error("Fake: a photo the harness never prepared");
    const answers: Record<Exclude<Fake, "error" | "refuse">, object> = {
      oracle: oracleAnswer(c.folder),
      "reject-all": { ...oracleAnswer(c.folder), real_person: false },
      "always-front": { real_person: true, view: "front", head_and_shoulders: true, explicit: false },
    };
    const answer = mode === "refuse" ? null : answers[mode];
    return {
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: params.model,
      stop_reason: answer ? "end_turn" : "refusal",
      stop_sequence: null,
      content: answer ? [{ type: "text", text: JSON.stringify(answer), citations: null }] : [],
      usage: { input_tokens: 1800, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    } as unknown as Anthropic.Message;
  };
  return { messages: { create } } as unknown as Anthropic;
}

// ── A variant's files ─────────────────────────────────────────────────────

const readJsonl = (file: string): Record<string, unknown>[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as Record<string, unknown>)
    : [];

function loadVariant(vdir: string): { config: VariantConfig; runs: PhotoRun[]; errors: number } | null {
  const configFile = join(vdir, "config.json");
  if (!existsSync(configFile)) return null;
  const config = JSON.parse(readFileSync(configFile, "utf8")) as VariantConfig;
  const runs = readJsonl(join(vdir, "results.jsonl")).map((row) => (row.meta as { run: PhotoRun }).run);
  const done = new Set(runs.map((r) => `${r.id}#${r.rep}`));
  const errors = new Set(
    readJsonl(join(vdir, "errors.jsonl"))
      .map((e) => `${e.prompt_id}#${e.rep}`)
      .filter((k) => !done.has(k)),
  ).size;
  return { config, runs, errors };
}

function report() {
  const variants = existsSync(DIR)
    ? readdirSync(DIR)
        .filter((d) => /^(baseline|v[1-9]\d*)$/.test(d))
        .sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : Number(a.slice(1)) - Number(b.slice(1))))
    : [];
  const cols = variants.flatMap((v) => {
    const loaded = loadVariant(join(DIR, v));
    return loaded?.runs.length ? [{ config: loaded.config, summary: summarize(loaded.runs) }] : [];
  });
  if (!cols.length) {
    console.log(`No runs in ${DIR} yet.`);
    return;
  }
  const md = formatComparison(cols);
  writeFileSync(join(DIR, "comparison.md"), md, "utf8");
  console.log(md);
  console.log(`Each variant's detail: ${DIR}/<variant>/summary.md`);
}

// ── A run ─────────────────────────────────────────────────────────────────

async function main() {
  if (opt("init") !== undefined) return init();
  if (opt("report") !== undefined) return report();

  const cases = loadCases();
  const { ready, unreadable } = await prepare(cases);
  for (const u of unreadable) console.warn(`Can't read ${u}`);
  const reps = intOpt("reps", fake ? 1 : 3);

  if (opt("dry-run") !== undefined) {
    console.log("Folder            Photos  Shot list");
    for (const f of Object.keys(PHOTO_FOLDERS) as PhotoFolderName[]) {
      const n = ready.filter((r) => r.c.folder === f).length;
      console.log(`${f.padEnd(18)}${String(n).padStart(6)}  ${PHOTO_FOLDERS[f].count}${n < PHOTO_FOLDERS[f].count ? "  (fewer than asked)" : ""}`);
    }
    const tags = [...new Set(ready.flatMap((r) => r.c.tags.slice(1)))];
    if (tags.length) console.log(`Subfolder tags: ${tags.join(", ")}`);
    console.log(`\n${ready.length} photos ready, ${unreadable.length} unreadable. A run makes ${ready.length * reps} calls (${reps} a photo).`);
    return;
  }
  if (!ready.length) {
    console.error("No photos to run. See --dry-run.");
    process.exit(1);
  }

  // Which variant, and the request it runs.
  const variant = fake ? `fake-${fake}` : (opt("variant") || "baseline");
  if (!fake && !/^(baseline|v[1-9]\d*)$/.test(variant)) {
    console.error("--variant is baseline, or v1, v2 …: the eval report reads no other names. Say what changed in its summary instead.");
    process.exit(2);
  }
  const model = opt("model") || PRODUCTION.model;
  const effort = (opt("effort") || PRODUCTION_EFFORT) as AiEffort;
  if (!(AI_EFFORTS as readonly string[]).includes(effort)) {
    console.error(`--effort takes one of: ${AI_EFFORTS.join(", ")}`);
    process.exit(2);
  }
  if (variant === "baseline" && (model !== PRODUCTION.model || effort !== PRODUCTION_EFFORT)) {
    console.error(`baseline is production's request (${PRODUCTION.model} at ${PRODUCTION_EFFORT}). Run a change as --variant=v1.`);
    process.exit(2);
  }
  const vdir = fake ? join(DIR, "_harness-check", fake) : join(DIR, variant);
  const before = loadVariant(vdir);
  if (before && (before.config.model !== model || before.config.effort !== effort || before.config.request_sha !== REQUEST_SHA)) {
    const what = before.config.request_sha !== REQUEST_SHA ? "the screening request (prompt, schema or limits) has changed since" : `it was run with ${before.config.model} at ${before.config.effort}`;
    console.error(`${variant} can't take these runs: ${what}. Run them as a new variant, or delete ${vdir} to start it again.`);
    process.exit(2);
  }
  let client: Anthropic;
  if (fake) client = fakeClient(fake, new Map(ready.map((r) => [r.image.base64, r.c])));
  else {
    const real = await claudeClient();
    if (!real) {
      console.error("No Anthropic API key. Put ANTHROPIC_API_KEY in .env.local.");
      process.exit(1);
    }
    client = real;
  }

  const config: VariantConfig = {
    variant,
    model,
    effort,
    reps: Math.max(reps, before?.config.reps ?? 0),
    request_sha: REQUEST_SHA,
    started_at: before?.config.started_at ?? new Date().toISOString(),
  };
  mkdirSync(join(vdir, "traces"), { recursive: true });
  writeFileSync(join(vdir, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
  if (!fake && !existsSync(join(DIR, "_state.json"))) writeFileSync(join(DIR, "_state.json"), JSON.stringify(STATE, null, 2) + "\n", "utf8");

  // Every photo once, then every photo again: a stopped run has covered the set evenly.
  const done = new Set((before?.runs ?? []).map((r) => `${r.id}#${r.rep}`));
  const jobs = Array.from({ length: reps }, (_, rep) => ready.map((r) => ({ ...r, rep }))).flat().filter((j) => !done.has(`${j.c.id}#${j.rep}`));
  console.log(`${variant}: ${model} at ${effort} effort. ${jobs.length} calls to make${done.size ? ` (${done.size} already done)` : ""}.\n`);

  let finished = 0;
  let failed = 0;
  const runOne = async ({ c, image, rep }: (typeof jobs)[number]) => {
    const base = photoScreeningParams(image);
    const params: Anthropic.MessageCreateParamsNonStreaming = { ...base, model, output_config: { ...base.output_config, effort } };
    const ref = { kind: "image", ref: `photos/${c.path}`, alt: c.path };
    try {
      const { response, latencyS, attempts } = await ask(client, params);
      if (response.model !== model && !response.model.startsWith(`${model}-`)) {
        throw new CallFailed("model_mismatch", `asked for ${model}, answered by ${response.model}`, attempts);
      }
      const answer = screeningAnswerOf(response);
      const decided = Object.fromEntries(SIZING_VIEWS.map((slot) => [slot, screeningFromResponse(response, slot)]));
      const kept = { front: decided.front.status === "passed", side: decided.side.status === "passed" };
      const run: PhotoRun = {
        ...c,
        rep,
        answer,
        stopReason: response.stop_reason,
        kept,
        reasons: Object.fromEntries(SIZING_VIEWS.flatMap((s) => (decided[s].status === "rejected" ? [[s, decided[s].reason]] : []))),
        model: response.model,
        usage: response.usage,
        latencyS,
        attempts,
      };
      const truncated = response.stop_reason === "max_tokens";
      const grade = gradeRun(c.folder, answer, kept);
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const userText = (base.messages[0].content as Anthropic.ContentBlockParam[]).flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      writeFileSync(
        join(vdir, "traces", `${c.id}_rep${rep}.json`),
        JSON.stringify(
          [
            { role: "system", content: base.system },
            { role: "user", content: userText, attachments: [ref] },
            { role: "assistant", content: text || `(no answer: ${response.stop_reason})` },
          ],
          null,
          2,
        ),
        "utf8",
      );
      appendFileSync(
        join(vdir, "results.jsonl"),
        JSON.stringify({
          prompt_id: c.id,
          prompt: c.path,
          tags: c.tags,
          rep,
          // A run that ran out of room is counted in summary.md as production counts it (turned down), and left out of the report's means.
          status: truncated ? "truncated" : "ok",
          stop_reason: response.stop_reason,
          model: response.model,
          usage: response.usage,
          latency_s: Number(latencyS.toFixed(3)),
          attempts,
          grade: truncated ? {} : grade,
          attachments: [ref],
          meta: { run },
        }) + "\n",
        "utf8",
      );
      const wrong = SIZING_VIEWS.filter((s) => kept[s] !== PHOTO_FOLDERS[c.folder].keep[s]).map((s) => `${kept[s] ? "kept" : "turned down"} as ${s}`);
      console.log(
        `${String(++finished).padStart(4)}/${jobs.length}  run ${rep + 1}  ${latencyS.toFixed(1).padStart(5)}s  ${wrong.length ? `WRONG: ${wrong.join(", ")}` : "right  "}  ${c.path}`,
      );
    } catch (e) {
      failed++;
      finished++;
      const f = e instanceof CallFailed ? e : null;
      appendFileSync(
        join(vdir, "errors.jsonl"),
        JSON.stringify({
          prompt_id: c.id,
          rep,
          class: f?.failure ?? "harness",
          message: e instanceof Error ? e.message : String(e),
          attempts: f?.attempts ?? 0,
          at: new Date().toISOString(),
        }) + "\n",
        "utf8",
      );
      console.log(`${String(finished).padStart(4)}/${jobs.length}  run ${rep + 1}  NOT RUN (${f?.failure ?? "harness"}: ${e instanceof Error ? e.message : e})  ${c.path}`);
    }
  };

  const concurrency = intOpt("concurrency", 4);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) await runOne(jobs[next++]);
    }),
  );

  const after = loadVariant(vdir)!;
  if (!after.runs.length) {
    console.error(`\nNo answers: every call failed. See ${join(vdir, "errors.jsonl")}.`);
    process.exit(1);
  }
  const md = formatSummary(summarize(after.runs), config);
  writeFileSync(join(vdir, "summary.md"), md, "utf8");
  console.log(`\n${md}`);
  if (after.errors) {
    console.log(
      `${after.errors} runs couldn't be made and aren't counted above (${join(vdir, "errors.jsonl")}). Run the same command again to retry them.`,
    );
  }
  console.log(`Summary: ${join(vdir, "summary.md")}`);
  if (failed) process.exitCode = 1;
}

void main();
