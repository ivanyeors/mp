"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { CAMPAIGN_TEST_AUDIT_ACTION } from "@/lib/customer-migration/campaign-ledger";
import { listSegments } from "@/lib/crm/segments";
import { audienceRefusal } from "@/lib/email-campaigns/audience-refusal";
import { afterParam, findWanted, matchable, type WantedAddress } from "@/lib/email-campaigns/wanted-segment";
import {
  CampaignDraftSchema,
  CampaignPreviewSchema,
  EMPTY_CAMPAIGN_DRAFT,
  MAX_TEST_RECIPIENTS,
  type Campaign,
  type CampaignDraft,
  type CampaignDraftInput,
} from "@/lib/email-campaigns/rules";
import {
  BATCH_SIZE,
  campaignLanguage,
  campaignReadiness,
  planWave,
  productsFor,
  readCampaignRenderData,
  renderCampaignPreview,
  sendCampaignBatch,
  sendCampaignTest,
  usesPointsBalance,
  type BatchResult,
  type CampaignReadiness,
  type WavePlanResult,
} from "@/lib/email-campaigns/sender";
import { campaignImageFieldErrors, readCampaignImages } from "@/lib/email-campaigns/images";
import { readCampaignProductCards, shopProductCard, type CampaignProductCard, type ShopProductRow } from "@/lib/email-campaigns/products";
import { getProducts } from "@/lib/ecommerce/products";
import { campaignSenderSetup } from "@/lib/email-campaigns/setup";
import { approveSegments, leftOutSegments, segmentAudience } from "@/lib/email-campaigns/segment-sources";
import {
  archiveCampaign,
  createCampaign,
  getCampaign,
  getCampaignStats,
  listPastCampaigns,
  lockCampaign,
  saveKeepSending,
  updateCampaign,
  type PastCampaign,
} from "@/lib/email-campaigns/store";
import { keepSendingBlocker, parseDailyCap, KEEP_SENDING_MAX_CAP, type KeepSending } from "@/lib/email-campaigns/keep-sending";
import { holdoutBlocker } from "@/lib/email-campaigns/results";
import { BLANK_PREVIEW, newCampaignFromAddress, STARTERS, starterDraft } from "@/lib/email-campaigns/starters";
import { imageAssetsIn } from "@/lib/email-campaigns/content";
import { NO_DETAILS, POINTS_NOT_LIVE, SAMPLE_RECIPIENT, type PreviewAs } from "@/lib/email-campaigns/variables";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { readPointsSettings } from "@/lib/points/server";
import { pointsLive } from "@/lib/points/settings";
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

/** Who a campaign written before blocks greets in a preview or a test: the Staff member working, by first name. */
const staffFirstName = async (memberId: string) => (await getWorkingAs(memberId))?.name.split(/\s+/)[0] ?? null;

