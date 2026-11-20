import type { SupabaseClient } from "@supabase/supabase-js";

export interface WelcomeStep {
  step: number;
  until: string;
  points: number;
  allocation: number;
  claimed: number;
  open: boolean;
}

export interface WelcomeOffer {
  steps: WelcomeStep[];
  current: WelcomeStep | null;
  left: number;
  next: WelcomeStep | null;
}

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

export function welcomeOffer(steps: readonly WelcomeStep[]): WelcomeOffer {
  const ordered = [...steps].sort((a, b) => a.step - b.step);
  const current = ordered.find((s) => s.open) ?? null;
  const next = current
    ? (ordered.find((s) => s.step > current.step && s.claimed < s.allocation) ?? null)
    : null;
  return {
    steps: ordered,
    current,
    left: current ? Math.max(0, current.allocation - current.claimed) : 0,
    next,
  };
}

export function welcomeLeftShare(offer: Pick<WelcomeOffer, "current" | "left">): number {
  if (!offer.current || offer.current.allocation <= 0) return 0;
  return Math.min(1, Math.max(0, offer.left / offer.current.allocation));
}

const SGT = "Asia/Singapore";
const sgt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-SG", { timeZone: SGT, ...opts });
const dayMonth = (iso: string) => sgt(iso, { day: "numeric", month: "long" });
const clock = (iso: string) => sgt(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function stepEndLabel(until: string): string {
  if (clock(until) === "00:00") return `the end of ${dayMonth(new Date(Date.parse(until) - 60_000).toISOString())}`;
  return `${clock(until)} on ${dayMonth(until)}`;
}

export function stepStartLabel(previousUntil: string): string {
  return clock(previousUntil) === "00:00" ? dayMonth(previousUntil) : `${clock(previousUntil)} on ${dayMonth(previousUntil)}`;
}

export async function readWelcomeSteps(admin: SupabaseClient): Promise<WelcomeStep[]> {
  const { data, error } = await admin.rpc("welcome_bonus_standing");
  if (error) throw new Error(`Could not read the welcome bonus steps: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    step: int(r.step),
    until: new Date(String(r.until)).toISOString(),
    points: int(r.points),
    allocation: int(r.allocation),
    claimed: int(r.claimed),
    open: r.is_open === true,
  }));
}

export type WelcomeGrantReason = "granted" | "off" | "partner" | "migrated" | "already" | "ended";
const REASONS: readonly WelcomeGrantReason[] = ["granted", "off", "partner", "migrated", "already", "ended"];

export interface WelcomeGrant {
  granted: boolean;
  points: number;
  reason: WelcomeGrantReason;
}

export async function grantWelcomeBonus(admin: SupabaseClient, customerId: string): Promise<WelcomeGrant> {
  const { data, error } = await admin.rpc("grant_welcome_bonus", { p_customer_id: customerId });
  if (error) throw new Error(`Could not grant the welcome bonus: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const reason = REASONS.includes(r?.reason as WelcomeGrantReason) ? (r!.reason as WelcomeGrantReason) : "ended";
  return { granted: r?.granted === true, points: int(r?.points), reason };
}
