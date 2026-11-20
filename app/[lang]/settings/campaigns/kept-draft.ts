/**
 * What the campaign editor keeps in the browser while a draft has unsaved
 * changes, to offer back after a crash (PRD-campaign-email-editor slice 04,
 * decision 4). Pure. A copy is read back only when every part still fits:
 * an older shape, or blocks the schema now refuses, are dropped, never shown.
 */
import { z } from "zod";
import type { CampaignWords } from "@/lib/email-campaigns/clear-all";
import { CampaignContentPreviewSchema } from "@/lib/email-campaigns/content";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_BUTTON_TARGETS, type CampaignAudience } from "@/lib/email-campaigns/rules";
import type { WantedSegment } from "@/lib/email-campaigns/wanted-segment";

/** The email: its words and blocks, and the greeting switch. */
export type EditorEmail = CampaignWords & { greeting: boolean };

/**
 * What the editor's history holds: the email and who it goes to, the
 * Segments it leaves out included (PRD-campaign-audiences slice 06), and
 * whether it includes the Unengaged (slice 12), so one Undo takes back any
 * change to either. With them, the Segment New campaign's address wants and
 * the address's note (PRD-email-funnel slices 04 and 06), so Undo and Redo
 * always show the ones the draft is for; never kept in the browser.
 */
export type EditorDraft = EditorEmail & {
  audience: CampaignAudience;
  segmentId: string;
  excludeSegmentIds: string[];
  includeUnengaged: boolean;
  wanted?: WantedSegment | null;
  audienceNote?: string | null;
};

/** One draft's unsaved state: the email, and who it goes to. */
export interface KeptDraft {
  email: EditorEmail;
  audience: CampaignAudience;
  segmentId: string;
  excludeSegmentIds: string[];
  includeUnengaged: boolean;
}

const KeptSchema = z.object({
  email: z.object({
    name: z.string(),
    subject: z.string(),
    preheader: z.string(),
    body: z.string(),
    button: z.object({ choice: z.enum(["none", ...CAMPAIGN_BUTTON_TARGETS]), label: z.string(), url: z.string() }),
    content: CampaignContentPreviewSchema.nullable(),
    greeting: z.boolean(),
  }),
  audience: z.enum(CAMPAIGN_AUDIENCES),
  segmentId: z.string(),
  // A copy kept before slice 06 has none, and still reads.
  excludeSegmentIds: z.array(z.string()).default([]),
  // Nor one kept before slice 12: it leaves the Unengaged out, as a new draft does.
  includeUnengaged: z.boolean().default(false),
});

/** Pure — a kept copy read back, or null when it no longer fits. */
export function keptDraft(raw: unknown): KeptDraft | null {
  const parsed = KeptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Pure — the editor's draft as the browser keeps it. */
export function keptOf({ audience, segmentId, excludeSegmentIds, includeUnengaged, wanted, audienceNote, ...email }: EditorDraft): KeptDraft {
  return { email, audience, segmentId, excludeSegmentIds, includeUnengaged };
}

/** Pure — a kept copy as the editor's draft. */
export const draftOf = (k: KeptDraft): EditorDraft => ({
  ...k.email,
  audience: k.audience,
  segmentId: k.segmentId,
  excludeSegmentIds: k.excludeSegmentIds,
  includeUnengaged: k.includeUnengaged,
});

/** The browser's key for one draft's copy. */
export const keptDraftKey = (campaignId: string | null) => `mp:campaign-draft:${campaignId ?? "new"}`;
