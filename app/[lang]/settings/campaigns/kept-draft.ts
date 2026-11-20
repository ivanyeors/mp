import { z } from "zod";
import type { CampaignWords } from "@/lib/email-campaigns/clear-all";
import { CampaignContentPreviewSchema } from "@/lib/email-campaigns/content";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_BUTTON_TARGETS, type CampaignAudience } from "@/lib/email-campaigns/rules";
import type { WantedSegment } from "@/lib/email-campaigns/wanted-segment";

export type EditorEmail = CampaignWords & { greeting: boolean };

export type EditorDraft = EditorEmail & {
  audience: CampaignAudience;
  segmentId: string;
  excludeSegmentIds: string[];
  includeUnengaged: boolean;
  wanted?: WantedSegment | null;
  audienceNote?: string | null;
};

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
  excludeSegmentIds: z.array(z.string()).default([]),
  includeUnengaged: z.boolean().default(false),
});

export function keptDraft(raw: unknown): KeptDraft | null {
  const parsed = KeptSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function keptOf({ audience, segmentId, excludeSegmentIds, includeUnengaged, wanted, audienceNote, ...email }: EditorDraft): KeptDraft {
  return { email, audience, segmentId, excludeSegmentIds, includeUnengaged };
}

export const draftOf = (k: KeptDraft): EditorDraft => ({
  ...k.email,
  audience: k.audience,
  segmentId: k.segmentId,
  excludeSegmentIds: k.excludeSegmentIds,
  includeUnengaged: k.includeUnengaged,
});

export const keptDraftKey = (campaignId: string | null) => `mp:campaign-draft:${campaignId ?? "new"}`;
