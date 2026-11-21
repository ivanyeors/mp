import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneDigits, phonesMatch } from "@/lib/appointments/contacts";
import { normalizePhone } from "@/lib/appointments/phone";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import {
  formatPhone,
  type ContactFacts,
  type OtherNumber,
  type SeenNumberSource,
} from "@/lib/crm/contact-status";

export type InboundRow = { phone: string; received_at: string };

export type ReminderSendRow = {
  phone: string;
  last_outbound_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type SeenPhoneRow = { phone: string | null; at: string; source: SeenNumberSource };

const time = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

const matchKey = (phone: string | null | undefined): string | null => normalizePhone(phone) ?? phone ?? null;

const sameNumber = (a: string | null | undefined, b: string | null | undefined): boolean =>
  phonesMatch(matchKey(a), matchKey(b));

export function matchTail(phone: string | null | undefined): string | null {
  const digits = phoneDigits(matchKey(phone));
  return digits ? digits.slice(-8) : null;
}

export function latestInboundAt(phone: string | null | undefined, rows: readonly InboundRow[]): string | null {
  let latest: InboundRow | null = null;
  for (const r of rows) {
    if (!sameNumber(r.phone, phone)) continue;
    if (!latest || time(r.received_at) > time(latest.received_at)) latest = r;
  }
  return latest?.received_at ?? null;
}

export function latestFailedSendAt(phone: string | null | undefined, rows: readonly ReminderSendRow[]): string | null {
  let success = Number.NEGATIVE_INFINITY;
  let failure: string | null = null;
  for (const r of rows) {
    if (!sameNumber(r.phone, phone)) continue;
    success = Math.max(success, time(r.last_outbound_at));
    if (r.last_error != null && r.last_error_at && time(r.last_error_at) > time(failure)) failure = r.last_error_at;
  }
  return failure && time(failure) > success ? failure : null;
}

export function whatsAppFacts(
  phone: string | null | undefined,
  inbound: readonly InboundRow[],
  reminders: readonly ReminderSendRow[],
): ContactFacts["whatsapp"] {
  const messagedAt = latestInboundAt(phone, inbound);
  const failed = latestFailedSendAt(phone, reminders);
  const failedAt = failed && time(failed) > time(messagedAt) ? failed : null;
  return { messagedAt, failedAt };
}

export function otherNumbersSeen(onFile: string | null | undefined, rows: readonly SeenPhoneRow[]): OtherNumber[] {
  const byNumber = new Map<string, { raw: string; at: string; sources: Map<SeenNumberSource, number> }>();
  for (const r of rows) {
    const raw = r.phone?.trim();
    if (!raw || !phoneDigits(raw)) continue;
    if (onFile?.trim() && sameNumber(raw, onFile)) continue;
    const key = normalizePhone(raw) ?? phoneDigits(raw);
    const seen = byNumber.get(key) ?? { raw, at: r.at, sources: new Map() };
    if (time(r.at) > time(seen.at)) {
      seen.raw = raw;
      seen.at = r.at;
    }
    seen.sources.set(r.source, Math.max(seen.sources.get(r.source) ?? Number.NEGATIVE_INFINITY, time(r.at)));
    byNumber.set(key, seen);
  }
  return [...byNumber.values()]
    .sort((a, b) => time(b.at) - time(a.at))
    .map((s) => ({
      phone: formatPhone(s.raw),
      sources: [...s.sources.entries()].sort((a, b) => b[1] - a[1]).map(([source]) => source),
      lastSeenAt: s.at,
    }));
}

const CANDIDATE_LIMIT = 200;

// ponytail: `whatsapp_inbound` and `appointment_reminders` are read by the number's last digits,
// and `like '%…'` cannot use their phone index, fine while each holds months, not years, of rows.
export async function readContactFacts(
  admin: SupabaseClient,
  customer: { id: string; email: string | null; phone: string | null },
  access: { bookings: boolean; results: boolean },
): Promise<ContactFacts> {
  const phone = customer.phone?.trim() || null;
  const tail = matchTail(phone);
  const email = (customer.email ?? "").toLowerCase().trim();

  const none = Promise.resolve({ data: [] as Record<string, unknown>[], error: null });
  const [inbound, reminders, bookings, resultsById, resultsByEmail] = await Promise.all([
    tail
      ? admin
          .from("whatsapp_inbound")
          .select("phone, received_at")
          .like("phone", `%${tail}`)
          .order("received_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : none,
    tail
      ? admin
          .from("appointment_reminders")
          .select("phone, last_outbound_at, last_error, last_error_at")
          .like("phone", `%${tail}`)
          .order("updated_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : none,
    access.bookings
      ? admin
          .from("readjustment_bookings")
          .select("phone, created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : none,
    access.results
      ? admin
          .from("mp_config_responses")
          .select("customer_phone, created_at")
          .eq("customer_id", customer.id)
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : none,
    access.results && email
      ? admin
          .from("mp_config_responses")
          .select("customer_phone, created_at")
          .ilike("customer_email", escapeLikePattern(email))
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(CANDIDATE_LIMIT)
      : none,
  ]);

  for (const r of [inbound, reminders, bookings, resultsById, resultsByEmail]) {
    if (r.error) throw new Error(r.error.message);
  }

  const seen: SeenPhoneRow[] = [
    ...(bookings.data ?? []).map((b) => ({
      phone: (b.phone as string | null) ?? null,
      at: b.created_at as string,
      source: "booking" as const,
    })),
    ...[...(resultsById.data ?? []), ...(resultsByEmail.data ?? [])].map((r) => ({
      phone: (r.customer_phone as string | null) ?? null,
      at: r.created_at as string,
      source: "result" as const,
    })),
  ];

  return {
    phone,
    whatsapp: phone
      ? whatsAppFacts(phone, (inbound.data ?? []) as InboundRow[], (reminders.data ?? []) as ReminderSendRow[])
      : { messagedAt: null, failedAt: null },
    otherNumbers: access.bookings || access.results ? otherNumbersSeen(phone, seen) : null,
  };
}
