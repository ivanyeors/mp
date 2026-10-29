"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { CAMPAIGN_TEST_AUDIT_ACTION } from "@/lib/customer-migration/campaign-ledger";
import { resolveSegment } from "@/lib/crm/segments";
import {
  CampaignDraftSchema,
  CampaignPreviewSchema,
  MAX_TEST_RECIPIENTS,
  type Campaign,
  type CampaignDraft,
  type CampaignDraftInput,
} from "@/lib/email-campaigns/rules";
import {
  BATCH_SIZE,
  campaignReadiness,
  planWave,
  renderCampaignPreview,
  sendCampaignBatch,
  sendCampaignTest,
  type BatchResult,
  type CampaignReadiness,
  type WavePlanResult,
} from "@/lib/email-campaigns/sender";
import { campaignImageFieldErrors, readCampaignImages } from "@/lib/email-campaigns/images";
import { campaignSenderSetup } from "@/lib/email-campaigns/setup";
import { archiveCampaign, createCampaign, getCampaign, lockCampaign, updateCampaign } from "@/lib/email-campaigns/store";
import { imageAssetsIn } from "@/lib/email-campaigns/content";
import { getWorkingAs } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Admin Panel → Email campaigns (PRD-email-marketing).
 *
 * Every action checks `campaigns`, a key of its own that Owner and Admin hold:
 * Manager and Staff hold `customers` and must not email the whole list. The
 * rules live in lib/email-campaigns; these only check the caller, parse the
 * input and audit. No answer carries a customer's email: a wave is planned as
 * ids, and each batch answers with counts.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { ok: false as const, error: "That campaign does not exist." };

type Failure = { ok: false; error: string; fieldErrors?: Record<string, string> };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function parseDraft(input: CampaignDraftInput, schema = CampaignDraftSchema) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true as const, draft: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false as const, error: "Check the highlighted fields.", fieldErrors };
}

async function loadCampaign(id: string): Promise<Campaign | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  return getCampaign(supabaseAdmin(), id);
}

/** The audit's snapshot: what was sent and to whom, never a customer. A block campaign's blocks by type. */
const auditSnapshot = (c: Pick<Campaign, "name" | "subject" | "audience" | "segmentId" | "button" | "content">) => ({
  name: c.name,
  subject: c.subject,
  audience: c.audience,
  segment_id: c.segmentId,
  button: c.button?.target ?? null,
  blocks: c.content ? c.content.blocks.map((b) => b.type) : null,
});

/**
 * Every image the email places has its email rendition (slice 05), made now
 * if it has none: an image that cannot have one is a field error, so a saved
 * campaign always has the copies a send shows. Null when all is well.
 */
async function imageProblems(admin: ReturnType<typeof supabaseAdmin>, draft: CampaignDraft): Promise<Failure | null> {
  const fieldErrors = campaignImageFieldErrors(draft.content, await readCampaignImages(admin, draft.content));
  return Object.keys(fieldErrors).length ? { ok: false, error: "Check the highlighted fields.", fieldErrors } : null;
}

/** The Media Library's *Last used* for the images a save attaches; a failure there never fails the save. */
async function touchImages(draft: CampaignDraft): Promise<void> {
  const assetIds = draft.content ? imageAssetsIn(draft.content) : [];
  if (!assetIds.length) return;
  const { touchLastUsed } = await import("@/lib/media-assets");
  await touchLastUsed({ assetIds }).catch(() => undefined);
}

