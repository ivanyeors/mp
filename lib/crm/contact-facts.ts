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

/**
 * The parts of Contact status that take phone matching (PRD customer-crm
 * slice 11): whether the number on file has ever messaged us on WhatsApp,
 * whether our last WhatsApp to it failed, and the other numbers a Customer has
 * given on their bookings and Results. Resolved for one Customer on their
 * page, never in a list query: `whatsapp_inbound` and `appointment_reminders`
 * are keyed by phone with no Customer link, and `phonesMatch` is loose.
 *
 * Two numbers are the same when `phonesMatch` says so of their normalised
 * forms (`normalizePhone`), so a local eight digits on file is Singapore's.
 *
 * Server-only (`phonesMatch` lives beside the Google People client). The pure
 * resolvers are exported for tests; `readContactFacts` reads and applies them.
 */

/** A row of `whatsapp_inbound`: proof a person used this number on WhatsApp. */
export type InboundRow = { phone: string; received_at: string };

/** The send outcome an `appointment_reminders` row keeps. */
export type ReminderSendRow = {
  phone: string;
  /** The last send Meta accepted. */
  last_outbound_at: string | null;
  /** Set by a failed send, or a late delivery failure; cleared by the next success. */
  last_error: string | null;
  last_error_at: string | null;
};

/** A number given on a booking or a Result, and when. */
export type SeenPhoneRow = { phone: string | null; at: string; source: SeenNumberSource };

const time = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/**
 * A number as it is compared: its E.164 form when it normalises, so a local
 * `8780 5311` is Singapore's and not a suffix of `+44 8780 5311` too (which
 * `phonesMatch` alone would allow); as typed otherwise.
 */
const matchKey = (phone: string | null | undefined): string | null => normalizePhone(phone) ?? phone ?? null;

/** `phonesMatch` on the normalised forms. */
const sameNumber = (a: string | null | undefined, b: string | null | undefined): boolean =>
  phonesMatch(matchKey(a), matchKey(b));

/**
 * The digits a stored number must end with to `phonesMatch` this one: its last
 * eight, or all of them when it has fewer. Every match ends with them, so a
 * `like '%tail'` read is a superset that `phonesMatch` then narrows. Null when
 * the number has no digits.
 */
export function matchTail(phone: string | null | undefined): string | null {
  const digits = phoneDigits(matchKey(phone));
  return digits ? digits.slice(-8) : null;
}

/** When `phone` last messaged us on WhatsApp, any kind of message; null for never. */
export function latestInboundAt(phone: string | null | undefined, rows: readonly InboundRow[]): string | null {
  let latest: InboundRow | null = null;
  for (const r of rows) {
    if (!sameNumber(r.phone, phone)) continue;
    if (!latest || time(r.received_at) > time(latest.received_at)) latest = r;
  }
  return latest?.received_at ?? null;
}

/**
 * When our last reminder WhatsApp to `phone` failed, if the latest send to it
 * did. Across every reminder row for the number, the latest outcome wins: a
 * later success on any row (which clears that row's `last_error`) means it is
 * no longer the latest fact.
 */
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

/**
 * The WhatsApp row: the latest message from the number, and our failed send
 * only while nothing later says the number reaches them (a success, or a
 * message from them).
 */
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

/**
 * The numbers a Customer gave on their bookings and Results that differ from
 * the one on file (by `phonesMatch`), one entry per number however it was
 * typed, most recently seen first, so Staff can ask which is current.
 */
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

/** The Customer page reads this many candidate rows per source; more is a ponytail. */
const CANDIDATE_LIMIT = 200;

/**
 * Reads and resolves the facts for one Customer, with the service role.
 * `whatsapp_inbound` and `appointment_reminders` are read by the number's
 * last digits (a superset; ponytail: `like '%…'` cannot use their phone index,
 * fine while each holds months, not years, of rows) and narrowed with
 * `phonesMatch`. Bookings and Results are each read only when the viewer holds
 * their own permission (ADR 0028 (b)). Throws when a read fails.
 */
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
    // Results join a Customer the way the storefront matches them: the id, or
    // the lower-cased email (lib/results/access.ts).
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
