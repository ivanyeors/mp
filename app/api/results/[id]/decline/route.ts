import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { transitionResult } from "@/lib/result-lifecycle";
import { releaseHold } from "@/lib/authorization-hold";
import { getEmailTransport } from "@/lib/email";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { RESULT_EMAIL_COPY, renderResultDeclinedEmail } from "@/lib/email/results";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { authorizeResultAccess } from "@/lib/results/access";
import { cascadeEnding, companionLockReason, loadEndingPlan } from "@/lib/results/pair-ending";
import { getPublicOrigin } from "@/lib/site-url";
import { sendTelegram } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const token = parsed.data.token ?? null;
  const admin = supabaseAdmin();

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, filling_template_id, payment_intent_id, access_token, customer_id, customer_email, order_id, product_type, authorized_amount, currency, assigned_size, assigned_tier, assigned_length, final_amount, paired_build_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await authorizeResultAccess(row, token);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (row.order_id || row.status === "captured" || row.status === "accepted") {
    return NextResponse.json(
      {
        error:
          "Cannot decline after Accept. Cancel/refund is blocked until the Order is delivered.",
      },
      { status: 400 },
    );
  }

  // "Remove Mbolster" is refused once money has moved for the whole pair.
  const locked = await companionLockReason(admin, row);
  if (locked) return NextResponse.json({ error: locked, code: "pair_paid" }, { status: 409 });

  const life = transitionResult(
    {
      status: (row.status as "assigned") ?? "assigned",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
    },
    { action: "decline" },
  );
  if (!life.ok) {
    return NextResponse.json({ error: life.error }, { status: 400 });
  }

  // A Paired build shares one hold (ADR 0026): declining the Mbolster keeps it
  // for the Mpillow, and declining the Mpillow declines the Mbolster with it.
  const plan = await loadEndingPlan(admin, row);
  const releasesHold = life.releaseHold && plan.releaseHold;

  if (releasesHold && row.payment_intent_id) {
    try {
      await releaseHold(row.payment_intent_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to release hold";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const { error: updateErr } = await admin
    .from("mp_config_responses")
    .update({ status: life.status })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }
  await cascadeEnding(admin, plan, "declined");

  const restartPath =
    row.product_type === "bolster" ? "/mbolster-config" : "/mp-config";

  // Confirm the cancellation to the customer.
  //
  // Decline used to be silent: the status flipped, the hold was released, and
  // nothing said so. The one thing a customer wants in writing after cancelling
  // is that no money was taken, so the email says it explicitly and names the
  // released hold when there was one.
  //
  // Best-effort by design. The Result is already declined and the hold already
  // released at this point; failing the request over an email would tell the
  // customer their cancellation did not work when it did.
  let emailStatus: "sent" | "failed" | "skipped" = "skipped";
  if (row.customer_email) {
    try {
      const copy = await loadEmailCopy(RESULT_EMAIL_COPY.declined);
      await getEmailTransport().send({
        to: row.customer_email,
        from: getDefaultFromAddress(),
        ...renderResultDeclinedEmail(
          {
            origin: getPublicOrigin(req),
            resultId: id,
            accessToken: row.access_token,
            productType: row.product_type,
            // Only claim a release when one actually happened, and name what it
            // freed: the whole hold, which for a pair covered both builds.
            releasedAmount: releasesHold ? plan.intentAmount : null,
            currency: row.currency ?? "SGD",
          },
          copy,
        ),
      });
      emailStatus = "sent";
    } catch (e) {
      console.error("Result declined email failed", e);
      emailStatus = "failed";
    }
  }

  // And tell the build team, in the same group the held and assigned notices go
  // to. A cancellation is the one lifecycle move nobody was watching for: it
  // takes work out of the queue rather than putting it in, so without this the
  // first anyone knows is a build that quietly stopped mattering.
  const currency = row.currency ?? "SGD";
  const amount =
    row.final_amount != null
      ? Number(row.final_amount)
      : row.authorized_amount != null
        ? Number(row.authorized_amount)
        : null;
  const spec = [row.assigned_size, row.assigned_tier, row.assigned_length]
    .filter(Boolean)
    .join(" · ");

  const telegramStatus = await sendTelegram(
    [
      "🚫 Customer cancelled a build",
      spec || "(no assignment recorded)",
      `Email: ${row.customer_email ?? "—"}`,
      amount != null ? `Was: ${currency} ${amount.toFixed(2)}` : "No amount recorded",
      releasesHold
        ? "Authorization hold released."
        : plan.cascadeTo == null && row.paired_build_id && row.payment_intent_id
          ? "Paired Mbolster dropped — the hold stays for its Mpillow."
          : "No card was taken.",
      ...(plan.cascadeTo ? [`Its paired Mbolster was declined with it: ${getPublicOrigin(req)}/settings/results/${plan.cascadeTo}`] : []),
      "",
      `Platform: ${getPublicOrigin(req)}/settings/results/${id}`,
    ].join("\n"),
  );

  if (telegramStatus === "failed") {
    // Symmetry with the email path above. `telegramStatus` alone travels in a
    // response body nobody reads, so a revoked bot token would stop every
    // cancellation notice silently.
    console.error("Result declined Telegram notice failed", { resultId: id });
  }

  return NextResponse.json({
    ok: true,
    status: life.status,
    holdReleased: releasesHold,
    restartPath,
    emailStatus,
    telegramStatus,
  });
}
