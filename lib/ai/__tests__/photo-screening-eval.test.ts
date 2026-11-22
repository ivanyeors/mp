import { describe, expect, it } from "vitest";
import { photoScreeningVerdict, screeningFromResponse, type PhotoScreeningAnswer } from "@/lib/ai/photo-screening";
import {
  PHOTO_FOLDERS,
  SIZING_VIEWS,
  callCostUsd,
  formatComparison,
  formatSummary,
  gradeRun,
  oracleAnswer,
  photoCase,
  rate,
  summarize,
  wrongFields,
  type PhotoCase,
  type PhotoFolderName,
  type PhotoRun,
} from "@/lib/ai/photo-screening-eval";

/** The Sizing photo screening eval (ADR 0047): the labels, the grading and the summary. */

const FOLDERS = Object.keys(PHOTO_FOLDERS) as PhotoFolderName[];

/** One run, decided by production's own verdict, as the runner records it. */
function run(path: string, answer: PhotoScreeningAnswer | null, extra: Partial<PhotoRun> = {}): PhotoRun {
  const c = photoCase(path) as PhotoCase;
  const decided = Object.fromEntries(
    SIZING_VIEWS.map((slot) => [slot, answer ? photoScreeningVerdict(answer, slot) : { ok: false as const, reason: "We can't use this photo." }]),
  );
  return {
    ...c,
    rep: 0,
    answer,
    stopReason: answer ? "end_turn" : "refusal",
    kept: { front: decided.front.ok, side: decided.side.ok },
    reasons: Object.fromEntries(SIZING_VIEWS.flatMap((slot) => (decided[slot].ok ? [] : [[slot, (decided[slot] as { reason: string }).reason]]))),
    model: "claude-haiku-5-5",
    usage: { input_tokens: 2000, output_tokens: 200 },
    latencyS: 2,
    attempts: 1,
    ...extra,
  };
}

/** A photo in every folder, answered perfectly. */
const oracleRuns = () => FOLDERS.map((f) => run(`${f}/a.jpg`, oracleAnswer(f)));

describe("PHOTO_FOLDERS", () => {
  it("agrees with production's decision: a perfect answer about each folder is kept exactly where the ADR says", () => {
    for (const folder of FOLDERS) {
      for (const slot of SIZING_VIEWS) {
        expect({ folder, slot, kept: photoScreeningVerdict(oracleAnswer(folder), slot).ok }).toEqual({
          folder,
          slot,
          kept: PHOTO_FOLDERS[folder].keep[slot],
        });
      }
    }
  });

  it("takes a photo from behind as the front upload: the face needn't show", () => {
    expect(PHOTO_FOLDERS.back.keep).toEqual({ front: true, side: false });
  });

  it("asks for about 35 photos, with as many from behind as facing the camera", () => {
    expect(FOLDERS.reduce((n, f) => n + PHOTO_FOLDERS[f].count, 0)).toBe(35);
    expect(PHOTO_FOLDERS.back.count).toBe(PHOTO_FOLDERS.front.count);
  });
});

describe("photoCase", () => {
  it("labels a photo by its folder, and tags it with any subfolders", () => {
    expect(photoCase("side/mirror-selfie/IMG_0042.JPG")).toEqual({
      id: "side-mirror-selfie-img-0042-jpg",
      path: "side/mirror-selfie/IMG_0042.JPG",
      folder: "side",
      tags: ["side", "mirror-selfie"],
    });
    expect(photoCase("back\\Sports-Top\\b.png")).toMatchObject({ path: "back/Sports-Top/b.png", folder: "back", tags: ["back", "sports-top"] });
  });

  it("passes over what isn't a photo", () => {
    for (const p of ["README.md", "front/.DS_Store", "front/notes.txt", "front/._IMG_1.jpg"]) expect(photoCase(p)).toBeNull();
  });

  it("skips a photo it can't label, saying why", () => {
    expect(photoCase("loose.jpg")).toEqual({ skipped: expect.stringContaining("not in a folder") });
    expect(photoCase("fronts/a.jpg")).toEqual({ skipped: expect.stringContaining('"fronts"') });
  });

  it("keeps HEIC photos as cases, so the runner can say to export them as JPEG", () => {
    expect(photoCase("front/IMG_1.HEIC")).toMatchObject({ folder: "front" });
  });
});

