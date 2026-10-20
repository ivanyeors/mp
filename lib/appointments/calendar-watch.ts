/**
 * Keep one Google Calendar push channel open, so a cancellation reaches the
 * guest when it happens instead of at the next 09:00 run.
 *
 * Google POSTs to the webhook on any change to the calendar, with the channel
 * id and our per-channel token in headers and no body; the webhook then asks
 * what changed. Channels expire (we ask for a week), so the daily run renews
 * one that is close to it, and stops the one it replaces.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { getSiteOrigin } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase/server";
import { stopCalendarChannel, watchCalendarEvents } from "./calendar";

const TTL_SECONDS = 7 * 24 * 60 * 60;
/** Renew this close to expiry. Two days covers a daily run that misses once. */
const RENEW_WITHIN_MS = 2 * 24 * 60 * 60 * 1000;

type ChannelRow = {
  id: string;
  resource_id: string;
  token: string;
  address: string;
  expires_at: string;
};

export function calendarWebhookAddress(): string {
  return `${getSiteOrigin()}/api/webhooks/google-calendar`;
}

export type WatchResult =
  | { status: "kept" | "renewed"; expiresAt: string }
  | { status: "skipped"; detail: string };

export async function ensureCalendarWatch(now: Date = new Date()): Promise<WatchResult> {
  // A preview would point the production calendar at itself.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { status: "skipped", detail: `not production (${process.env.VERCEL_ENV})` };
  }
  const address = calendarWebhookAddress();
  if (!address.startsWith("https://")) {
    return { status: "skipped", detail: `Google only pushes to https (${address})` };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("google_calendar_channels")
    .select("id, resource_id, token, address, expires_at")
    .is("stopped_at", null);
  if (error) throw new Error(error.message);
  const open = (data ?? []) as ChannelRow[];

  const current = open.find(
    (c) => c.address === address && Date.parse(c.expires_at) - now.getTime() > RENEW_WITHIN_MS,
  );
  if (current) return { status: "kept", expiresAt: current.expires_at };

  const channelId = randomUUID();
  const token = randomBytes(24).toString("hex");
  const watch = await watchCalendarEvents({ channelId, token, address, ttlSeconds: TTL_SECONDS });
  const expiresAt = new Date(watch.expirationMs).toISOString();
  const { error: insErr } = await admin.from("google_calendar_channels").insert({
    id: channelId,
    resource_id: watch.resourceId,
    token,
    address,
    expires_at: expiresAt,
  });
  if (insErr) {
    // Unrecorded, its pushes would fail verification for a week. Close it.
    await stopCalendarChannel(channelId, watch.resourceId).catch(() => {});
    throw new Error(insErr.message);
  }

  // Overlapping channels only double the pushes, which the status locks absorb,
  // so a stop that fails is logged and the row closed regardless.
  for (const old of open) {
    try {
      await stopCalendarChannel(old.id, old.resource_id);
    } catch (e) {
      console.error("[calendar-watch] stop", old.id, e instanceof Error ? e.message : e);
    }
    await admin
      .from("google_calendar_channels")
      .update({ stopped_at: now.toISOString() })
      .eq("id", old.id);
  }
  return { status: "renewed", expiresAt };
}

/** Is this push from a channel we opened and have not closed? */
export async function verifyCalendarChannel(
  channelId: string | null,
  token: string | null,
): Promise<boolean> {
  if (!channelId || !token) return false;
  const { data, error } = await supabaseAdmin()
    .from("google_calendar_channels")
    .select("token")
    .eq("id", channelId)
    .is("stopped_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data != null && secretMatches(data.token as string, token);
}
