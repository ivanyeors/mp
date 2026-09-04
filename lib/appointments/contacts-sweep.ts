import { listGuestEvents } from "./calendar";
import { syncGuestContacts, type ContactSweepSummary } from "./contacts";
import type { AppointmentSettings } from "./settings";

export const DEFAULT_CONTACT_SWEEP_DAYS = 30;
export const MAX_CONTACT_SWEEP_DAYS = 100;

/**
 * Pull every upcoming appointment (name + phone parsed from the GCal event) for
 * the next `days` days and create / update / skip its Google contact.
 *
 * Covers appointments staff type straight into Google Calendar, which never pass
 * through /api/appointments/book. Idempotent: identical contacts are skipped.
 */
export async function sweepUpcomingContacts(
  settings: AppointmentSettings,
  opts: { days?: number; now?: Date } = {},
): Promise<ContactSweepSummary> {
  const now = opts.now ?? new Date();
  const days = Math.min(
    MAX_CONTACT_SWEEP_DAYS,
    Math.max(1, Math.floor(opts.days ?? DEFAULT_CONTACT_SWEEP_DAYS)),
  );
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const events = await listGuestEvents(timeMin, timeMax, settings);
  return syncGuestContacts(
    events.map((ev) => ({
      id: ev.id,
      name: ev.guestName,
      phone: ev.phone,
      email: ev.email,
    })),
  );
}