describe("gradeRun", () => {
  it("grades both uploads and every labelled field", () => {
    expect(gradeRun("side", oracleAnswer("side"), { front: false, side: true })).toEqual({ correct: 1, front_ok: 1, side_ok: 1, fields_ok: 1 });
    expect(gradeRun("back", { ...oracleAnswer("back"), view: "side" }, { front: false, side: true })).toEqual({
      correct: 0,
      front_ok: 0,
      side_ok: 0,
      fields_ok: 0,
    });
  });

  it("counts no answer as wrong fields, and grades the decision production made of it", () => {
    expect(gradeRun("no-person", null, { front: false, side: false })).toEqual({ correct: 1, front_ok: 1, side_ok: 1, fields_ok: 0 });
    expect(gradeRun("front", null, { front: false, side: false })).toMatchObject({ correct: 0, front_ok: 0, side_ok: 1 });
  });

  it("only grades what a folder labels: a too-dark photo's person and a mannequin's view have no single right answer", () => {
    expect(wrongFields("other-view", { ...oracleAnswer("other-view"), real_person: false })).toEqual([]);
    expect(wrongFields("no-person", { ...oracleAnswer("no-person"), view: "front" })).toEqual([]);
    expect(wrongFields("front", { ...oracleAnswer("front"), explicit: true })).toEqual(["explicit"]);
  });
});

describe("summarize", () => {
  it("scores a perfect screener at no mistakes (the harness's oracle check)", () => {
    const s = summarize(oracleRuns());
    expect(s.wrongRejections).toMatchObject({ k: 0, n: 3 });
    expect(s.wrongPasses).toMatchObject({ k: 0, n: 13 });
    expect(s.mistakes).toEqual([]);
    expect(Object.values(s.fields).every((f) => f.k === 0)).toBe(true);
  });

  it("scores turning everything down at every good photo lost and no bad photo kept (the null check)", () => {
    const s = summarize(FOLDERS.map((f) => run(`${f}/a.jpg`, { ...oracleAnswer(f), real_person: false })));
    expect(s.wrongRejections).toMatchObject({ k: 3, n: 3 });
    expect(s.wrongPasses).toMatchObject({ k: 0, n: 13 });
    expect(s.mistakes.map((m) => `${m.path} ${m.slot}`)).toEqual(["back/a.jpg front", "front/a.jpg front", "side/a.jpg side"]);
  });

  it("scores answering 'a good front photo' every time as keeping every bad photo offered as the front upload", () => {
    const always: PhotoScreeningAnswer = { real_person: true, view: "front", head_and_shoulders: true, explicit: false };
    const s = summarize(FOLDERS.map((f) => run(`${f}/a.jpg`, always)));
    expect(s.bySlot.front.wrongPasses).toMatchObject({ k: 6, n: 6 });
    expect(s.bySlot.side.wrongRejections).toMatchObject({ k: 1, n: 1 });
  });

  it("counts a refusal as a rejection, as production does, and says so", () => {
    const s = summarize([run("front/a.jpg", null), run("front/b.jpg", null, { stopReason: "max_tokens" })]);
    expect(s.wrongRejections).toMatchObject({ k: 2, n: 2 });
    expect(s.noAnswer).toEqual({ refused: 1, truncated: 1, unreadable: 0, of: 2 });
    expect(s.mistakes[0]).toMatchObject({ slot: "front", shouldKeep: true, said: ["refused to answer"], told: "We can't use this photo." });
  });

  it("finds a photo whose decision changed between runs", () => {
    const good = oracleAnswer("side");
    const s = summarize([
      run("side/a.jpg", good),
      run("side/a.jpg", { ...good, view: "front" }, { rep: 1 }),
      run("side/b.jpg", good),
      run("side/b.jpg", good, { rep: 1 }),
    ]);
    expect(s.changed).toMatchObject({ k: 1, n: 2, paths: ["side/a.jpg"] });
    expect(s.mistakes).toEqual([
      expect.objectContaining({ path: "side/a.jpg", slot: "side", wrongRuns: 1, runs: 2 }),
      expect.objectContaining({ path: "side/a.jpg", slot: "front", shouldKeep: false, wrongRuns: 1 }),
    ]);
  });

  it("adds up cost and time from each call", () => {
    const s = summarize([run("front/a.jpg", oracleAnswer("front"), { latencyS: 25 }), run("front/b.jpg", oracleAnswer("front"))]);
    expect(s.cost.perRunUsd).toBeCloseTo(0.0003, 8);
    expect(s.latency).toEqual({ p50: 2, p90: 25, max: 25, over20s: 1 });
    expect(summarize([run("front/a.jpg", oracleAnswer("front"), { model: "claude-unknown" })]).cost.totalUsd).toBeNull();
  });

  it("reports each subfolder tag", () => {
    const s = summarize([run("front/mirror-selfie/a.jpg", oracleAnswer("front")), run("front/mirror-selfie/b.jpg", null)]);
    expect(s.byTag).toEqual([{ tag: "mirror-selfie", photos: 2, correct: expect.objectContaining({ k: 1, n: 2 }) }]);
  });
});

