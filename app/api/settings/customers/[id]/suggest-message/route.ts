import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { actingProfile } from "@/lib/staff/working-as";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { nextStep } from "@/lib/crm/next-step";
import { readNextStepFacts } from "@/lib/crm/next-step-server";
import { readCustomerReviews } from "@/lib/crm/google-review-match-server";
import { loadTimeline } from "@/lib/crm/timeline/load";
import {
  HISTORY_LINES,
  MESSAGE_CHANNELS,
  MESSAGE_INTENTS,
  suggestMessage,
  type SuggestMessageInput,
} from "@/lib/crm/suggest-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One Claude call; the same room a review draft gets.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Schema = z.object({ channel: z.enum(MESSAGE_CHANNELS), intent: z.enum(MESSAGE_INTENTS) }).strict();

/**
 * POST /api/settings/customers/[id]/suggest-message — `{ channel, intent }`: a
 * drafted email or WhatsApp message for the Journey's composer
 * (PRD-customer-page-journey slice 05). Needs `customers-edit`.
 *
 * Nothing is sent and nothing is saved: the Staff member edits the draft and
 * sends it from their own Gmail or WhatsApp. What Claude is told is read here,
 * never taken from the browser: the customer's first name, the newest timeline
 * entries this viewer may see (one line each), the Next step, and their latest
 * Linked Google review when the message is about it.
 *
 * Answers `{ ok, subject, body }`. The Audit Log names the channel and the
 * intent, never the draft.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose what the message is about." }, { status: 400 });
  const { channel, intent } = parsed.data;

  const admin = supabaseAdmin();
  const { data: customer, error } = await admin
    .from("customers")
    .select("id, email, first_name")
    .eq("id", id)
    .maybeSingle<{ id: string; email: string | null; first_name: string | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  // Context only: a read that fails leaves its part out and the draft still comes.
  const [me, timeline, step, reviews] = await Promise.all([
    actingProfile(ctx.memberId).catch(() => null),
    loadTimeline({ customer: { id: customer.id, email: customer.email }, viewer: ctx, groups: null, after: null, limit: HISTORY_LINES }).catch(
      () => null,
    ),
    readNextStepFacts(admin, id)
      .then((facts) => (facts ? nextStep(facts, new Date()) : null))
      .catch(() => null),
    intent === "review" ? readCustomerReviews(admin, id).catch(() => null) : null,
  ]);

  const latest = reviews?.google[0] ?? null;
  const input: SuggestMessageInput = {
    channel,
    intent,
    firstName: customer.first_name,
    staffName: me?.name ?? null,
    nextStep: step?.text ?? null,
    history: (timeline?.entries ?? []).map((e) => ({ on: formatAdminDateMY(e.at), line: e.summary })),
    review: latest ? { rating: latest.rating, comment: latest.comment, on: formatAdminDateMY(latest.reviewedAt) } : null,
  };

  const result = await suggestMessage(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  await recordAdminAction({
    actor: ctx,
    action: "customer_message.suggest",
    entityType: "customer",
    entityId: id,
    after: { channel, intent },
  });
  return NextResponse.json({ ok: true, subject: result.message.subject, body: result.message.body });
}
