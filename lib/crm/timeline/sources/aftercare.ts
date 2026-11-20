import { supabaseAdmin } from "@/lib/supabase/server";
import { AFTERCARE_GROUP } from "@/lib/crm/timeline/groups";
import { readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

type Profile = { name: string | null };

type EventRow = {
  id: number | string;
  preference: string;
  to_value: boolean;
  source: string;
  note: string | null;
  created_at: string;
  profile: Profile | Profile[] | null;
};

const CHANNEL: Record<string, string> = { aftercare_email: "email", aftercare_whatsapp: "WhatsApp" };

export const aftercareAdapter: TimelineAdapter = {
  key: "aftercare",
  group: AFTERCARE_GROUP,
  kinds: ["aftercare.turned_on", "aftercare.turned_off"],
  permission: "customers",
  load(customer, before, limit) {
    return readStream<EventRow>(
      supabaseAdmin()
        .from("customer_preference_events")
        .select("id, preference, to_value, source, note, created_at, profile:mp_staff!changed_by_profile_id(name)")
        .eq("customer_id", customer.id),
      "created_at",
      before,
      limit,
      (e) => {
        const profile = Array.isArray(e.profile) ? e.profile[0] : e.profile;
        const by = e.source === "profile" ? "by the customer" : `by ${profile?.name ?? "Staff"}`;
        const kind = e.to_value ? "aftercare.turned_on" : "aftercare.turned_off";
        return {
          id: `${kind}:${e.id}`,
          at: e.created_at,
          kind,
          ref: { type: "customer_preference_event", id: String(e.id) },
          summary: `Aftercare ${CHANNEL[e.preference] ?? e.preference} turned ${e.to_value ? "on" : "off"} ${by}`,
          ...(e.note ? { detail: e.note } : {}),
        };
      },
    );
  },
};
