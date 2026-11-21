const TIME_ZONE = "Asia/Singapore";

const EMPTY = "—";

const US_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

const US_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const MY_DATE_TIME = new Intl.DateTimeFormat("en-MY", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MY_DATE = new Intl.DateTimeFormat("en-MY", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const WEEKDAY_TIME = new Intl.DateTimeFormat("en-SG", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const TIME = new Intl.DateTimeFormat("en-SG", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function apply(fmt: Intl.DateTimeFormat, iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? fmt.format(date) : EMPTY;
}

export function formatAdminDateTime(iso: string | null | undefined): string {
  return apply(US_DATE_TIME, iso);
}

export function formatAdminDate(iso: string | null | undefined): string {
  return apply(US_DATE, iso);
}

export function formatAdminDateTimeMY(iso: string | null | undefined): string {
  return apply(MY_DATE_TIME, iso);
}

export function formatAdminDateMY(iso: string | null | undefined): string {
  return apply(MY_DATE, iso);
}

export function formatAdminWeekdayTime(iso: string | null | undefined): string {
  return apply(WEEKDAY_TIME, iso);
}

export function formatAdminTime(iso: string | null | undefined): string {
  return apply(TIME, iso);
}

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