describe("rate", () => {
  it("gives the 95% Wilson interval", () => {
    const half = rate(10, 20);
    expect(half.lo).toBeCloseTo(0.299, 3);
    expect(half.hi).toBeCloseTo(0.701, 3);
    expect(rate(0, 20).lo).toBe(0);
    expect(rate(0, 20).hi).toBeCloseTo(0.161, 3);
    expect(rate(0, 0)).toEqual({ k: 0, n: 0, lo: 0, hi: 0 });
  });
});

describe("callCostUsd", () => {
  it("prices input, output and cache tokens", () => {
    expect(callCostUsd("claude-haiku-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1);
    expect(callCostUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(10.2);
  });
});

describe("screeningFromResponse", () => {
  it("reads one answer for both uploads, as the eval does", () => {
    const response = { stop_reason: "end_turn" as const, model: "claude-haiku-5-5", content: [{ type: "text" as const, text: JSON.stringify(oracleAnswer("back")), citations: null }] };
    expect(screeningFromResponse(response, "front")).toEqual({ status: "passed", model: "claude-haiku-5-5" });
    expect(screeningFromResponse(response, "side")).toEqual({ status: "rejected", reason: expect.stringContaining("side view") });
  });
});

describe("formatSummary", () => {
  it("leads with the two mistakes that matter and lists each photo decided wrongly", () => {
    const md = formatSummary(summarize([run("front/z.jpg", null), ...oracleRuns()]), {
      variant: "baseline",
      model: "claude-haiku-5-5",
      effort: "low",
      reps: 1,
    });
    expect(md).toContain("**Good photos turned down:** 1 of 4 (25%, likely");
    expect(md).toContain("**Bad photos kept:** 0 of 14");
    expect(md).toContain("`front/z.jpg` as the **front** upload: turned down in 1 of 1 runs. Claude said: refused to answer.");
    expect(md).toContain("| back | 1 | should: 1/1 | shouldn't: 0/1 |");
  });

  it("compares variants side by side", () => {
    const summary = summarize(oracleRuns());
    const md = formatComparison([
      { config: { variant: "baseline", model: "claude-haiku-5-5", effort: "low", reps: 1 }, summary },
      { config: { variant: "v1", model: "claude-haiku-5-5", effort: "medium", reps: 1 }, summary },
    ]);
    expect(md).toContain("| | baseline | v1 |");
    expect(md).toContain("| Effort | low | medium |");
  });
});