/** The audit's snapshot: what was sent and to whom, never a customer. A block campaign's blocks by type. */
const auditSnapshot = (
  c: Pick<Campaign, "name" | "subject" | "audience" | "segmentId" | "excludeSegmentIds" | "button" | "content">,
) => ({
  name: c.name,
  subject: c.subject,
  audience: c.audience,
  segment_id: c.segmentId,
  exclude_segment_ids: c.excludeSegmentIds,
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

/**
 * *Points balance* goes into an email only while points are live
 * (PRD-campaign-email-editor slice 13): the editor greys it, and Save refuses
 * it typed in by hand. A campaign that already says it keeps it, and the
 * points rule holds its waves until points are live again (`pointsCheck`).
 */
async function pointsBalanceRefusal(admin: SupabaseClient, draft: CampaignDraft, before: Campaign | null): Promise<Failure | null> {
  if (!usesPointsBalance(draft) || (before && usesPointsBalance(before))) return null;
  try {
    if (pointsLive(await readPointsSettings(admin))) return null;
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  return { ok: false, error: `${POINTS_NOT_LIVE}, so Points balance can't go in the email. Take it out to save.` };
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
      const refused = await pointsBalanceRefusal(admin, parsed.draft, null);
      if (refused) return refused;
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
    const refused = await pointsBalanceRefusal(admin, parsed.draft, before);
    if (refused) return refused;
    // A started campaign takes only a new name: its images are as they were sent.
    if (!before.lockedAt) {
      const neverSends = await audienceRefusal(id, parsed.draft.segmentId);
      if (neverSends) return { ok: false, error: "Check the highlighted fields.", fieldErrors: { segmentId: neverSends } };
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

/**
 * *A past campaign*, in the Start panel of an empty email
 * (PRD-campaign-email-editor slice 08): every campaign, archived ones too,
 * newest first, by name and subject. Picking one is Duplicate, which copies
 * the email and who it goes to and nothing of its sends. Changes nothing.
 */
export async function listPastCampaignsAction(): Promise<{ ok: true; campaigns: PastCampaign[] } | Failure> {
  await assertAdmin("campaigns");
  try {
    return { ok: true, campaigns: await listPastCampaigns(supabaseAdmin()) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** What `findWantedSegmentAction` takes: one of New campaign's addresses, never filters. */
const WantedAddressSchema = z.union([
  z.object({ starter: z.string().max(100) }).strict(),
  z.object({ stage: z.string().max(40) }).strict(),
  z.object({ after: z.string().max(100) }).strict(),
]);
const NOT_WANTED = { ok: false as const, error: "That is not a Segment New campaign can want." };

/**
 * The live Segment a wanted Segment is, read again (PRD-email-funnel slices
 * 04 and 06): when *Create the Segment* is refused for a taken name, the
 * editor asks whether the Segment it wants exists after all (made since the
 * page loaded). It sends the address the Segment was wanted at (`?starter=`,
 * `?stage=` or `?after=`), and the server derives the wanted Segment as the
 * page does (an offered Starter, a main stage, a live campaign), so no
 * caller's filters are ever compared: Staff with `campaigns` but not
 * `customers` cannot ask whether a Segment searches for someone. Answers the
 * Segment's id and name only. Changes nothing.
 */
export async function findWantedSegmentAction(input: WantedAddress): Promise<{ ok: true; segment: { id: string; name: string } | null } | Failure> {
  await assertAdmin("campaigns");
  const address = WantedAddressSchema.safeParse(input);
  if (!address.success) return NOT_WANTED;
  try {
    const after = "after" in address.data ? afterParam(address.data.after) : null;
    const parent = after ? await getCampaign(supabaseAdmin(), after.id) : null;
    const segments = matchable(await listSegments());
    const { wanted } = newCampaignFromAddress(address.data, segments, parent);
    if (!wanted) return NOT_WANTED;
    const found = findWanted(wanted, segments);
    return { ok: true, segment: found ? { id: found.id, name: found.name } : null };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/**
 * The thumbnails of the Start panel and the palette's Starters tab (slice
 * 08): each Starter, and a blank email (`BLANK_PREVIEW`), as the real
 * renderer draws it on its placeholders for the sample customer, by id. The
 * editor asks once, when the first thumbnail shows. Changes nothing.
 */
export async function previewStarters(): Promise<{ ok: true; previews: Record<string, string> } | Failure> {
  await assertAdmin("campaigns");
  const { origin } = campaignSenderSetup();
  const drafts: [string, CampaignDraft][] = [[BLANK_PREVIEW, EMPTY_CAMPAIGN_DRAFT], ...STARTERS.map((s): [string, CampaignDraft] => [s.id, starterDraft(s)])];
  try {
    return { ok: true, previews: Object.fromEntries(drafts.map(([id, draft]) => [id, renderCampaignPreview(draft, { origin, ...SAMPLE_RECIPIENT }).html])) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
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
 * the editor and named in its inbox row. Its products are the shop's now
 * (slice 07), as a send reads them. `previewAs` is *Preview as* (slice 13): a
 * block campaign's Variables as a sample customer's, or every fallback for a
 * customer with no details. A campaign written before blocks greets the Staff
 * member, as it did. `language` is the editor's Language (slice 17): `zh-CN`
 * shows the 中文 email, as a reader of Chinese gets it.
 */
export async function previewCampaign(
  input: CampaignDraftInput,
  { forceDark = false, previewAs = "customer", language = DEFAULT_LOCALE }: { forceDark?: boolean; previewAs?: PreviewAs; language?: Locale } = {},
): Promise<{ ok: true; subject: string; html: string; text: string; from: string | null } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const parsed = parseDraft(input, CampaignPreviewSchema);
  if (!parsed.ok) return parsed;
  const setup = campaignSenderSetup();
  const recipient = parsed.draft.content
    ? previewAs === "no_details"
      ? NO_DETAILS
      : SAMPLE_RECIPIENT
    : { firstName: await staffFirstName(ctx.memberId) };
  // The images and products the test send shows: one missing is drawn as a hint.
  const shown = await readCampaignRenderData(supabaseAdmin(), parsed.draft.content);
  const locale = isSupportedLocale(language) ? language : DEFAULT_LOCALE;
  const rendered = renderCampaignPreview(parsed.draft, {
    origin: setup.origin,
    ...recipient,
    forceDark: forceDark === true,
    images: shown.images,
    products: productsFor(shown, campaignLanguage(parsed.draft, locale)),
    locale,
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

/** The most products the picker lists for one search. */
const PRODUCT_RESULTS = 24;

/**
 * The products block's picker (PRD-campaign-email-editor slice 07): Listed
 * shop products matching `search`, through the shop's own query
 * (`getProducts`' catalog, so nothing bought through the configurator), each
 * as the email will show it. Changes nothing.
 */
export async function findCampaignProducts(search: string): Promise<{ ok: true; products: CampaignProductCard[] } | Failure> {
  await assertAdmin("campaigns");
  try {
    const { products } = await getProducts({
      status: "active",
      search: typeof search === "string" && search.trim() ? search.trim().slice(0, 80) : undefined,
      limit: PRODUCT_RESULTS,
    });
    return { ok: true, products: (products as ShopProductRow[]).map((p) => shopProductCard(p)).filter((p) => p.listed) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** The products a campaign names, as its cards show them: still Listed or not, by name. Changes nothing. */
export async function describeCampaignProducts(ids: string[]): Promise<{ ok: true; products: CampaignProductCard[] } | Failure> {
  await assertAdmin("campaigns");
  if (!Array.isArray(ids) || ids.length > 40 || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return { ok: false, error: "Those are not products from the shop." };
  }
  try {
    return { ok: true, products: await readCampaignProductCards(supabaseAdmin(), ids) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/**
 * Every check a send must pass, for the page's status panel, the saved
 * email's own among them (PRD-campaign-email-editor slice 11): the editor
 * asks after each save, and shows what they find beside each block.
 * `fresh` is *Check again*: every link is asked again, not read from the last
 * ten minutes' answers. The blocks still marked *Drafted with AI* (slice
 * 09) are counted as advice: the saved content's marks, or `aiDrafted` when
 * passed. Changes nothing.
 */
export async function checkCampaignReadiness(
  id?: string,
  { fresh = false, aiDrafted }: { fresh?: boolean; aiDrafted?: string[] } = {},
): Promise<CampaignReadiness> {
  await assertAdmin("campaigns");
  const campaign = id && UUID.test(id) ? await loadCampaign(id) : null;
  const marked = Array.isArray(aiDrafted) ? aiDrafted.filter((b) => typeof b === "string").slice(0, 40) : undefined;
  return campaignReadiness(campaignSenderSetup(), { campaign: campaign ?? undefined, freshLinks: fresh === true, aiDrafted: marked });
}

/**
 * Sends the saved campaign to up to three addresses, with "[Test]" in the
 * subject. Writes nothing to the ledger. `language` is the one Staff chose
 * (slice 17): `zh-CN` sends the 中文 version.
 */
export async function sendCampaignTestAction(
  id: string,
  to: string[],
  { language = DEFAULT_LOCALE }: { language?: Locale } = {},
): Promise<{ ok: true; sent: number; failed: { to: string; error: string }[] } | Failure> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign || campaign.archivedAt) return NOT_FOUND;
  if (!Array.isArray(to) || to.length > MAX_TEST_RECIPIENTS) {
    return { ok: false, error: `A test goes to at most ${MAX_TEST_RECIPIENTS} addresses.` };
  }
  // A block campaign's test reads as the sample customer gets it (slice 13); one written before blocks greets the Staff member.
  const recipient = campaign.content ? SAMPLE_RECIPIENT : { firstName: await staffFirstName(ctx.memberId) };
  const locale = isSupportedLocale(language) ? language : DEFAULT_LOCALE;
  const result = await sendCampaignTest(campaign, { to: to.filter((t) => typeof t === "string"), ...recipient, ...(locale === DEFAULT_LOCALE ? {} : { locale }) }, campaignSenderSetup());
  if ("refused" in result) return { ok: false, error: result.refused };
  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    // The send limit counts these: Resend counts a test like any send.
    action: CAMPAIGN_TEST_AUDIT_ACTION,
    entityType: "email_campaign",
    entityId: id,
    after: { sent: result.sent.length, failed: result.failed.length, ...(locale === DEFAULT_LOCALE ? {} : { language: locale }) },
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
 * The start asks every link again (slice 11), so one that died since the last
 * check holds the wave.
 */
export async function planCampaignWave(id: string, req: WaveRequest, start = false): Promise<WaveAnswer> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign || campaign.archivedAt) return NOT_FOUND;
  const setup = campaignSenderSetup();
  let result: WavePlanResult;
  try {
    // The Segment may have changed since the campaign was saved.
    const neverSends = await audienceRefusal(id, campaign.segmentId);
    if (neverSends) return { ok: false, error: neverSends };
    result = await planWave(
      campaign,
      { size: Number(req.size), retryFailed: Boolean(req.retryFailed), resume: Boolean(req.resume), freshLinks: start === true },
      setup,
      segmentAudience(campaign),
      await leftOutSegments(campaign.excludeSegmentIds),
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

// ---------------------------------------------------------------------------
// Kept sending (PRD-campaign-audiences slice 10)
// ---------------------------------------------------------------------------

export type KeepSendingAnswer = { ok: true; keepSending: KeepSending } | Failure;

export type KeepSendingChange =
  | { on: true; dailyCap: number }
  | { on: false }
  | { dailyCap: number }
  | { paused: boolean }
  | { holdout: boolean };

const CAP_ERROR = `A day's cap is 1 to ${KEEP_SENDING_MAX_CAP}.`;

/**
 * Turns keep sending on or off, changes its cap, pauses or resumes it. On, and
 * a resume, take the Segments' filters as they are now: what the person
 * approves. Only a campaign a person has sent to can keep sending, and its
 * email and Audience stay as the first wave fixed them. Audited as the person.
 *
 * The holdout (PRD-campaign-audiences slice 11) is turned on here too, once
 * the campaign keeps sending and has been sent to 500 people. Off keeps those
 * already held out from ever getting it.
 */
export async function changeKeepSending(id: string, change: KeepSendingChange): Promise<KeepSendingAnswer> {
  const ctx = await assertAdmin("campaigns");
  const campaign = await loadCampaign(id);
  if (!campaign || campaign.archivedAt) return NOT_FOUND;
  const admin = supabaseAdmin();
  const before = campaign.keepSending ?? null;
  let keepSending: KeepSending;
  let action: string;
  try {
    if ("on" in change && change.on) {
      const dailyCap = parseDailyCap(change.dailyCap);
      if (!dailyCap) return { ok: false, error: CAP_ERROR, fieldErrors: { dailyCap: CAP_ERROR } };
      const blocked = keepSendingBlocker(campaign, (await getCampaignStats(admin, id)).handed);
      if (blocked) return { ok: false, error: blocked };
      keepSending = await saveKeepSending(admin, id, { on: true, dailyCap, segments: await approveSegments(campaign) });
      action = "email_campaign.keep_sending_on";
    } else if ("on" in change) {
      keepSending = await saveKeepSending(admin, id, { on: false });
      action = "email_campaign.keep_sending_off";
    } else if ("holdout" in change) {
      if (change.holdout) {
        const blocked = holdoutBlocker({ keepSending: Boolean(before?.on) }, (await getCampaignStats(admin, id)).handed);
        if (blocked) return { ok: false, error: blocked };
      }
      keepSending = await saveKeepSending(admin, id, change.holdout ? { holdout: true, at: new Date().toISOString() } : { holdout: false });
      action = change.holdout ? "email_campaign.holdout_on" : "email_campaign.holdout_off";
    } else if ("dailyCap" in change) {
      const dailyCap = parseDailyCap(change.dailyCap);
      if (!dailyCap) return { ok: false, error: CAP_ERROR, fieldErrors: { dailyCap: CAP_ERROR } };
      if (!before?.on) return { ok: false, error: "Turn keep sending on first." };
      keepSending = await saveKeepSending(admin, id, { dailyCap });
      action = "email_campaign.keep_sending_cap";
    } else {
      if (!before?.on) return { ok: false, error: "Turn keep sending on first." };
      keepSending = change.paused
        ? await saveKeepSending(admin, id, { paused: true, at: new Date().toISOString() })
        : await saveKeepSending(admin, id, { paused: false, segments: await approveSegments(campaign) });
      action = change.paused ? "email_campaign.keep_sending_pause" : "email_campaign.keep_sending_resume";
    }
  } catch (err) {
    return { ok: false, error: message(err) };
  }
  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action,
    entityType: "email_campaign",
    entityId: id,
    before: before
      ? { on: before.on, daily_cap: before.dailyCap, paused_at: before.pausedAt, paused_reason: before.pausedReason, holdout_at: before.holdoutAt }
      : null,
    after: {
      on: keepSending.on,
      daily_cap: keepSending.dailyCap,
      paused_at: keepSending.pausedAt,
      segments: Object.keys(keepSending.segments),
      holdout_at: keepSending.holdoutAt,
    },
  });
  return { ok: true, keepSending };
}