/** Saves a new campaign (no id) or a draft's changes. A campaign that has started sending only takes a new name. */
export async function saveCampaign(
  id: string | null,
  input: CampaignDraftInput,
): Promise<{ ok: true; id: string } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const parsed = parseDraft(input);
  if (!parsed.ok) return parsed;
  const admin = supabaseAdmin();
  const actor = { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId };

  try {
    if (!id) {
      const unpictured = await imageProblems(admin, parsed.draft);
      if (unpictured) return unpictured;
      const workingAs = await getWorkingAs(ctx.memberId);
      const newId = await createCampaign(admin, parsed.draft, workingAs?.id ?? null);
      await recordAdminAction({ actor, action: "email_campaign.create", entityType: "email_campaign", entityId: newId, after: auditSnapshot(parsed.draft) });
      await touchImages(parsed.draft);
      return { ok: true, id: newId };
    }
    const before = await loadCampaign(id);
    if (!before || before.archivedAt) return NOT_FOUND;
    // A started campaign takes only a new name: its images are as they were sent.
    if (!before.lockedAt) {
      const unpictured = await imageProblems(admin, parsed.draft);
      if (unpictured) return unpictured;
    }
    await updateCampaign(admin, id, parsed.draft, Boolean(before.lockedAt));
    await recordAdminAction({
      actor,
      action: "email_campaign.update",
      entityType: "email_campaign",
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(before.lockedAt ? { ...before, name: parsed.draft.name } : parsed.draft),
    });
    if (!before.lockedAt) await touchImages(parsed.draft);
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** A copy of a campaign as a new draft, to change one that has started sending. */
export async function duplicateCampaign(id: string): Promise<{ ok: true; id: string } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const source = await loadCampaign(id);
  if (!source) return NOT_FOUND;
  const name = `Copy of ${source.name}`.slice(0, 80);
  return saveCampaign(null, { ...source, name }).then(async (r) => {
    if (r.ok) {
      await recordAdminAction({
        actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
        action: "email_campaign.duplicate",
        entityType: "email_campaign",
        entityId: r.id,
        before: { from: id },
      });
    }
    return r;
  });
}

export async function archiveCampaignAction(id: string): Promise<{ ok: true } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign) return NOT_FOUND;
  try {
    await archiveCampaign(supabaseAdmin(), id);
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action: "email_campaign.archive",
    entityType: "email_campaign",
    entityId: id,
    before: auditSnapshot(campaign),
  });
  return { ok: true };
}

/**
 * The editor's live preview of the draft as typed. Saves nothing. An empty
 * field shows its placeholder rather than an error (PRD-campaign-email-editor
 * decision 7); Save still asks for every word. `forceDark` is the preview's
 * Dark toggle (slice 04), and `from` the sending setup's From, read-only in
 * the editor and named in its inbox row.
 */
export async function previewCampaign(
  input: CampaignDraftInput,
  { forceDark = false }: { forceDark?: boolean } = {},
): Promise<{ ok: true; subject: string; html: string; text: string; from: string | null } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const parsed = parseDraft(input, CampaignPreviewSchema);
  if (!parsed.ok) return parsed;
  const workingAs = await getWorkingAs(ctx.memberId);
  const setup = campaignSenderSetup();
  // The images the test send shows: an image without its email copy is drawn as a hint.
  const { images } = await readCampaignImages(supabaseAdmin(), parsed.draft.content);
  const rendered = renderCampaignPreview(parsed.draft, {
    origin: setup.origin,
    firstName: workingAs?.name.split(/\s+/)[0] ?? null,
    forceDark: forceDark === true,
    images,
  });
  return { ok: true, ...rendered, from: setup.campaignFrom?.trim() || null };
}

/** A chosen image's email rendition, as the editor's image card shows it. */
export type PlacedCampaignImage = { assetId: string; url: string; width: number; height: number; hasAlpha: boolean };

/**
 * An image chosen in the editor (PRD-campaign-email-editor slice 05): its
 * email rendition, made now if it has none, so the block places an image an
 * inbox can show. The editor's card shows the rendition too. Changes no
 * campaign: the block is saved, and audited, by Save.
 */
