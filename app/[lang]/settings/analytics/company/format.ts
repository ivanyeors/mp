import type { Health } from "@/lib/company/overview";
import type { Rag, Severity } from "@/lib/company/report";

const DAY = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const WHEN = new Intl.DateTimeFormat("en-SG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });
const TIME = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Singapore" });

export const fmtDay = (isoDate: string) => DAY.format(new Date(`${isoDate}T00:00:00Z`));
export const fmtDayYear = (isoDate: string) => DAY_YEAR.format(new Date(`${isoDate}T00:00:00Z`));
export const fmtWhen = (iso: string) => WHEN.format(new Date(iso));
export const fmtTime = (iso: string) => TIME.format(new Date(iso));

export const HEALTH: Record<Health, { label: string; dot: string; text: string; pulse: boolean }> = {
  ok: { label: "OK", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", pulse: false },
  unchanged: { label: "No change", dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-400", pulse: false },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", pulse: false },
  failed: { label: "Failed", dot: "bg-red-500", text: "text-red-700 dark:text-red-400", pulse: true },
  missed: { label: "Missed its last run", dot: "bg-red-500", text: "text-red-700 dark:text-red-400", pulse: true },
  none: { label: "No report yet", dot: "bg-zinc-300 dark:bg-zinc-600", text: "text-muted-foreground", pulse: false },
  paused: { label: "Paused", dot: "border border-dashed border-zinc-400 bg-transparent", text: "text-muted-foreground", pulse: false },
  group: { label: "Department", dot: "bg-transparent", text: "text-muted-foreground", pulse: false },
};

export const RAG: Record<NonNullable<Rag>, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export const SEVERITY: Record<Severity, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-muted text-muted-foreground",
};

export function okrTone(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("on track")) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  if (s.includes("at risk")) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  if (s.includes("off track")) return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200";
  return "bg-muted text-muted-foreground";
}

export function agentHref(agent: string, file?: string): string {
  const qs = new URLSearchParams({ agent });
  if (file) qs.set("file", file);
  return `?${qs}#agent`;
}
