import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Assist link: minting and resolving.
 *
 * The resolver is a trust boundary — what it returns decides whether a Draft
 * Result is stamped `source = 'staff_assisted'`, which later authorises a
 * no-card submit. So these tests drive the two observable behaviours that
 * matter: a code resolves to exactly one ACTIVE Staff member or to nothing, and
 * a Staff member ends up with exactly one code no matter how the race goes.
 *
 * The Supabase fake below enforces the partial unique index from
 * 20260912000000_admin_assist_code.sql, because the retry loop only exists to
 * survive that index rejecting a write.
 */

type Row = {
  id: string;
  email: string;
  is_active: boolean;
  auth_user_id: string | null;
  assist_code: string | null;
};

let rows: Row[] = [];
/** Runs before an update lands — lets a test simulate a concurrent writer. */
let beforeUpdate: (() => void) | null = null;

const generateMock = vi.fn<() => string>();

vi.mock("@/lib/referrals/attribution", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/referrals/attribution")>();
  return { ...actual, generateReferralCode: () => generateMock() };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Partial<Row> | null = null;
      const b = {
        select: () => b,
        update: (p: Partial<Row>) => {
          patch = p;
          return b;
        },
        eq: (k: keyof Row, v: unknown) => {
          filters.push((r) => r[k] === v);
          return b;
        },
        is: (k: keyof Row) => {
          filters.push((r) => r[k] === null);
          return b;
        },
        ilike: (k: keyof Row, v: string) => {
          filters.push(
            (r) => typeof r[k] === "string" && (r[k] as string).toLowerCase() === v.toLowerCase(),
          );
          return b;
        },
        maybeSingle: async () => {
          if (patch) {
            beforeUpdate?.();
            const code = patch.assist_code;
            const matched = rows.filter((r) => filters.every((f) => f(r)));
            // The partial unique index on lower(assist_code).
            if (
              typeof code === "string" &&
              rows.some(
                (r) => r.assist_code?.toLowerCase() === code.toLowerCase() && !matched.includes(r),
              )
            ) {
              return { data: null, error: { message: "duplicate key value" } };
            }
            for (const r of matched) Object.assign(r, patch);
            return { data: matched[0] ?? null, error: null };
          }
          const found = rows.filter((r) => filters.every((f) => f(r)));
          return { data: found[0] ?? null, error: null };
        },
      };
      return b;
    },
  }),
}));

import { adminUserIdForAuthUser, ensureAssistCode, getStaffByAssistCode } from "@/lib/assist-link";

function staff(over: Partial<Row> = {}): Row {
  return {
    id: "staff-1",
    email: "sam@mpillow.com",
    is_active: true,
    auth_user_id: "auth-1",
    assist_code: null,
    ...over,
  };
}

beforeEach(() => {
  rows = [];
  beforeUpdate = null;
  generateMock.mockReset();
});

describe("ensureAssistCode", () => {
  it("returns the existing code unchanged, and mints nothing", async () => {
    rows = [staff({ assist_code: "ABCDEF12" })];
    expect(await ensureAssistCode("staff-1")).toBe("ABCDEF12");
    expect(generateMock).not.toHaveBeenCalled();
    expect(rows[0].assist_code).toBe("ABCDEF12");
  });

  it("mints lazily on the first request", async () => {
    rows = [staff()];
    generateMock.mockReturnValue("NEWCODE1");
    expect(await ensureAssistCode("staff-1")).toBe("NEWCODE1");
    expect(rows[0].assist_code).toBe("NEWCODE1");
  });

  it("retries when the generated code collides with another Staff member's", async () => {
    rows = [staff({ id: "staff-2", assist_code: "TAKEN123" }), staff()];
    generateMock.mockReturnValueOnce("TAKEN123").mockReturnValueOnce("FRESH456");
    expect(await ensureAssistCode("staff-1")).toBe("FRESH456");
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after five collisions rather than looping forever", async () => {
    rows = [staff({ id: "staff-2", assist_code: "TAKEN123" }), staff()];
    generateMock.mockReturnValue("TAKEN123");
    expect(await ensureAssistCode("staff-1")).toBeNull();
    expect(generateMock).toHaveBeenCalledTimes(5);
    expect(rows[1].assist_code).toBeNull();
  });

  it("returns the winner's code when a concurrent request mints first", async () => {
    // Two requests for the same Staff member's FIRST code must return the same
    // code, not two. The `.is(assist_code, null)` guard makes the loser's write
    // match no row; it then re-reads rather than overwriting.
    rows = [staff()];
    generateMock.mockReturnValue("MINE0001");
    beforeUpdate = () => {
      rows[0].assist_code = "THEIRS01"; // the other request landed first
      beforeUpdate = null;
    };
    expect(await ensureAssistCode("staff-1")).toBe("THEIRS01");
    expect(rows[0].assist_code).toBe("THEIRS01");
  });

  it("returns null for a Staff member who does not exist", async () => {
    expect(await ensureAssistCode("nobody")).toBeNull();
  });
});

describe("getStaffByAssistCode", () => {
  it("resolves an active Staff member", async () => {
    rows = [staff({ assist_code: "ABCDEF12" })];
    expect(await getStaffByAssistCode("ABCDEF12")).toEqual({
      staffId: "staff-1",
      code: "ABCDEF12",
    });
  });

  it("matches case-insensitively, and on surrounding whitespace", async () => {
    rows = [staff({ assist_code: "ABCDEF12" })];
    expect((await getStaffByAssistCode(" abcdef12 "))?.staffId).toBe("staff-1");
  });

  it("refuses a deactivated Staff member", async () => {
    rows = [staff({ assist_code: "ABCDEF12", is_active: false })];
    expect(await getStaffByAssistCode("ABCDEF12")).toBeNull();
  });

  it("returns null — never throws — for an unknown code", async () => {
    rows = [staff({ assist_code: "ABCDEF12" })];
    await expect(getStaffByAssistCode("ZZZZZZZZ")).resolves.toBeNull();
  });

  it("returns null for a malformed code without querying at all", async () => {
    rows = [staff({ assist_code: "ABCDEF12" })];
    for (const bad of ["", "AB", "not-a-code!", "x".repeat(64)]) {
      await expect(getStaffByAssistCode(bad)).resolves.toBeNull();
    }
  });
});

describe("adminUserIdForAuthUser", () => {
  it("resolves the caller's own staff row id", async () => {
    rows = [staff()];
    expect(await adminUserIdForAuthUser("auth-1")).toBe("staff-1");
  });

  it("returns null for a deactivated or unknown session", async () => {
    rows = [staff({ is_active: false })];
    expect(await adminUserIdForAuthUser("auth-1")).toBeNull();
    expect(await adminUserIdForAuthUser("auth-nope")).toBeNull();
  });
});
