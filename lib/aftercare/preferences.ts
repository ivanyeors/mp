import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/appointments/phone";
import {
  isStopRequestOpen,
  type AftercarePreference,
  type AftercareView,
  type PreferenceEvent,
  type PreferenceSource,
} from "./state";

export const WHATSAPP_MARKETING_OFF = "whatsapp_marketing_off";

const HISTORY_LIMIT = 50;

export type SetPreferenceResult = { ok: true; changed: boolean } | { ok: false; error: string };

export async function setAftercarePreference(
  admin: SupabaseClient,
  input: {
    customerId: string;
    preference: AftercarePreference;
    value: boolean;
    source: PreferenceSource;
    profileId?: string | null;
    note?: string | null;
    wording?: string | null;
  },
): Promise<SetPreferenceResult> {
  const { data, error } = await admin.rpc("set_aftercare_preference", {
    p_customer_id: input.customerId,
    p_preference: input.preference,
    p_value: input.value,
    p_source: input.source,
    p_profile_id: input.profileId ?? null,
    p_note: input.note ?? null,
    p_wording: input.wording ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, changed: data === true };
}

type EventRow = {
  preference: AftercarePreference;
  to_value: boolean;
  source: PreferenceSource;
  note: string | null;
  wording: string | null;
  created_at: string;
  profile?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

function toEvent(row: EventRow): PreferenceEvent {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  return {
    preference: row.preference,
    toValue: row.to_value,
    source: row.source,
    profileName: profile?.name ?? null,
    note: row.note,
    wording: row.wording,
    createdAt: row.created_at,
  };
}

export async function latestStopAt(admin: SupabaseClient, e164: string | null): Promise<string | null> {
  if (!e164) return null;
  const { data, error } = await admin
    .from("whatsapp_inbound")
    .select("received_at")
    .eq("phone", e164)
    .eq("kind", "stop")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.received_at as string | undefined) ?? null;
}

export async function readWhatsAppGate(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ optedIn: boolean; phone: string | null; stopRequested: boolean } | null> {
  const { data: customer, error } = await admin
    .from("customers")
    .select("id, phone, aftercare_whatsapp")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return null;

  const optedIn = customer.aftercare_whatsapp === true;
  const phone = (customer.phone as string | null) ?? null;
  if (!optedIn) return { optedIn, phone, stopRequested: false };

  const [stopAt, change] = await Promise.all([
    latestStopAt(admin, normalizePhone(phone)),
    admin
      .from("customer_preference_events")
      .select("created_at")
      .eq("customer_id", customerId)
      .eq("preference", "aftercare_whatsapp")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (change.error) throw new Error(change.error.message);
  return {
    optedIn,
    phone,
    stopRequested: isStopRequestOpen({
      whatsappOn: optedIn,
      latestStopAt: stopAt,
      latestWhatsAppChangeAt: (change.data?.created_at as string | undefined) ?? null,
    }),
  };
}

export async function readAftercareView(
  admin: SupabaseClient,
  customerId: string,
): Promise<AftercareView | null> {
  const { data: customer, error } = await admin
    .from("customers")
    .select("id, phone, aftercare_email, aftercare_whatsapp")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!customer) return null;

  const [events, stopAt, lastSend] = await Promise.all([
    admin
      .from("customer_preference_events")
      .select("preference, to_value, source, note, wording, created_at, profile:mp_staff!changed_by_profile_id(name)")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    latestStopAt(admin, normalizePhone((customer.phone as string | null) ?? null)),
    admin
      .from("customer_whatsapp")
      .select("status, last_error, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (events.error) throw new Error(events.error.message);
  if (lastSend.error) throw new Error(lastSend.error.message);

  const history = ((events.data ?? []) as EventRow[]).map(toEvent);
  const lastOf = (p: AftercarePreference) => history.find((e) => e.preference === p) ?? null;
  const whatsappOn = customer.aftercare_whatsapp === true;
  const lastWhatsApp = lastOf("aftercare_whatsapp");
  const open = isStopRequestOpen({
    whatsappOn,
    latestStopAt: stopAt,
    latestWhatsAppChangeAt: lastWhatsApp?.createdAt ?? null,
  });

  return {
    email: { on: customer.aftercare_email !== false, last: lastOf("aftercare_email") },
    whatsapp: {
      on: whatsappOn,
      last: lastWhatsApp,
      stopRequestedAt: open ? stopAt : null,
      marketingOff: lastSend.data?.last_error === WHATSAPP_MARKETING_OFF,
    },
    history,
  };
}

export async function readProfileAftercare(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ email: boolean; whatsapp: boolean; phone: string | null } | null> {
  const { data, error } = await admin
    .from("customers")
    .select("phone, aftercare_email, aftercare_whatsapp")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    email: data.aftercare_email !== false,
    whatsapp: data.aftercare_whatsapp === true,
    phone: (data.phone as string | null) ?? null,
  };
}

export async function listOpenStopRequests(
  admin: SupabaseClient,
): Promise<Array<{ customerId: string; stopRequestedAt: string }>> {
  const { data: optedIn, error } = await admin
    .from("customers")
    .select("id, phone")
    .eq("aftercare_whatsapp", true);
  if (error) throw new Error(error.message);

  const byPhone = new Map<string, string[]>();
  for (const c of optedIn ?? []) {
    const e164 = normalizePhone((c.phone as string | null) ?? null);
    if (!e164) continue;
    byPhone.set(e164, [...(byPhone.get(e164) ?? []), c.id as string]);
  }
  if (byPhone.size === 0) return [];

  // ponytail: one IN list; fine for the few opted-in customers there are. Chunk
  // it if opt-ins ever reach the thousands.
  const { data: stops, error: stopErr } = await admin
    .from("whatsapp_inbound")
    .select("phone, received_at")
    .eq("kind", "stop")
    .in("phone", [...byPhone.keys()]);
  if (stopErr) throw new Error(stopErr.message);

  const latestStop = new Map<string, string>();
  for (const s of stops ?? []) {
    const prev = latestStop.get(s.phone as string);
    if (!prev || Date.parse(s.received_at as string) > Date.parse(prev)) {
      latestStop.set(s.phone as string, s.received_at as string);
    }
  }
  const candidates = [...latestStop.entries()].flatMap(([phone, at]) =>
    (byPhone.get(phone) ?? []).map((customerId) => ({ customerId, at })),
  );
  if (candidates.length === 0) return [];

  const { data: changes, error: changeErr } = await admin
    .from("customer_preference_events")
    .select("customer_id, created_at")
    .eq("preference", "aftercare_whatsapp")
    .in("customer_id", candidates.map((c) => c.customerId));
  if (changeErr) throw new Error(changeErr.message);

  const latestChange = new Map<string, string>();
  for (const e of changes ?? []) {
    const prev = latestChange.get(e.customer_id as string);
    if (!prev || Date.parse(e.created_at as string) > Date.parse(prev)) {
      latestChange.set(e.customer_id as string, e.created_at as string);
    }
  }

  return candidates
    .filter((c) =>
      isStopRequestOpen({
        whatsappOn: true,
        latestStopAt: c.at,
        latestWhatsAppChangeAt: latestChange.get(c.customerId) ?? null,
      }),
    )
    .map((c) => ({ customerId: c.customerId, stopRequestedAt: c.at }));
}
