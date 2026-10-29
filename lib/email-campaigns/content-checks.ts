/**
 * The email's own checks before a wave (PRD-campaign-email-editor slices 08
 * and 11). Pure.
 *
 * Today one: no field is still on its placeholder. Save already asks for
 * every word, but a row can hold blocks Save would refuse now (one saved
 * under an older rule opens with the preview's checks, `campaignFromRow`),
 * and a placeholder is never sent: an empty headline would go out as nothing.
 * So the wave asks again, with Save's schema, and names each block that
 * fails. Slice 11 adds the rest of the email's checks here (links, images,
 * size, banned words) as `campaignContentChecks`.
 */
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { CampaignContentSchema, EMAIL_BLOCK_LABEL, type CampaignContent } from "./content";

/** The most blocks one check names; the rest are counted. */
const NAMED = 3;

/** The value at `path` inside `v`, or undefined. */
function at(v: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>((x, k) => (x !== null && typeof x === "object" ? (x as Record<PropertyKey, unknown>)[k] : undefined), v);
}

const isEmpty = (v: unknown) => (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/**
 * Pure — every field written, as Save asks, for a block campaign: a check
 * naming each block still on its placeholder (*Block 2, Heading: still
 * empty*), or what else Save would refuse in it; null for a campaign written
 * before blocks, whose message Save checks on its own.
 */
export function placeholdersCheck(content: CampaignContent | null): PreflightCheck | null {
  if (!content) return null;
  const parsed = CampaignContentSchema.safeParse(content);
  if (parsed.success) return { key: "placeholders", ok: true, detail: "every block's words are written" };

  const problems: string[] = [];
  const named = new Set<number>();
  for (const issue of parsed.error.issues) {
    const [top, index] = issue.path;
    if (top !== "blocks" || typeof index !== "number") {
      problems.push(content.blocks.length ? issue.message : "the email has no blocks yet");
      continue;
    }
    if (named.has(index)) continue;
    named.add(index);
    const b = content.blocks[index];
    const what = isEmpty(at(content, issue.path)) ? "still empty" : issue.message;
    problems.push(`Block ${index + 1}, ${b ? EMAIL_BLOCK_LABEL[b.type] : "a block"}: ${what}`);
  }
  const unique = [...new Set(problems)];
  const more = unique.length - NAMED;
  return {
    key: "placeholders",
    ok: false,
    detail: unique.slice(0, NAMED).join("; ") + (more > 0 ? `; and ${more} more` : ""),
  };
}
