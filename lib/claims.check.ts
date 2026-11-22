import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findClaims, namesMedicalCondition } from "@/lib/claims";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";

const MUST_FLAG = [
  "A cervical pillow that relieves neck pain.",
  "This can significantly reduce pain and discomfort.",
  "Leading to a more comfortable and pain-free sleep.",
  "Which promotes better breathing.",
  "Ideal sleeping posture for unrestricted airways.",
  "Clinically proven support.",
  "Doctor-recommended comfort.",
  "Corrects your posture overnight.",
  "Treats neck pain.",
  "颈椎枕（缓解颈部疼痛）",
  "让呼吸更顺畅。",
  "帮助俯睡时更易呼吸",
];
const MUST_PASS = [
  "A supportive shape that keeps your neck comfortable all night.",
  "Health facts link to their sources.",
  "Keep your account secure.",
  "If pain lasts more than a few weeks, see a doctor.",
  "A little treat for tired parents.",
  "Your neck muscles take less strain overnight.",
  "认识与 Mpillow 合作的物理治疗中心。",
];
for (const text of MUST_FLAG) assert.ok(findClaims(text).length > 0, `claims list misses: ${text}`);
for (const text of MUST_PASS) assert.deepEqual(findClaims(text), [], `claims list over-matches: ${text}`);
assert.ok(namesMedicalCondition("sleep apnea"));
assert.ok(namesMedicalCondition("头部与颈椎手术后"));
assert.ok(!namesMedicalCondition("have broad or narrow shoulders"));

function collectStrings(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${path}.${key}`, out);
  }
}

const problems: string[] = [];
for (const [locale, messages] of [["en-US", enUS], ["zh-CN", zhCN]] as const) {
  const strings: Array<[string, string]> = [];
  collectStrings(messages, locale, strings);
  for (const [path, text] of strings) {
    for (const rule of findClaims(text)) problems.push(`${path}: ${rule}: "${text.slice(0, 90)}"`);
    if (/whoItsForItems\[\d+\]$/.test(path) && namesMedicalCondition(text)) {
      problems.push(`${path}: names a medical condition as who it's for: "${text}"`);
    }
  }
}

const COPY_IN_CODE = [
  "app/layout.tsx",
  "lib/seo/jsonld-organization.ts",
  "app/[lang]/blog/(index)/page.tsx",
  "app/[lang]/mp-config/page.tsx",
  "lib/seo/guides-content.ts",
  "lib/ecommerce/inventory-sync.ts",
];
for (const rel of COPY_IN_CODE) {
  const source = readFileSync(join(process.cwd(), rel), "utf8").replace(/(["'`])\/[^"'`\s]*\1/g, '""');
  for (const rule of findClaims(source)) problems.push(`${rel}: ${rule}`);
}

assert.deepEqual(problems, [], `claim phrases in site copy (D2, PRD-guides-content):\n${problems.join("\n")}\n`);
console.log("claims.check.ts: ok");
