/**
 * Deterministic date formatting for the admin panel.
 *
 * The settings pages render on the server (Vercel: UTC, Node's ICU/default
 * locale) and hydrate in the browser (Singapore admins: UTC+8, browser
 * locale). Any formatter that leaves the time zone or the locale implicit
 * therefore produces different text in the two passes and React throws the
 * server HTML away for that subtree.
 *
 * Every helper here pins BOTH the locale and `timeZone: "Asia/Singapore"`, so
 * a given ISO string always renders to the same characters no matter where the
 * code runs. The company operates in Singapore and admins read the panel in
 * UTC+8, so Asia/Singapore is the correct wall clock for these values.
 *
 * Two locales are in play because the call sites were not consistent:
 *
 * - `en-US`, replacing bare `toLocaleString()` / `toLocaleDateString()` calls.
 *   The explicit options reproduce what an en-US browser prints for those
 *   calls (`9/2/2026, 3:45:12 PM` and `9/2/2026`).
 * - `en-MY`, which the orders / customers / discounts formatters already
 *   requested explicitly (`2 Sept 2026, 03:45 pm`). Only the time zone is
 *   added there, so the visible shape is unchanged.
 */

const TIME_ZONE = "Asia/Singapore";

/** What every helper renders for a missing or unparsable timestamp. */
const EMPTY = "—";

/** Equivalent of `new Date(iso).toLocaleString()` in an en-US browser. */
const US_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

/** Equivalent of `new Date(iso).toLocaleDateString()` in an en-US browser. */
const US_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

/** `2 Sept 2026, 03:45 pm` — the shape the orders tables already used. */
const MY_DATE_TIME = new Intl.DateTimeFormat("en-MY", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `2 Sept 2026` — the shape the customers / discounts tables already used. */
const MY_DATE = new Intl.DateTimeFormat("en-MY", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * `Intl.format` throws a RangeError on an invalid Date, where the
 * `toLocale*` methods it replaces returned "Invalid Date". Parse defensively so
 * a bad row cannot take the page down.
 */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function apply(fmt: Intl.DateTimeFormat, iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? fmt.format(date) : EMPTY;
}

/** Date and time, en-US shape: `9/2/2026, 3:45:12 PM` (Asia/Singapore). */
export function formatAdminDateTime(iso: string | null | undefined): string {
  return apply(US_DATE_TIME, iso);
}

/** Date only, en-US shape: `9/2/2026` (Asia/Singapore). */
export function formatAdminDate(iso: string | null | undefined): string {
  return apply(US_DATE, iso);
}

/** Date and time, en-MY shape: `2 Sept 2026, 03:45 pm` (Asia/Singapore). */
export function formatAdminDateTimeMY(iso: string | null | undefined): string {
  return apply(MY_DATE_TIME, iso);
}

/** Date only, en-MY shape: `2 Sept 2026` (Asia/Singapore). */
export function formatAdminDateMY(iso: string | null | undefined): string {
  return apply(MY_DATE, iso);
}

/**
 * "3h ago" style label, falling back to {@link formatAdminDate} past 30 days.
 *
 * `nowMs` is a parameter rather than an internal `Date.now()` so the caller
 * decides when "now" is sampled — during render on the server and during
 * render in the browser are different instants, which is precisely the
 * mismatch this module exists to avoid. Callers hold it in state for the life
 * of the mount and mark the element `suppressHydrationWarning`, since a
 * relative label legitimately cannot agree across the two passes.
 *
 * Returns `null` when there is nothing to show (no timestamp, unparsable, or a
 * timestamp in the future).
 */
export function formatAdminRelative(
  iso: string | null | undefined,
  nowMs: number,
): string | null {
  const date = parse(iso);
  if (!date) return null;

  const ms = nowMs - date.getTime();
  if (ms < 0) return null;

  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatAdminDate(iso);
}
