import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { assertMarketingCopySafe } from "@/lib/i18n/assert-marketing-copy-safe";
import { HERO_H1_CHAR_MAX, HERO_H1_WORD_MAX } from "@/lib/i18n/copy-bands";
import { validateHeroContent } from "@/lib/page-builder/copy-fit";
import { writeLocalisedField } from "@/lib/page-builder/locale";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const readCode = (rel: string) =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function heroEn(fields: Record<string, string>): Record<string, unknown> {
  let content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) content = writeLocalisedField(content, k, "en-US", v);
  return content;
}

const bands = read("lib/i18n/copy-bands.ts");
const gate = read("lib/i18n/assert-marketing-copy-safe.ts");
const pbGate = read("lib/page-builder/copy-fit.ts");
assert.match(bands, /HERO_H1_CHAR_MAX = 55/, "bands module owns the numbers");
assert.doesNotMatch(
  readCode("lib/i18n/assert-marketing-copy-safe.ts"),
  /HERO_H1_CHAR_MAX = /,
  "the assert gate no longer redefines the bands",
);
assert.doesNotMatch(
  readCode("lib/page-builder/copy-fit.ts"),
  /= 55|= 40|= 28|= 12/,
  "the page-builder gate does not redefine the bands",
);
assert.match(gate, /from "\.\/copy-bands"/, "the assert gate imports the shared bands");
assert.match(pbGate, /from "@\/lib\/i18n\/copy-bands"/, "the page-builder gate imports the shared bands");
assert.doesNotMatch(
  readCode("lib/i18n/copy-bands.ts"),
  /node:|from "(fs|path)"/,
  "the bands module stays client-safe for the inspector meter",
);

const overlongH1 = "The most scientifically advanced cervical pillow ever engineered anywhere";
let assertThrew = false;
try {
  assertMarketingCopySafe([], { heroH1: overlongH1 });
} catch {
  assertThrew = true;
}
const builderIssues = validateHeroContent(heroEn({ titlePrefix: overlongH1, titleEmphasis: "", titleSuffix: "" }));
assert.equal(assertThrew, true, "the build-time gate rejects the overlong H1");
assert.ok(builderIssues.length > 0, "the write path rejects the same overlong H1");

const goodH1 = "Sleep right, don't sleep tight";
assertMarketingCopySafe([], { heroH1: goodH1 });
assert.deepEqual(
  validateHeroContent(heroEn({ titlePrefix: "Sleep right,", titleEmphasis: "don't sleep tight", titleSuffix: "" })),
  [],
  "the write path accepts what the build-time gate accepts",
);

assert.match(builderIssues[0].message, /is \d+ (words|chars), limit is \d+/, "message names measured value and limit");
assert.ok(
  builderIssues.some((i) => i.message.includes(String(HERO_H1_CHAR_MAX))),
  "character limit is quoted",
);

const wordy = validateHeroContent(
  heroEn({ titlePrefix: "one two three four five six seven eight nine ten", titleEmphasis: "", titleSuffix: "" }),
);
assert.ok(wordy.some((i) => i.message.includes(String(HERO_H1_WORD_MAX))), "word limit is quoted");

const banned = validateHeroContent(heroEn({ titlePrefix: "We treat", titleEmphasis: "neck pain" }));
assert.ok(banned.some((i) => /cannot claim/.test(i.message)), "banned clinical verb rejected");

let zh: Record<string, unknown> = {};
zh = writeLocalisedField(zh, "titlePrefix", "zh-CN", "好好睡觉，睡得安稳，让颈椎每晚都得到真正的支撑与放松");
assert.deepEqual(validateHeroContent(zh), [], "word bands are not applied to zh-CN");

assert.deepEqual(validateHeroContent({}), [], "no override means nothing to gate");

const route = read("app/api/landing-sections/[id]/route.ts");
assert.match(route, /validateSectionCopy\(before\.section_type, parsed\.content\)/, "PATCH gates content");
assert.match(route, /status: 400/, "a failing band is a 400");

const editor = read("components/settings/page-builder/section-editor.tsx");
assert.match(editor, /BandMeter/, "the inspector renders a live meter");
assert.match(editor, /HERO_H1_WORD_BAND/, "the meter uses the shared bands");
assert.match(editor, /too long/, "the meter marks an over-limit value");

console.log("landing-copy-fit self-check ok");
