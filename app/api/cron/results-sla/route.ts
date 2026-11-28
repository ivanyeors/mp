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
import { runUrlInspectionsFromEnv } from "@/lib/seo-metrics/inspect-urls";
import sitemap from "@/app/sitemap";
import { runPreOrderRestockNotices } from "@/lib/configurator/pre-order-restock";
import { syncGoogleReviews } from "@/lib/reviews/google-sync";
import { pollPlacesReviews } from "@/lib/reviews/places-poll";
import { runCrmTelegramUpdates } from "@/lib/crm/telegram-updates-server";
import { runAftercareMessages } from "@/lib/aftercare/job";
import { runDraftReminders } from "@/lib/draft-reminders/server";
import { runKeptSendingFromEnv } from "@/lib/email-campaigns/keep-sending-server";
import { runPointsEarn, runPointsMilestones } from "@/lib/points/earn";
import { releaseStalePointReservations } from "@/lib/points/spend";
import { expireStaffOrderLinks } from "@/lib/staff-orders/expire";
import { runSocialInboxMaintenance } from "@/lib/social-inbox/status";
import { runSizingPhotoMoves } from "@/lib/results/sizing-photo-drive";
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
    .in("status", ["held", "assigned"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = {
    scanned: rows?.length ?? 0,
    reminded: 0,
    paymentReminded: 0,
    expired: 0,
    errors: [] as string[],
  };

  const companionFinal = new Map<string, number>();
  const awaitingCompanion = new Set<string>();
  const anchorPaid = new Set<string>();
  for (const r of rows ?? []) {
    if (isCompanion(r) && r.status === "assigned" && r.final_amount != null) {
      companionFinal.set(r.paired_build_id as string, Number(r.final_amount));
    }
    if (isCompanion(r) && r.status === "held") awaitingCompanion.add(r.paired_build_id as string);
    if (r.topup_paid_at && r.paired_build_id === r.id) anchorPaid.add(r.id);
  }
  const endedThisRun = new Set<string>();

  for (const row of rows ?? []) {
    if (endedThisRun.has(row.id)) continue;
    const hasHold = Boolean(row.payment_intent_id);
    const assisted = row.source === "staff_assisted";
    const heldAt = new Date(row.created_at);
    const lastReminderAt = row.last_reminder_at ? new Date(row.last_reminder_at) : null;

    if (row.status === "assigned") {
      if (hasHold && row.topup_paid_at) {
        continue;
      }
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
          continue;
        }
        const pairPlan = await loadEndingPlan(admin, row);
        await cascadeEnding(admin, pairPlan, "expired");
        if (pairPlan.cascadeTo) endedThisRun.add(pairPlan.cascadeTo);

        if (life.releaseHold && pairPlan.releaseHold && row.payment_intent_id) {
          try {
            await releaseHold(row.payment_intent_id);
          } catch {}
        }

        if (row.customer_email && !isCompanion(row)) {
          try {
            await sendCustomerExpiredEmail({
              to: row.customer_email,
              resultId: row.id,
              accessToken: row.access_token,
              origin,
              productType: row.product_type,
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
      if (isCompanion(row) || awaitingCompanion.has(row.id)) continue;
      const assignedAt = row.assigned_at ? new Date(row.assigned_at) : heldAt;
      const plan = planPaymentReminder(
        {
          assignedAt,
          lastReminderAt: row.payment_reminder_last_at
            ? new Date(row.payment_reminder_last_at)
            : null,
          remindersSent: row.payment_reminder_count ?? 0,
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

    if (!hasHold && !assisted) continue;

    const action = planHeldTick(
      { id: row.id, heldAt, lastReminderAt },
      settings,
      now,
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

  let sizingPhotos: Awaited<ReturnType<typeof runSizingPhotoMoves>> | { ok: false; error: string };
  try {
    sizingPhotos = await runSizingPhotoMoves(admin, now);
  } catch (e) {
    sizingPhotos = { ok: false, error: e instanceof Error ? e.message : "sizing photo moves failed" };
  }

  let catchup: Awaited<ReturnType<typeof runShopifyOrderMirrorCatchup>> | { ok: false; error: string };
  try {
    catchup = await runShopifyOrderMirrorCatchup();
  } catch (e) {
    catchup = { ok: false, error: e instanceof Error ? e.message : "catch-up failed" };
  }

  let gaSync: Awaited<ReturnType<typeof runGaSync>> | { ok: false; error: string };
  try {
    gaSync = await runGaSync(admin);
  } catch (e) {
    gaSync = { ok: false, error: e instanceof Error ? e.message : "ga sync failed" };
  }

  let gscIngest: Awaited<ReturnType<typeof runGscIngestFromEnv>> | { ok: false; error: string };
  try {
    gscIngest = await runGscIngestFromEnv(admin);
  } catch (e) {
    gscIngest = { ok: false, error: e instanceof Error ? e.message : "gsc ingest failed" };
    console.error("results-sla: Search Console import failed:", gscIngest.error);
  }

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

  let googleReviews: Awaited<ReturnType<typeof syncGoogleReviews>> | { ok: false; error: string };
  try {
    googleReviews = await syncGoogleReviews({ maxCards: 3 });
  } catch (e) {
    googleReviews = { ok: false, error: e instanceof Error ? e.message : "google reviews sync failed" };
  }

  let placesReviews: Awaited<ReturnType<typeof pollPlacesReviews>> | { ok: false; error: string };
  try {
    placesReviews = await pollPlacesReviews({ maxCards: 5 });
  } catch (e) {
    placesReviews = { ok: false, error: e instanceof Error ? e.message : "google places reviews poll failed" };
  }

  let aftercare: Awaited<ReturnType<typeof runAftercareMessages>> | { ok: false; error: string };
  try {
    aftercare = await runAftercareMessages(admin, { origin, now });
  } catch (e) {
    aftercare = { ok: false, error: e instanceof Error ? e.message : "aftercare messages failed" };
  }

  let draftReminders: Awaited<ReturnType<typeof runDraftReminders>> | { ok: false; error: string };
  try {
    draftReminders = await runDraftReminders(admin, { origin, now });
  } catch (e) {
    draftReminders = { ok: false, error: e instanceof Error ? e.message : "draft reminders failed" };
  }

  let keptSending: Awaited<ReturnType<typeof runKeptSendingFromEnv>> | { ok: false; error: string };
  try {
    keptSending = await runKeptSendingFromEnv(now);
  } catch (e) {
    keptSending = { ok: false, error: e instanceof Error ? e.message : "kept sending failed" };
  }

  const points = await runPointsEarn(admin, now);

  const pointsMilestones = await runPointsMilestones(admin, now);

  const pointsReservations = await releaseStalePointReservations(admin, now);

  const staffOrderLinks = await expireStaffOrderLinks(admin, now);

  let crmTelegram: Awaited<ReturnType<typeof runCrmTelegramUpdates>> | { ok: false; error: string };
  try {
    crmTelegram = await runCrmTelegramUpdates(admin, { origin, now });
  } catch (e) {
    crmTelegram = { ok: false, error: e instanceof Error ? e.message : "crm telegram updates failed" };
  }

  let socialInbox: Awaited<ReturnType<typeof runSocialInboxMaintenance>> | { ok: false; error: string };
  try {
    socialInbox = await runSocialInboxMaintenance();
  } catch (e) {
    socialInbox = { ok: false, error: e instanceof Error ? e.message : "social inbox maintenance failed" };
  }

  let urlInspections: Awaited<ReturnType<typeof runUrlInspectionsFromEnv>> | { ok: false; error: string };
  try {
    urlInspections = await runUrlInspectionsFromEnv(admin, (await sitemap()).map((entry) => entry.url));
  } catch (e) {
    urlInspections = { ok: false, error: e instanceof Error ? e.message : "url inspections failed" };
  }
  if ("error" in urlInspections && urlInspections.error) {
    console.error("results-sla: Search Console page inspection failed:", urlInspections.error);
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    settings,
    catchup,
    gaSync,
    gscIngest,
    urlInspections,
    preOrderRestock,
    googleReviews,
    placesReviews,
    aftercare,
    draftReminders,
    keptSending,
    points,
    pointsMilestones,
    pointsReservations,
    staffOrderLinks,
    crmTelegram,
    socialInbox,
    sizingPhotos,
  });
}

export async function POST(req: Request) {
  return GET(req);
}
