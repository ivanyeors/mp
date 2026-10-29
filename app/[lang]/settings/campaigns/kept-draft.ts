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

/** The email as the editor's history holds it: its words and blocks, and the greeting switch. */
export type EditorEmail = CampaignWords & { greeting: boolean };

/** One draft's unsaved state: the email, and who it goes to. */
export interface KeptDraft {
  email: EditorEmail;
  audience: CampaignAudience;
  segmentId: string;
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
});

/** Pure — a kept copy read back, or null when it no longer fits. */
export function keptDraft(raw: unknown): KeptDraft | null {
  const parsed = KeptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The browser's key for one draft's copy. */
export const keptDraftKey = (campaignId: string | null) => `mp:campaign-draft:${campaignId ?? "new"}`;
