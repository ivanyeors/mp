import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { transitionResult } from "@/lib/result-lifecycle";
import { releaseHold } from "@/lib/authorization-hold";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { getSiteSettings } from "@/lib/site-settings";
import {
  SLA_SETTING_KEYS,
  parseSlaSettings,
  planHeldTick,
} from "@/lib/sla-reminders";
import { runShopifyOrderMirrorCatchup } from "@/lib/shopify/order-mirror-catchup";
import { runGaSync } from "@/lib/analytics/journey/ga-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // ponytail: open in dev when CRON_SECRET unset; set CRON_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function sendTelegram(text: string): Promise<"sent" | "skipped" | "failed"> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return "skipped";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: MP_CONFIG_TELEGRAM_CHAT_ID, text }),
      cache: "no-store",
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

async function sendOpsReminderEmail(opts: {
  to: string;
  resultId: string;
  platformUrl: string;
  customerEmail: string | null;
  heldAt: string;
}) {
  const text = [
    "Reminder: a held Result is still waiting for operator review.",
    "",
    `Result: ${opts.resultId}`,
    `Customer: ${opts.customerEmail ?? "—"}`,
    `Held since: ${opts.heldAt}`,
    "",
    `Platform: ${opts.platformUrl}`,
  ].join("\n");

  await getEmailTransport().send({
    to: opts.to,
    from: getDefaultFromAddress(),
    subject: "Held Result still needs review",
    text,
    html: `<p>A held Result is still waiting for operator review.</p>
<p>Result: <code>${opts.resultId}</code><br/>
Customer: ${opts.customerEmail ?? "—"}<br/>
Held since: ${opts.heldAt}</p>
<p><a href="${opts.platformUrl}">Open on platform</a></p>`,
  });
}

async function sendCustomerExpiredEmail(opts: {
  to: string;
  resultId: string;
  accessToken: string | null;
  origin: string;
  productType: string | null;
}) {
  const restartPath =
    opts.productType === "bolster" ? "/mbolster-config" : "/mp-config";
  const restartUrl = `${opts.origin}${restartPath}`;
  const statusUrl = opts.accessToken
    ? `${opts.origin}/results/${opts.resultId}?token=${opts.accessToken}`
    : restartUrl;

  const text = [
    "Your customisation review window has expired and your card authorization hold has been released.",
    "",
    "To continue, start customisation again:",
    restartUrl,
    "",
    `Status page: ${statusUrl}`,
  ].join("\n");

  await getEmailTransport().send({
    to: opts.to,
    from: getDefaultFromAddress(),
    subject: "Your customisation hold has expired",
    text,
    html: `<p>Your customisation review window has expired and your card authorization hold has been released.</p>
<p><a href="${restartUrl}">Start customisation again</a></p>`,
  });
}

/** Daily cron tick (Hobby-safe): remind operators and expire held Results past SLA / before auth dies. */
export async function GET(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const admin = supabaseAdmin();
  const stored = await getSiteSettings([...SLA_SETTING_KEYS]);
  const settings = parseSlaSettings(stored);
  const now = new Date();

  const { data: rows, error } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, created_at, last_reminder_at, payment_intent_id, filling_template_id, customer_email, access_token, product_type",
    )
    .eq("status", "held");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = {
    scanned: rows?.length ?? 0,
    reminded: 0,
    expired: 0,
    errors: [] as string[],
  };

  for (const row of rows ?? []) {
    // Review-only in-store Results have no Stripe hold — SLA expiry does not apply.
    if (!row.payment_intent_id) continue;

    const heldAt = new Date(row.created_at);
    const lastReminderAt = row.last_reminder_at ? new Date(row.last_reminder_at) : null;
    const action = planHeldTick(
      { id: row.id, heldAt, lastReminderAt },
      settings,
      now,
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

      if (life.releaseHold && row.payment_intent_id) {
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

      if (row.customer_email) {
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

  return NextResponse.json({ ok: true, ...summary, settings, catchup, gaSync });
}

export async function POST(req: Request) {
  return GET(req);
}
