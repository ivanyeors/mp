import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

/**
 * Spec tests for the partner IDENTITY resolver (#83). External behaviour only:
 * we drive the two inputs the resolution depends on — the Supabase auth user and
 * the rows that exist in `partner_users`/`partners` — and assert the resolved
 * outcome (which row / what context / null). No call-order or storage-shape
 * assertions; the one side-effect we DO observe is the documented auth-id link,
 * because "primary email links / backup email never links" is a behaviour.
 *
 * The supabase mock is a tiny in-memory table that answers the real query the
 * code builds. Crucially it implements SQL ILIKE (with backslash escaping) so
 * the wildcard-escaping guard is exercised for real, not stubbed away.
 */

const h = vi.hoisted(() => ({
  db: { partner_users: [] as Record<string, unknown>[], partners: [] as Record<string, unknown>[] },
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({ getAuthUser: () => h.getAuthUser() }));

vi.mock("@/lib/supabase/server", () => {
  // SQL ILIKE with backslash escaping → regex. Feeding the escaped pattern the
  // code produces means `_`/`%` only match literally, which is the whole point.
  function likeMatch(pattern: string, value: unknown): boolean {
    if (typeof value !== "string") return false;
    let re = "";
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === "\\") {
        re += (pattern[++i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      } else if (c === "%") re += ".*";
      else if (c === "_") re += ".";
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${re}$`, "i").test(value);
  }

  function makeQuery(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let pendingUpdate: Record<string, unknown> | null = null;
    const rows = () => (h.db[table as keyof typeof h.db] ?? []).filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return q;
      },
      ilike: (col: string, pattern: string) => {
        filters.push((r) => likeMatch(pattern, r[col]));
        return q;
      },
      update: (patch: Record<string, unknown>) => {
        pendingUpdate = patch;
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      // `.update(..).eq(..)` is awaited directly — make the builder thenable.
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const affected = rows();
        if (pendingUpdate) for (const r of affected) Object.assign(r, pendingUpdate);
        return Promise.resolve({ data: affected, error: null }).then(resolve, reject);
      },
    };
    return q;
  }

  return { supabaseAdmin: () => ({ from: (table: string) => makeQuery(table) }) };
});

import {
  loadPartnerRow,
  getPartnerContext,
  isPartnerActive,
  type PartnerContext,
} from "@/lib/auth/partner";
import { isPartnerSessionFresh } from "@/lib/auth/partner-session";
import { AGREEMENT_VERSION } from "@/lib/partner-application";

function asUser(u: { id: string; email: string | null; last_sign_in_at?: string }): User {
  return u as unknown as User;
}

function ctx(over: Partial<PartnerContext> = {}): PartnerContext {
  return {
    userId: "auth-1",
    email: "jane@acme.example",
    partnerId: "p1",
    status: "approved",
    partnerName: "Acme Physio",
    agreedVersion: AGREEMENT_VERSION,
    ...over,
  };
}

beforeEach(() => {
  h.db.partner_users = [];
  h.db.partners = [];
  h.getAuthUser.mockReset();
});

describe("isPartnerActive (active-partner gate, pure)", () => {
  it("is true for an approved, linked partner on the current agreement", () => {
    expect(isPartnerActive(ctx())).toBe(true);
  });

  it("narrows null to false", () => {
    expect(isPartnerActive(null)).toBe(false);
  });

  it("is false when not approved", () => {
    expect(isPartnerActive(ctx({ status: "pending" }))).toBe(false);
    expect(isPartnerActive(ctx({ status: "rejected" }))).toBe(false);
  });

  it("is false when no partner row is linked", () => {
    expect(isPartnerActive(ctx({ partnerId: null }))).toBe(false);
  });

  it("is false when the partner still owes re-acceptance (stale agreement)", () => {
    expect(isPartnerActive(ctx({ agreedVersion: null }))).toBe(false);
    expect(isPartnerActive(ctx({ agreedVersion: "2020-01-01" }))).toBe(false);
  });
});

describe("loadPartnerRow (resolution + precedence)", () => {
  it("returns null for a signed-in non-partner", async () => {
    expect(await loadPartnerRow(asUser({ id: "auth-x", email: "stranger@example.com" }))).toBeNull();
  });

  it("returns null when the user has no email and no auth-id match", async () => {
    expect(await loadPartnerRow(asUser({ id: "auth-x", email: null }))).toBeNull();
  });

  it("matches by auth_user_id first, ahead of any email row", async () => {
    h.db.partner_users = [
      { id: "row-auth", auth_user_id: "auth-1", partner_id: "p1", application_status: "approved", agreed_version: null, email: "old@acme.example" },
      { id: "row-email", auth_user_id: null, partner_id: "p2", application_status: "approved", agreed_version: null, email: "jane@acme.example" },
    ];
    const row = await loadPartnerRow(asUser({ id: "auth-1", email: "jane@acme.example" }));
    expect(row?.id).toBe("row-auth");
  });

  it("matches by primary email (case-insensitive) when no auth-id row exists", async () => {
    h.db.partner_users = [
      { id: "row-email", auth_user_id: null, partner_id: "p1", application_status: "approved", agreed_version: null, email: "jane@acme.example" },
    ];
    const row = await loadPartnerRow(asUser({ id: "auth-1", email: "JANE@Acme.Example" }));
    expect(row?.id).toBe("row-email");
  });

  it("links auth_user_id on first primary-email match", async () => {
    h.db.partner_users = [
      { id: "row-email", auth_user_id: null, partner_id: "p1", application_status: "approved", agreed_version: null, email: "jane@acme.example" },
    ];
    await loadPartnerRow(asUser({ id: "auth-1", email: "jane@acme.example" }));
    expect(h.db.partner_users[0].auth_user_id).toBe("auth-1");
  });

  it("does NOT let an email with `_` adopt another partner's row (LIKE-wildcard escaping)", async () => {
    // Only a DIFFERENT partner exists whose email would match `j_hn@x.com` if `_`
    // were treated as a wildcard. Correct escaping ⇒ no match ⇒ null.
    h.db.partner_users = [
      { id: "row-other", auth_user_id: null, partner_id: "p9", application_status: "approved", agreed_version: null, email: "jxhn@x.com" },
    ];
    expect(await loadPartnerRow(asUser({ id: "auth-1", email: "j_hn@x.com" }))).toBeNull();

    // Sanity: the exact address still resolves.
    h.db.partner_users.push({ id: "row-exact", auth_user_id: null, partner_id: "p1", application_status: "approved", agreed_version: null, email: "j_hn@x.com" });
    const row = await loadPartnerRow(asUser({ id: "auth-1", email: "j_hn@x.com" }));
    expect(row?.id).toBe("row-exact");
  });

  it("resolves a VERIFIED backup email and never links auth_user_id", async () => {
    h.db.partner_users = [
      { id: "row-backup", auth_user_id: null, partner_id: "p1", application_status: "approved", agreed_version: null, email: "primary@acme.example", backup_email: "second@personal.example", backup_email_verified: true },
    ];
    const row = await loadPartnerRow(asUser({ id: "auth-2", email: "second@personal.example" }));
    expect(row?.id).toBe("row-backup");
    // Backup identity must not steal the primary's auth_user_id link.
    expect(h.db.partner_users[0].auth_user_id).toBeNull();
    expect(row?.auth_user_id).toBeNull();
  });

  it("does NOT resolve an UNVERIFIED backup email", async () => {
    h.db.partner_users = [
      { id: "row-backup", auth_user_id: null, partner_id: "p1", application_status: "approved", agreed_version: null, email: "primary@acme.example", backup_email: "second@personal.example", backup_email_verified: false },
    ];
    expect(await loadPartnerRow(asUser({ id: "auth-2", email: "second@personal.example" }))).toBeNull();
  });
});

describe("isPartnerSessionFresh (7-day absolute cap boundary)", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");
  const CAP_MS = 7 * 24 * 60 * 60 * 1000;

  it("is fresh exactly at the 7-day boundary", () => {
    const at = new Date(now.getTime() - CAP_MS).toISOString();
    expect(isPartnerSessionFresh(at, now)).toBe(true);
  });

  it("is stale one millisecond past the boundary", () => {
    const at = new Date(now.getTime() - CAP_MS - 1).toISOString();
    expect(isPartnerSessionFresh(at, now)).toBe(false);
  });

  it("is fresh well within the window", () => {
    const at = new Date(now.getTime() - 60_000).toISOString();
    expect(isPartnerSessionFresh(at, now)).toBe(true);
  });

  it("treats a missing or unparseable timestamp as stale", () => {
    expect(isPartnerSessionFresh(null, now)).toBe(false);
    expect(isPartnerSessionFresh(undefined, now)).toBe(false);
    expect(isPartnerSessionFresh("not-a-date", now)).toBe(false);
  });
});

describe("getPartnerContext (session cap + pill visibility)", () => {
  const partnerRow = {
    id: "row-1",
    auth_user_id: "auth-1",
    partner_id: "p1",
    application_status: "approved",
    agreed_version: AGREEMENT_VERSION,
    email: "jane@acme.example",
  };

  it("returns null when not signed in", async () => {
    h.getAuthUser.mockResolvedValue(null);
    expect(await getPartnerContext()).toBeNull();
  });

  it("returns null for a signed-in non-partner", async () => {
    h.getAuthUser.mockResolvedValue(asUser({ id: "auth-x", email: "stranger@example.com", last_sign_in_at: new Date().toISOString() }));
    expect(await getPartnerContext()).toBeNull();
  });

  it("returns null (no pill) when the session is past the 7-day cap", async () => {
    h.db.partner_users = [partnerRow];
    h.getAuthUser.mockResolvedValue(asUser({ id: "auth-1", email: "jane@acme.example", last_sign_in_at: "2000-01-01T00:00:00.000Z" }));
    expect(await getPartnerContext()).toBeNull();
  });

  it("resolves the context for a fresh partner session (email normalized)", async () => {
    h.db.partner_users = [partnerRow];
    h.db.partners = [{ id: "p1", name: "Acme Physio" }];
    h.getAuthUser.mockResolvedValue(asUser({ id: "auth-1", email: "Jane@Acme.Example", last_sign_in_at: new Date().toISOString() }));
    const result = await getPartnerContext();
    expect(result).toEqual({
      userId: "auth-1",
      email: "jane@acme.example",
      partnerId: "p1",
      status: "approved",
      partnerName: "Acme Physio",
      agreedVersion: AGREEMENT_VERSION,
    });
    // And it is recognized as an active partner end-to-end.
    expect(isPartnerActive(result)).toBe(true);
  });
});
