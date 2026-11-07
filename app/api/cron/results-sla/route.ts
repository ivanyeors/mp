import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/auth/secret";
import { supabaseAdmin } from "@/lib/supabase/server";
import { transitionResult } from "@/lib/result-lifecycle";
import { releaseHold } from "@/lib/authorization-hold";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { renderHeldResultReminderEmail } from "@/lib/email/ops";
import { loadEmailCopy } from "@/lib/email/copy-store";
import {
  RESULT_EMAIL_COPY,
  renderBalanceDueReminderEmail,
  renderHoldExpiredEmail,
} from "@/lib/email/results";
import { getSiteSettings } from "@/lib/site-settings";
import { sendTelegram } from "@/lib/telegram/notify";
import { needsCustomerFinish } from "@/lib/results/needs-customer-finish";
import { isCompanion } from "@/lib/results/paired-build";
import { cascadeEnding, loadEndingPlan, notifyCompanionRemoved } from "@/lib/results/pair-ending";
import {
  SLA_SETTING_KEYS,
  authExpiresAt,
  parseSlaSettings,
  planHeldTick,
} from "@/lib/sla-reminders";
import { runShopifyOrderMirrorCatchup } from "@/lib/shopify/order-mirror-catchup";
import { runGaSync } from "@/lib/analytics/journey/ga-sync";
import { runGscIngestFromEnv } from "@/lib/seo-metrics/ingest-gsc";
import { runPreOrderRestockNotices } from "@/lib/configurator/pre-order-restock";
import { syncGoogleReviews } from "@/lib/reviews/google-sync";
import { pollPlacesReviews } from "@/lib/reviews/places-poll";
import { runCrmTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import { runAftercareMessages } from "@/lib/aftercare/job";
import { runKeptSendingFromEnv } from "@/lib/email-campaigns/keep-sending-server";
import { runPointsEarn, runPointsMilestones } from "@/lib/points/earn";
import { releaseStalePointReservations } from "@/lib/points/spend";
import { expireStaffOrderLinks } from "@/lib/staff-orders/expire";
import { runSocialInboxMaintenance } from "@/lib/social-inbox/status";
import {
  parsePaymentReminderSettings,
  PAYMENT_REMINDER_SETTING_KEYS,
  planPaymentReminder,
} from "@/lib/payment-reminders";
import { getPublicOrigin } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  return secretMatches(`Bearer ${secret}`, req.headers.get("authorization"));
}


/** Best-effort ops reminder. Rendering lives in lib/email/ops.ts. */
async function sendOpsReminderEmail(opts: {
  to: string;
  resultId: string;
  platformUrl: string;
  customerEmail: string | null;
  heldAt: string;
}) {
  await getEmailTransport().send({
    to: opts.to,
    from: getDefaultFromAddress(),
    ...renderHeldResultReminderEmail(opts),
  });
}

/** Best-effort customer notice that the authorization hold was released. */
async function sendCustomerExpiredEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string | null;
  origin: string;
  productType: string | null;
  reason?: "unreviewed" | "unpaid";
}) {
  const copy = await loadEmailCopy(RESULT_EMAIL_COPY.hold_expired);
  await getEmailTransport().send({
    to: opts.to,
    from: getDefaultFromAddress(),
    ...renderHoldExpiredEmail(opts, copy),
  });
}