export async function placeCampaignImage(assetId: string): Promise<{ ok: true; image: PlacedCampaignImage } | Failure> {
  await assertAdmin("campaigns");
  if (typeof assetId !== "string" || !UUID.test(assetId)) return { ok: false, error: "That is not an image from the Media Library." };
  const { ensureEmailRenditions } = await import("@/lib/media-assets/email-renditions");
  try {
    const { renditions, failed } = await ensureEmailRenditions(supabaseAdmin(), [assetId]);
    const r = renditions.get(assetId);
    if (!r) return { ok: false, error: failed.get(assetId) ?? "That image couldn't be made ready for email." };
    return { ok: true, image: { assetId, url: r.url, width: r.width, height: r.height, hasAlpha: r.hasAlpha } };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** Every check a send must pass, for the page's status panel. Changes nothing. */
export async function checkCampaignReadiness(id?: string): Promise<CampaignReadiness> {
  await assertAdmin("campaigns");
  const campaign = id && UUID.test(id) ? await loadCampaign(id) : null;
  return campaignReadiness(campaignSenderSetup(), { campaign: campaign ?? undefined });
}

/** Sends the saved campaign to up to three addresses, with "[Test]" in the subject. Writes nothing to the ledger. */
export async function sendCampaignTestAction(
  id: string,
  to: string[],
): Promise<{ ok: true; sent: number; failed: { to: string; error: string }[] } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign || campaign.archivedAt) return NOT_FOUND;
  if (!Array.isArray(to) || to.length > MAX_TEST_RECIPIENTS) {
    return { ok: false, error: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };
  }
  const workingAs = await getWorkingAs(ctx.memberId);
  const result = await sendCampaignTest(
    campaign,
    { to: to.filter((t) => typeof t === "string"), firstName: workingAs?.name.split(/\s+/)[0] ?? null },
    campaignSenderSetup(),
  );
  if ("refused" in result) return { ok: false, error: result.refused };
  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    // The send limit counts these: Resend counts a test like any send.
    action: CAMPAIGN_TEST_AUDIT_ACTION,
    entityType: "email_campaign",
    entityId: id,
    after: { sent: result.sent.length, failed: result.failed.length },
  });
  return { ok: true, sent: result.sent.length, failed: result.failed };
}

export type WaveRequest = { size: number; retryFailed?: boolean; resume?: boolean };

export type WaveAnswer =
  | ({ ok: true; started: boolean; batchSize: number } & WavePlanResult)
  | Failure;

/**
 * Who a wave of `size` would go to now, with every check. With `start`, and
 * when every check passes, it also fixes the campaign's content (the first
 * wave locks it) and returns the ids the browser then sends a batch at a time.
 */
export async function planCampaignWave(id: string, req: WaveRequest, start = false): Promise<WaveAnswer> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign || campaign.archivedAt) return NOT_FOUND;
  const setup = campaignSenderSetup();
  let result: WavePlanResult;
  try {
    result = await planWave(
      campaign,
      { size: Number(req.size), retryFailed: Boolean(req.retryFailed), resume: Boolean(req.resume) },
      setup,
      campaign.segmentId ? () => resolveSegment(campaign.segmentId!) : undefined,
    );
  } catch (err) {
    return { ok: false, error: message(err) };
  }

  const started = start && result.readiness.ready && result.customerIds.length > 0;
  if (started) {
    try {
      await lockCampaign(setup.admin, id);
    } catch (err) {
      return { ok: false, error: message(err) };
    }
    await recordAdminAction({
      actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
      action: "email_campaign.wave_start",
      entityType: "email_campaign",
      entityId: id,
      after: {
        wave: result.wave,
        size: result.customerIds.length,
        requested: result.requested,
        limited_by: result.limitedBy,
        eligible: result.plan.eligible,
        retry_failed: Boolean(req.retryFailed),
        resumed: Boolean(req.resume),
      },
    });
  }
  return { ok: true, started, batchSize: BATCH_SIZE, ...result, customerIds: started ? result.customerIds : [] };
}

/** One batch of a started wave. The browser calls it until the wave's ids run out, or it says stop. */
export async function sendCampaignBatchAction(
  id: string,
  batch: { wave: string; customerIds: string[]; retryFailed?: boolean; failuresInARow?: number },
): Promise<({ ok: true } & BatchResult) | Failure> {
  await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign) return NOT_FOUND;
  const ids = Array.isArray(batch.customerIds) ? batch.customerIds.filter((c) => typeof c === "string" && UUID.test(c)) : [];
  const result = await sendCampaignBatch(
    campaign,
    {
      wave: String(batch.wave ?? ""),
      customerIds: ids,
      retryFailed: Boolean(batch.retryFailed),
      failuresInARow: Math.max(0, Math.floor(Number(batch.failuresInARow) || 0)),
    },
    campaignSenderSetup(),
  );
  return { ok: true, ...result };
}
