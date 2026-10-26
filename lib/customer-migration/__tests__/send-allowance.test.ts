import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readRecentCampaignSends, sendAllowance, SEND_LIMIT_DAY_MS, SEND_LIMIT_MONTH_MS } from "../campaign-ledger";
import { emptyWorld, fakeCampaignClient } from "./fake-campaign-db";

const NOW = new Date("2026-10-26T08:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3600_000;

describe("sendAllowance", () => {
  const limits = { daily: 100, monthly: 3000 };

  it("leaves the smaller room, and no time while there is room", () => {
    expect(sendAllowance(limits, { lastDay: 38, lastMonth: 140, oldestInDay: ago(5 * HOUR), oldestInMonth: ago(9 * 86400_000) })).toEqual({
      remaining: 62,
      binding: "daily",
      limits,
      used: { daily: 38, monthly: 140 },
      roomAt: null,
    });
    expect(sendAllowance(limits, { lastDay: 10, lastMonth: 2995 })).toMatchObject({ remaining: 5, binding: "monthly" });
  });

  it("opens again when the oldest counted send leaves the binding window", () => {
    const oldestInDay = ago(5 * HOUR);
    const oldestInMonth = ago(20 * 86400_000);
    expect(sendAllowance(limits, { lastDay: 100, lastMonth: 400, oldestInDay, oldestInMonth }).roomAt).toBe(
      new Date(Date.parse(oldestInDay) + SEND_LIMIT_DAY_MS).toISOString(),
    );
    expect(sendAllowance(limits, { lastDay: 40, lastMonth: 3000, oldestInDay, oldestInMonth })).toMatchObject({
      binding: "monthly",
      roomAt: new Date(Date.parse(oldestInMonth) + SEND_LIMIT_MONTH_MS).toISOString(),
    });
  });
});

describe("readRecentCampaignSends", () => {
  it("counts used sends and tests over both windows, and finds the oldest of either", async () => {
    const world = emptyWorld();
    const send = (status: string, at: string, i: number) =>
      world.sends.push({
        id: `s${i}`,
        customer_id: `c${i}`,
        template: i % 2 ? "migration_announcement" : "campaign:5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a",
        wave: "w1",
        status,
        provider_message_id: null,
        sent_at: at,
        attempts: 1,
        last_error: null,
        bounced_at: null,
        complained_at: null,
      });
    send("sent", ago(2 * HOUR), 1);
    send("bounced", ago(3 * HOUR), 2);
    send("failed", ago(23 * HOUR), 3); // never reached Resend
    send("complained", ago(3 * 86400_000), 4);
    send("sent", ago(32 * 86400_000), 5); // outside the month
    world.auditLog = [
      { action: "email_campaign.test", created_at: ago(20 * HOUR), after: { sent: 2, failed: 1 } },
      { action: "email_campaign.test", created_at: ago(10 * 86400_000), after: { sent: 1, failed: 0 } },
      { action: "email_campaign.test", created_at: ago(1 * HOUR), after: { sent: 0, failed: 3 } },
      { action: "email_campaign.wave_start", created_at: ago(1 * HOUR), after: { size: 50 } },
    ];
    const recent = await readRecentCampaignSends(fakeCampaignClient(world) as unknown as SupabaseClient, NOW);
    expect(recent).toEqual({
      lastDay: 4,
      lastMonth: 6,
      oldestInDay: ago(20 * HOUR),
      oldestInMonth: ago(10 * 86400_000),
    });
  });
});