/**
 * Daily cron tick (Hobby-safe). Three jobs: remind operators about held Results,
 * expire them past SLA / before the authorization dies, and chase customers who
 * have an assigned build they have not paid for — expiring that too once its
 * hold lapses.
 */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = getPublicOrigin(req);
  const admin = supabaseAdmin();
  const stored = await getSiteSettings([
    ...SLA_SETTING_KEYS,
    ...PAYMENT_REMINDER_SETTING_KEYS,
  ]);
  const settings = parseSlaSettings(stored);
  const paymentReminders = parsePaymentReminderSettings(stored);
  const now = new Date();

  const { data: rows, error } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, created_at, last_reminder_at, payment_intent_id, filling_template_id, customer_email, access_token, product_type, final_amount, currency, shipping_address, assigned_at, payment_reminder_last_at, payment_reminder_count, topup_paid_at, paired_build_id, authorized_amount",
    )
    // `assigned` joins the scan because a Result sitting there owes a Balance
    // payment and nothing else in the system would ever chase it (ADR 0016).
    // Rows WITH a hold are chased too — they are waiting on the same Accept and
    // their authorization is dying — but only until that authorization dies;
    // past it result-stage badges them hold_rotting for a human.
    .in("status", ["held", "assigned"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = {
    scanned: rows?.length ?? 0,
    reminded: 0,
    /** Customers nudged that their finished build is unpaid. */
    paymentReminded: 0,
    expired: 0,
    errors: [] as string[],
  };

  // A Paired build (ADR 0026) is chased and paid as one: its anchor's reminder
  // quotes both builds, so each anchor's total adds its assigned companion's.
  const companionFinal = new Map<string, number>();
  /** Anchors whose Mbolster is still being built: Accept would be refused. */
  const awaitingCompanion = new Set<string>();
  /** Anchors with a paid Balance payment: it covered their Mbolster too. */
  const anchorPaid = new Set<string>();
  for (const r of rows ?? []) {
    if (isCompanion(r) && r.status === "assigned" && r.final_amount != null) {
      companionFinal.set(r.paired_build_id as string, Number(r.final_amount));
    }
    if (isCompanion(r) && r.status === "held") awaitingCompanion.add(r.paired_build_id as string);
    if (r.topup_paid_at && r.paired_build_id === r.id) anchorPaid.add(r.id);
  }
  /** Members ended by their anchor this run, so the loop does not end them twice. */
  const endedThisRun = new Set<string>();

  for (const row of rows ?? []) {
    if (endedThisRun.has(row.id)) continue;
    const hasHold = Boolean(row.payment_intent_id);
    const assisted = row.source === "staff_assisted";
    const heldAt = new Date(row.created_at);
    const lastReminderAt = row.last_reminder_at ? new Date(row.last_reminder_at) : null;

    // An assigned Result is waiting on the CUSTOMER, not on us: the build is
    // finished and priced and nobody has paid for it. Remind them and move on —
    // there is no operator action outstanding.
    //
    // This cadence is its own (lib/payment-reminders) with its own columns. It
    // used to borrow the operator SLA's interval and `last_reminder_at`, which
    // made the first customer chase up to one operator-interval late and welded
    // the two schedules together.
    if (row.status === "assigned") {
      // The hold is dead: end it rather than leaving the row in `assigned`
      // forever, still offering the customer a Pay button whose capture can no
      // longer succeed. Nothing else closes this — the SLA force-expire below
      // only ever covered `held`, so an assigned Result whose customer went
      // quiet had no ending at all. result-stage badges these hold_rotting from
      // day 6, which is the day of warning staff get before this fires.
      //
      // Money already moved is never expired here. A customer who paid a top-up
      // and never got back to finish accepting sits `assigned` with
      // `topup_paid_at` stamped by the webhook, and result-stage flags that
      // `topup_unsettled` — paid, no Order — for a human to settle. Expiring it
      // would close the row, take that alarm off the queue, and email someone
      // who has paid us that nothing was charged. Accept still knows how to
      // settle from the stored intent; leave it for that.
      if (hasHold && row.topup_paid_at) {
        continue;
      }
      // Nor the Mbolster that same payment covered (ADR 0026).
      if (isCompanion(row) && anchorPaid.has(row.paired_build_id as string)) {
        continue;
      }
      if (hasHold && now.getTime() >= authExpiresAt(heldAt).getTime()) {
        const life = transitionResult(
          {
            status: "assigned",
            filling_template_id: row.filling_template_id,
            payment_intent_id: row.payment_intent_id,
          },
          { action: "expire" },
        );
        if (!life.ok) {
          summary.errors.push(`${row.id}: ${life.error}`);
          continue;
        }

        // Claim the row FIRST, and only then touch Stripe or the customer.
        //
        // CAS on `assigned` so an Accept in flight wins. Ordering is the whole
        // point: cancelling the PaymentIntent before this would let a tick land
        // between accept's status claim and its capture, killing a hold for an
        // order that is going ahead. `.select()` because a zero-row match is not
        // an error — it means someone else moved the row, and everything below
        // would then be acting on a sale that is no longer ours to end.
        const { data: expired, error: expireErr } = await admin
          .from("mp_config_responses")
          .update({ status: life.status })
          .eq("id", row.id)
          .eq("status", "assigned")
          .select("id");
        if (expireErr) {
          summary.errors.push(`${row.id}: ${expireErr.message}`);
          continue;
        }
        if (!expired?.length) {
          // Accept got there first. Nothing to report: this is the race
          // resolving correctly.
          continue;
        }
        // A Paired build's anchor takes its companion with it; a companion keeps
        // the hold while the anchor still lives (ADR 0026).
        const pairPlan = await loadEndingPlan(admin, row);
        await cascadeEnding(admin, pairPlan, "expired");
        if (pairPlan.cascadeTo) endedThisRun.add(pairPlan.cascadeTo);

        // Best-effort, and expected to fail: Stripe rejects cancelling a
        // PaymentIntent that is no longer cancellable, and we are here precisely
        // because the authorization has lapsed. Harmless either way — Stripe
        // releases an uncaptured hold by itself at seven days, so a cancel that
        // does not land costs the customer nothing.
        if (life.releaseHold && pairPlan.releaseHold && row.payment_intent_id) {
          try {
            await releaseHold(row.payment_intent_id);
          } catch {
            /* already released at Stripe — that is why we are expiring it */
          }
        }

        // A Paired build's Mbolster and Mpillow lapse together on one hold; the
        // Mpillow's email tells that story, once.
        if (row.customer_email && !isCompanion(row)) {
          try {
            await sendCustomerExpiredEmail({
              to: row.customer_email,
              resultId: row.id,
              accessToken: row.access_token,
              origin,
              productType: row.product_type,
              // Not "we never reviewed it" — it was built and priced. The
              // customer simply never paid.
              reason: "unpaid",
            });
          } catch (e) {
            summary.errors.push(
              `${row.id}: unpaid-expiry email ${e instanceof Error ? e.message : "failed"}`,
            );
          }
        }

        summary.expired += 1;
        continue;
      }

      if (!row.customer_email) continue;
      // The companion is accepted, and so chased, through its anchor; an anchor
      // waiting on its Mbolster cannot be accepted yet, so nothing is due.
      if (isCompanion(row) || awaitingCompanion.has(row.id)) continue;
      // A hold no longer skips the chase. Both kinds of assigned Result are
      // waiting on the same customer action — Accept — and the held one is the
      // more urgent of the two, since its authorization dies at 7 days.
      const assignedAt = row.assigned_at ? new Date(row.assigned_at) : heldAt;
      const plan = planPaymentReminder(
        {
          assignedAt,
          lastReminderAt: row.payment_reminder_last_at
            ? new Date(row.payment_reminder_last_at)
            : null,
          remindersSent: row.payment_reminder_count ?? 0,
          // A hold dies 7 days after submit and nothing expires an ASSIGNED
          // row, so the chase has to stop itself. Past that point "pay now,
          // nothing charged yet" is false: Accept captures the hold, and
          // capturing a dead one fails. result-stage already badges these
          // hold_rotting for a human to pick up.
          notAfter: hasHold ? authExpiresAt(heldAt) : null,
        },
        paymentReminders,
        now,
      );
      if (plan !== "remind") continue;
      try {
        const copy = await loadEmailCopy(RESULT_EMAIL_COPY.balance_due);
        await getEmailTransport().send({
          to: row.customer_email,
          from: getDefaultFromAddress(),
          ...renderBalanceDueReminderEmail(
            {
              origin,
              resultId: row.id,
              accessToken: row.access_token,
              productType: row.product_type,
              amount:
                row.final_amount != null
                  ? Number(row.final_amount) + (companionFinal.get(row.id) ?? 0)
                  : null,
              currency: row.currency ?? "SGD",
              needsFinish: needsCustomerFinish(row),
            },
            copy,
          ),
        });
        // Its own clock and counter — `last_reminder_at` stays the operator SLA's,
        // so moving one cadence no longer drags the other with it.
        //
        // The error is NOT ignorable. The email has already gone; if this write
        // fails the count stays put and the due date stays in the past, so every
        // daily tick re-sends and maxReminders stops meaning anything. Surface it
        // rather than counting a send that the schedule will repeat.
        const { error: markErr } = await admin
          .from("mp_config_responses")
          .update({
            payment_reminder_last_at: now.toISOString(),
            payment_reminder_count: (row.payment_reminder_count ?? 0) + 1,
          })
          .eq("id", row.id);
        if (markErr) {
          summary.errors.push(
            `${row.id}: balance-due email sent but counter not advanced (${markErr.message}) — it will re-send`,
          );
        } else {
          summary.paymentReminded += 1;
        }
      } catch (e) {
        summary.errors.push(
          `${row.id}: balance-due email ${e instanceof Error ? e.message : "failed"}`,
        );
      }
      continue;
    }

    // Held, no hold. An Assisted customisation belongs in the operator queue and
    // is chased below; an in-store `manual` measurement is still not chased —
    // nobody promised that customer anything (result-stage: measurement_residue).
    if (!hasHold && !assisted) continue;

    const action = planHeldTick(
      { id: row.id, heldAt, lastReminderAt },
      settings,
      now,
      // No hold means no Stripe authorization dying, so nothing to expire before.
      hasHold,
    );

    if (action === "none") continue;

    if (action === "expire") {
      const life = transitionResult(
        {
          status: "held",
          filling_template_id: row.filling_template_id,
          payment_intent_id: row.payment_intent_id,
        },
        { action: "expire" },
      );
      if (!life.ok) {
        summary.errors.push(`${row.id}: ${life.error}`);
        continue;
      }

      // A Paired build's companion expiring keeps the hold its anchor still
      // needs; the anchor expiring frees it and ends the companion (ADR 0026).
      const pairPlan = await loadEndingPlan(admin, row);
      if (life.releaseHold && pairPlan.releaseHold && row.payment_intent_id) {
        try {
          await releaseHold(row.payment_intent_id);
        } catch (e) {
          summary.errors.push(
            `${row.id}: release ${e instanceof Error ? e.message : "failed"}`,
          );
          continue;
        }
      }

      const { error: updateErr } = await admin
        .from("mp_config_responses")
        .update({ status: life.status })
        .eq("id", row.id)
        .eq("status", "held");

      if (updateErr) {
        summary.errors.push(`${row.id}: ${updateErr.message}`);
        continue;
      }
      await cascadeEnding(admin, pairPlan, "expired");
      if (pairPlan.cascadeTo) endedThisRun.add(pairPlan.cascadeTo);

      // An Mbolster lapsing while its Mpillow carries on released nothing: say
      // it was removed (and, if the Mpillow was waiting on it, that it is ready).
      if (isCompanion(row) && !pairPlan.releaseHold) {
        const sent = await notifyCompanionRemoved(admin, {
          companion: row,
          partner: pairPlan.partner,
          origin,
        });
        if (sent === "failed") summary.errors.push(`${row.id}: paired removal email failed`);
      } else if (row.customer_email) {
        try {
          await sendCustomerExpiredEmail({
            to: row.customer_email,
            resultId: row.id,
            accessToken: row.access_token,
            origin,
            productType: row.product_type,
          });
        } catch (e) {
          summary.errors.push(
            `${row.id}: customer email ${e instanceof Error ? e.message : "failed"}`,
          );
        }
      }

      summary.expired += 1;
      continue;
    }

    // remind
    const platformUrl = `${origin}/settings/results/${row.id}`;
    if (settings.remindTelegram) {
      const tg = await sendTelegram(
        [
          "⏰ Reminder: held Result still needs review",
          `Customer: ${row.customer_email ?? "—"}`,
          `Held since: ${heldAt.toISOString()}`,
          "",
          `Platform: ${platformUrl}`,
        ].join("\n"),
      );
      if (tg === "failed") summary.errors.push(`${row.id}: telegram failed`);
    }

    if (settings.remindEmail && settings.opsEmail) {
      try {
        await sendOpsReminderEmail({
          to: settings.opsEmail,
          resultId: row.id,
          platformUrl,
          customerEmail: row.customer_email,
          heldAt: heldAt.toISOString(),
        });
      } catch (e) {
        summary.errors.push(
          `${row.id}: ops email ${e instanceof Error ? e.message : "failed"}`,
        );
      }
    }

    await admin
      .from("mp_config_responses")
      .update({ last_reminder_at: now.toISOString() })
      .eq("id", row.id);

    summary.reminded += 1;
  }

  // Chain: same request after SLA work — Hobby stays at 2 vercel.json crons.
  // Manual ops: POST /api/cron/shopify-order-mirror-catchup with CRON_SECRET.
  let catchup: Awaited<ReturnType<typeof runShopifyOrderMirrorCatchup>> | { ok: false; error: string };
  try {
    catchup = await runShopifyOrderMirrorCatchup();
  } catch (e) {
    catchup = { ok: false, error: e instanceof Error ? e.message : "catch-up failed" };
  }

  // Chain: GA staging sync (fixture when BQ creds absent — see ga-sync.ts).
  let gaSync: Awaited<ReturnType<typeof runGaSync>> | { ok: false; error: string };
  try {
    gaSync = await runGaSync(admin);
  } catch (e) {
    gaSync = { ok: false, error: e instanceof Error ? e.message : "ga sync failed" };
  }

  // Chain: Search Console snapshot → seo_daily_metrics (PRD-search-visibility
  // slice 01). No-op until the GOOGLE_SEARCH_CONSOLE_* / service-account env is set.
  let gscIngest: Awaited<ReturnType<typeof runGscIngestFromEnv>> | { ok: false; error: string };
  try {
    gscIngest = await runGscIngestFromEnv(admin);
  } catch (e) {
    gscIngest = { ok: false, error: e instanceof Error ? e.message : "gsc ingest failed" };
  }

  // Chain: Pre-order restock emails when inventory recovered (slice 07).
  // Manual ops: GET/POST /api/cron/preorder-restock with CRON_SECRET.
  let preOrderRestock:
    | Awaited<ReturnType<typeof runPreOrderRestockNotices>>
    | { ok: false; error: string };
  try {
    preOrderRestock = await runPreOrderRestockNotices(admin, { origin });
  } catch (e) {
    preOrderRestock = {
      ok: false,
      error: e instanceof Error ? e.message : "pre-order restock failed",
    };
  }

  // Chain: Google review catch-up (PRD-google-review-replies). Pub/Sub push is
  // the real-time path; this finds anything a dropped notification missed.
  // No-op until the GOOGLE_BUSINESS_* env is set. Manual ops: GET/POST
  // /api/cron/google-reviews-sync with CRON_SECRET.
  let googleReviews: Awaited<ReturnType<typeof syncGoogleReviews>> | { ok: false; error: string };
  try {
    googleReviews = await syncGoogleReviews({ maxCards: 3 });
  } catch (e) {
    googleReviews = { ok: false, error: e instanceof Error ? e.message : "google reviews sync failed" };
  }

  // Chain: Google reviews through the Places API until the Business Profile
  // API is approved (ADR 0035). Reads once a week, by its last successful read;
  // each read is billed and counted against a monthly cap first. Stands down
  // once GOOGLE_BUSINESS_* is set. Manual ops: GET /api/cron/google-places-reviews.
  let placesReviews: Awaited<ReturnType<typeof pollPlacesReviews>> | { ok: false; error: string };
  try {
    placesReviews = await pollPlacesReviews({ maxCards: 5 });
  } catch (e) {
    placesReviews = { ok: false, error: e instanceof Error ? e.message : "google places reviews poll failed" };
  }

  // Chain: Aftercare messages (PRD customer-crm slices 07 and 08): the Review
  // request, 14 days after delivery, and the yearly Check-up reminder for a
  // Premium Mpillow. Every send is claimed in a ledger first, so a manual
  // re-run messages nobody twice. Each is off until its switch is turned on
  // (review_requests_enabled, checkup_reminders_enabled); until then it only
  // counts.
  let aftercare: Awaited<ReturnType<typeof runAftercareMessages>> | { ok: false; error: string };
  try {
    aftercare = await runAftercareMessages(admin, { origin, now });
  } catch (e) {
    aftercare = { ok: false, error: e instanceof Error ? e.message : "aftercare messages failed" };
  }

  // Chain: kept sending (PRD-campaign-audiences slice 10, ADR 0040 (6)). One
  // Wave a day for each campaign a person set to keep sending, at most its
  // cap, through the same claim as a Staff Wave, so consent and the Rest
  // period apply as there; it leaves 30 of Resend's day for tests and Staff
  // Waves, and stops at the pause rule or a 429. Off until a person turns it
  // on for a campaign; a manual re-run never passes a campaign's cap.
  let keptSending: Awaited<ReturnType<typeof runKeptSendingFromEnv>> | { ok: false; error: string };
  try {
    keptSending = await runKeptSendingFromEnv(now);
  } catch (e) {
    keptSending = { ok: false, error: e instanceof Error ? e.message : "kept sending failed" };
  }

  // Chain: earned points (PRD-loyalty-points slice 03, ADR 0030 d). One `earn`
  // entry for each Order whose return window has closed; nothing while points
  // are off. A manual re-run writes nothing twice. It never throws: a failure
  // comes back as `{ error }` and tomorrow's run writes what today's missed.
  const points = await runPointsEarn(admin, now);

  // Chain: milestone bonuses (PRD-loyalty-points slice 09, ADR 0030 w), right
  // after the release, so a bonus lands on the same run as the points that
  // reached it. One per milestone reached, never twice; nothing while points
  // are off or before the launch. Never throws.
  const pointsMilestones = await runPointsMilestones(admin, now);

  // Chain: points reserved by a Checkout that was never paid (PRD-loyalty-points
  // slice 04, ADR 0030 j). The webhook gives them back when Stripe says the
  // session expired or failed; this catches what it missed. Never throws.
  const pointsReservations = await releaseStalePointReservations(admin, now);

  // Chain: Staff orders whose Payment link expired unpaid are cancelled (ADR 0048),
  // closing any Checkout still open first. Never throws.
  const staffOrderLinks = await expireStaffOrderLinks(admin, now);

  // Chain: CRM Telegram updates (PRD customer-crm slice 14): Google reviews to
  // match, New sign-ups and the Weekly summary. Each goes at most once per
  // period by compare-and-set, so a manual re-run posts nothing twice. After
  // the Google review catch-up, so today's reviews are counted.
  let crmTelegram: Awaited<ReturnType<typeof runCrmTelegramUpdates>> | { ok: false; error: string };
  try {
    crmTelegram = await runCrmTelegramUpdates(admin, { origin, now });
  } catch (e) {
    crmTelegram = { ok: false, error: e instanceof Error ? e.message : "crm telegram updates failed" };
  }

  // Chain: customer messages (PRD-social-inbox). Re-cards any message a
  // webhook stored but could not post to Telegram, and refreshes the TikTok
  // token so its rotating refresh token never lapses. No-op until connected.
  let socialInbox: Awaited<ReturnType<typeof runSocialInboxMaintenance>> | { ok: false; error: string };
  try {
    socialInbox = await runSocialInboxMaintenance();
  } catch (e) {
    socialInbox = { ok: false, error: e instanceof Error ? e.message : "social inbox maintenance failed" };
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    settings,
    catchup,
    gaSync,
    gscIngest,
    preOrderRestock,
    googleReviews,
    placesReviews,
    aftercare,
    keptSending,
    points,
    pointsMilestones,
    pointsReservations,
    staffOrderLinks,
    crmTelegram,
    socialInbox,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
