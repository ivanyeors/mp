import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectLocationOf,
  isSelfCollect,
  isSelfCollectAddress,
  resolveShippingAddress,
  ShippingAddressInputSchema,
} from "@/lib/shipping/self-collect";

const STUDIO = {
  id: "88fdfa10-ea2d-4f23-8573-55c0e58b4ae7",
  name: "Mpillow Singapore",
  address: "512 Chai Chee Lane #02-10",
  postal_code: "469028",
};

/** `partners` by id: the one read the resolver makes. */
function fakeAdmin(rows: Array<Record<string, unknown>>) {
  return {
    from: (table: string) => {
      expect(table).toBe("partners");
      let id: unknown;
      const q = {
        select: () => q,
        eq: (_col: string, v: unknown) => ((id = v), q),
        maybeSingle: async () => ({ data: rows.find((r) => r.id === id) ?? null, error: null }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const input = (fields: Record<string, unknown>) => ShippingAddressInputSchema.parse(fields);

describe("Self-collect", () => {
  it("is a method with a collection Location; a row from before the column is delivered", () => {
    expect(isSelfCollect({ collect_location_id: STUDIO.id })).toBe(true);
    expect(isSelfCollect({ collect_location_id: null })).toBe(false);
    expect(isSelfCollect({})).toBe(false);
  });

  it("stores the studio's address with the customer as recipient, whatever was typed", async () => {
    const res = await resolveShippingAddress(
      fakeAdmin([STUDIO]),
      { collect_location_id: STUDIO.id },
      input({ recipient: "Ivan Yeo", line1: "", city: "", postal_code: "" }),
    );
    expect(res).toEqual({
      ok: true,
      address: {
        recipient: "Ivan Yeo",
        line1: STUDIO.address,
        line2: null,
        city: "Singapore",
        state: null,
        postal_code: STUDIO.postal_code,
        country: "SG",
        collect_location: { id: STUDIO.id, name: STUDIO.name },
      },
    });
    // Non-null: an Assisted Result reads as finished, and accept does not treat
    // the Order as handed over at the counter.
    expect(res.ok && isSelfCollectAddress(res.address)).toBe(true);
    expect(res.ok && collectLocationOf(res.address)).toEqual({ id: STUDIO.id, name: STUDIO.name });
  });

  it("refuses a studio that is gone or has no address", async () => {
    const gone = await resolveShippingAddress(fakeAdmin([]), { collect_location_id: STUDIO.id }, input({ recipient: "A" }));
    expect(gone).toMatchObject({ ok: false, status: 409 });
    const blank = await resolveShippingAddress(
      fakeAdmin([{ ...STUDIO, address: "  " }]),
      { collect_location_id: STUDIO.id },
      input({ recipient: "A" }),
    );
    expect(blank).toMatchObject({ ok: false, status: 409 });
  });

  it("still requires the full address for a delivery method", async () => {
    const missing = await resolveShippingAddress(fakeAdmin([]), {}, input({ recipient: "A", line1: "", city: "SG" }));
    expect(missing).toMatchObject({ ok: false, status: 400 });

    const full = await resolveShippingAddress(
      fakeAdmin([]),
      { collect_location_id: null },
      input({ recipient: "A", line1: "1 Road", city: "Singapore", postal_code: "123456" }),
    );
    expect(full).toEqual({
      ok: true,
      address: { recipient: "A", line1: "1 Road", city: "Singapore", postal_code: "123456", country: "SG" },
    });
    expect(full.ok && isSelfCollectAddress(full.address)).toBe(false);
  });

  it("needs someone to collect it", () => {
    expect(ShippingAddressInputSchema.safeParse({ recipient: " " }).success).toBe(false);
  });

  it("reads no marker off an ordinary or missing address", () => {
    expect(isSelfCollectAddress(null)).toBe(false);
    expect(isSelfCollectAddress({ line1: "1 Road" })).toBe(false);
    expect(collectLocationOf({ line1: "1 Road" })).toBeNull();
  });
});
