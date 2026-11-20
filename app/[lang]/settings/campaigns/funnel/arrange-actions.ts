"use server";

import { z } from "zod";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { hasPermission } from "@/lib/auth/permissions";
import { filtersKey } from "@/lib/crm/filters-key";
import { LIFECYCLE_STAGES } from "@/lib/crm/lifecycle-stage";
import { parseSegmentFilters, SEGMENT_FILTERS_VERSION } from "@/lib/crm/segment-rules";
import { createSegment, listSegments, SegmentNameTakenError } from "@/lib/crm/segments";
import { audienceRefusal } from "@/lib/email-campaigns/audience-refusal";
import { CampaignDraftSchema } from "@/lib/email-campaigns/rules";
import { PLAYBOOK_STARTERS, starterDraft, starterWants } from "@/lib/email-campaigns/starters";
import { createCampaign, listCampaigns, pointDraftAt } from "@/lib/email-campaigns/store";
import { findWanted, matchable, type MatchableSegment } from "@/lib/email-campaigns/wanted-segment";
import { playbookCampaignsOf, readFunnel } from "@/lib/email-funnel/model";
import { MOVE_DIDS, planMove, type FunnelMove } from "@/lib/email-funnel/move";
import { actingProfile, getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";

type Failure = { ok: false; error: string };
export type MoveAnswer = { ok: true; moved: string[] } | (Failure & { moved: string[] });

const MoveSchema = z
  .object({
    campaignId: z.string().uuid(),
    stage: z.enum(LIFECYCLE_STAGES as unknown as [string, ...string[]]),
    after: z.object({ campaignId: z.string().uuid(), did: z.enum(MOVE_DIDS as unknown as [string, ...string[]]) }).strict().nullable(),
    before: z.string().uuid().nullable(),
  })
  .strict();

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const NEEDS_SEGMENTS_EDIT = "only someone who can edit Customers (an Owner or Admin) can create one";

// ponytail: the changes are applied one by one, with no transaction over PostgREST. Each step
// leaves a valid arrangement, so a failure part-way says which email did not move and the page
// reads the flow again. The upgrade is an RPC that applies a plan in one transaction.
export async function moveFunnelEmail(input: FunnelMove): Promise<MoveAnswer> {
  const ctx = await assertAdmin("campaigns");
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not a move the Email flow makes.", moved: [] };
  const move = parsed.data as FunnelMove;
  const admin = supabaseAdmin();

  let segments: Awaited<ReturnType<typeof listSegments>>;
  let campaigns: Awaited<ReturnType<typeof listCampaigns>>;
  try {
    [segments, campaigns] = await Promise.all([listSegments(), listCampaigns(admin)]);
  } catch (err) {
    console.error("[email-funnel] move not read:", message(err));
    return { ok: false, error: "The flow could not be read, so nothing moved. Try again.", moved: [] };
  }
  const plan = planMove(
    {
      segments: segments.map((s) => ({ id: s.id, name: s.name, count: s.count, needsReview: s.needsReview, params: s.params })),
      campaigns: campaigns.map(({ campaign, stats }) => ({ campaign, stats })),
    },
    move,
  );
  if (!plan.ok) return { ...plan, moved: [] };
  if (!plan.changes.length) return { ok: true, moved: [] };

  const live: MatchableSegment[] = matchable(segments);
  const wantedOf = (ch: (typeof plan.changes)[number]) => ({ name: ch.segmentName, filters: new URLSearchParams(ch.filters).toString() });

  for (const ch of plan.changes) {
    if (findWanted(wantedOf(ch), live)) continue;
    if (!hasPermission(ctx, "customers-edit")) {
      return { ok: false, error: `Moving “${ch.name}” needs a new Segment, “${ch.segmentName}”, and ${NEEDS_SEGMENTS_EDIT}. Nothing moved.`, moved: [] };
    }
    if (!parseSegmentFilters(ch.filters).ok) return { ok: false, error: `“${ch.name}” cannot be moved: its Segment's filters cannot be saved again. Nothing moved.`, moved: [] };
  }

  const actor = { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId };
  const before = new Map(campaigns.map(({ campaign }) => [campaign.id, campaign]));
  const moved: string[] = [];
  const stopped = (name: string, why: string): MoveAnswer => ({
    ok: false,
    error: `“${name}” did not move: ${why}${moved.length ? " The emails before it did; the flow shows where each is now." : ""}`,
    moved,
  });

  for (const ch of plan.changes) {
    try {
      let segmentId = findWanted(wantedOf(ch), live)?.id ?? null;
      if (!segmentId) {
        const filters = parseSegmentFilters(ch.filters);
        if (!filters.ok) return stopped(ch.name, "its Segment's filters cannot be saved again.");
        const me = await actingProfile(ctx.memberId);
        const row = await createSegment(ch.segmentName, filters.params, me?.id ?? null);
        await recordAdminAction({
          actor,
          action: "customer_segment.create",
          entityType: "customer_segment",
          entityId: row.id,
          after: { name: row.name, filters: filters.params, filters_version: SEGMENT_FILTERS_VERSION },
        });
        live.push({ id: row.id, name: row.name, filtersKey: filtersKey(filters.params) });
        segmentId = row.id;
      }
      const neverSends = await audienceRefusal(ch.campaignId, segmentId);
      if (neverSends) return stopped(ch.name, neverSends);
      if (!(await pointDraftAt(admin, ch.campaignId, segmentId))) {
        return stopped(ch.name, "it has started sending or was archived, so it keeps who it goes to.");
      }
      const was = before.get(ch.campaignId);
      await recordAdminAction({
        actor,
        action: "email_campaign.update",
        entityType: "email_campaign",
        entityId: ch.campaignId,
        before: { audience: was?.audience ?? null, segment_id: was?.segmentId ?? null },
        after: { audience: "segment", segment_id: segmentId, arranged: ch.campaign ? { after: ch.campaign.id, did: ch.campaign.did } : "start" },
      });
      moved.push(ch.campaignId);
    } catch (err) {
      return stopped(ch.name, err instanceof SegmentNameTakenError ? `${err.message} Rename it in Customers, then try again.` : message(err));
    }
  }
  return { ok: true, moved };
}

export async function addPlaybookDraft(starterId: string): Promise<{ ok: true; id: string } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const starter = typeof starterId === "string" ? PLAYBOOK_STARTERS.find((s) => s.id === starterId) : undefined;
  const wanted = starter ? starterWants(starter) : null;
  if (!starter || !wanted) return { ok: false, error: "That Playbook is not offered: its words wait for the owner." };
  const actor = { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId };
  try {
    const [segments, campaigns] = await Promise.all([listSegments(), listCampaigns(supabaseAdmin())]);
    const reading = readFunnel({
      segments: segments.map((s) => ({ id: s.id, name: s.name, count: s.count, needsReview: s.needsReview, params: s.params })),
      campaigns: campaigns.map(({ campaign, stats }) => ({ campaign, stats })),
    });
    const already = playbookCampaignsOf(reading, starter.id)[0];
    if (already) return { ok: false, error: `“${already.campaign.name}” is already this Playbook in the flow. Open it to change it.` };
    const live = matchable(segments);
    let segmentId = findWanted(wanted, live)?.id ?? null;
    if (!segmentId) {
      if (!hasPermission(ctx, "customers-edit")) {
        return { ok: false, error: `The Playbook needs its Segment, “${wanted.name}”, and ${NEEDS_SEGMENTS_EDIT}.` };
      }
      const filters = parseSegmentFilters(Object.fromEntries(new URLSearchParams(wanted.filters)));
      if (!filters.ok) return { ok: false, error: filters.error };
      const me = await actingProfile(ctx.memberId);
      const row = await createSegment(wanted.name, filters.params, me?.id ?? null);
      await recordAdminAction({
        actor,
        action: "customer_segment.create",
        entityType: "customer_segment",
        entityId: row.id,
        after: { name: row.name, filters: filters.params, filters_version: SEGMENT_FILTERS_VERSION },
      });
      segmentId = row.id;
    }
    const draft = CampaignDraftSchema.safeParse({ ...starterDraft(starter), audience: "segment", segmentId });
    if (!draft.success) return { ok: false, error: "The Playbook's draft could not be saved." };
    const workingAs = await getWorkingAs(ctx.memberId);
    const admin = supabaseAdmin();
    const id = await createCampaign(admin, draft.data, workingAs?.id ?? null);
    await recordAdminAction({
      actor,
      action: "email_campaign.create",
      entityType: "email_campaign",
      entityId: id,
      after: { name: draft.data.name, subject: draft.data.subject, audience: "segment", segment_id: segmentId, from_playbook: starter.id },
    });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err instanceof SegmentNameTakenError ? `${err.message} It has other filters: rename it in Customers, then try again.` : message(err) };
  }
}
