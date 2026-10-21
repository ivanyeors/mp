import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The daily Aftercare job (CRM slices 07 and 08): chained onto results-sla
 * with no third cron, and one message type failing never stops the others.
 */

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { AFTERCARE_RUNNERS, runAftercareMessages } = await import("@/lib/aftercare/job");

describe("the daily Aftercare job", () => {
  it("chains onto results-sla, and vercel.json keeps two crons", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: unknown[] };
    expect(vercel.crons).toHaveLength(2);
    const sla = readFileSync(join(process.cwd(), "app/api/cron/results-sla/route.ts"), "utf8");
    expect(sla).toMatch(/await runAftercareMessages\(admin, \{ origin, now \}\)/);
  });

  it("runs the Review request, and reports a failure without throwing", async () => {
    expect(Object.keys(AFTERCARE_RUNNERS)).toEqual(["reviewRequests"]);
    const broken = {
      from: () => {
        throw new Error("db down");
      },
    } as unknown as SupabaseClient;
    const result = await runAftercareMessages(broken, { origin: "https://x.test", now: new Date() });
    expect(result).toEqual({ reviewRequests: { ok: false, error: "db down" } });
  });
});
