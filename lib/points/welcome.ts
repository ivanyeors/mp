/**
 * The **Welcome bonus** (ADR 0030, amendment of 2026-11-17;
 * 20261117100000_explore_welcome_points.sql): points for someone who claims
 * on the Explore page, once, on a ladder that falls on published dates with a
 * limited number at each step. A Migrated customer gets the Claim bonus
 * instead, never both.
 *
 * SQL owns the ladder and which step is open (`welcome_bonus_standing`), so
 * the page and the grant can never disagree; this file reads it and shapes it
 * for the page. Every number shown is that count: nothing here invents one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface WelcomeStep {
  /** Numbered from 1, soonest first. */
  step: number;
  /** ISO time the step ends (exclusive). */
  until: string;
  points: number;
  /** How many bonuses this step has to give. */
  allocation: number;
  /** How many were claimed at it. */
  claimed: number;
  /** The one step a claim made now would be granted at. */
  open: boolean;
}

export interface WelcomeOffer {
  steps: WelcomeStep[];
  /** The open step, or null once the ladder has ended or is used up. */
  current: WelcomeStep | null;
  /** Bonuses left at the open step; 0 with none open. */
  left: number;
  /** The step a claim falls to once the open one ends or runs out, if any. */
  next: WelcomeStep | null;
}

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Pure — the offer the page shows, from the steps as SQL reports them. */
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

/** Pure — the share of the open step still unclaimed, 0 to 1: the bar that only goes down. */
export function welcomeLeftShare(offer: Pick<WelcomeOffer, "current" | "left">): number {
  if (!offer.current || offer.current.allocation <= 0) return 0;
  return Math.min(1, Math.max(0, offer.left / offer.current.allocation));
}

const SGT = "Asia/Singapore";
const sgt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("en-SG", { timeZone: SGT, ...opts });
const dayMonth = (iso: string) => sgt(iso, { day: "numeric", month: "long" });
const clock = (iso: string) => sgt(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * Pure — when a step ends, as people say it, in Singapore time. A step that
 * ends at midnight ends with the day before: "the end of 30 November".
 * Otherwise the minute: "23:59 on 31 December".
 */
export function stepEndLabel(until: string): string {
  if (clock(until) === "00:00") return `the end of ${dayMonth(new Date(Date.parse(until) - 60_000).toISOString())}`;
  return `${clock(until)} on ${dayMonth(until)}`;
}

/** Pure — when the step after it starts by date: "1 December", or "23:59 on 31 December". */
export function stepStartLabel(previousUntil: string): string {
  return clock(previousUntil) === "00:00" ? dayMonth(previousUntil) : `${clock(previousUntil)} on ${dayMonth(previousUntil)}`;
}

/** Every step with its claims and which is open. Throws on a failed read. */
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

/**
 * Grants the Welcome bonus if this Customer may have one now
 * (`grant_welcome_bonus`). Never throws for a refusal: the reason says why.
 */
export async function grantWelcomeBonus(admin: SupabaseClient, customerId: string): Promise<WelcomeGrant> {
  const { data, error } = await admin.rpc("grant_welcome_bonus", { p_customer_id: customerId });
  if (error) throw new Error(`Could not grant the welcome bonus: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const reason = REASONS.includes(r?.reason as WelcomeGrantReason) ? (r!.reason as WelcomeGrantReason) : "ended";
  return { granted: r?.granted === true, points: int(r?.points), reason };
}
