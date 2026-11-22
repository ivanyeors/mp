import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveDiscoverySourceOption,
  DEFAULT_DISCOVERY_SOURCE_CATALOG,
  DISCOVERY_SOURCE_READ_FAILED,
  serializeDiscoverySourceCatalog,
} from "@/lib/discovery-source";

const db = vi.hoisted(() => ({ down: false, value: "" }));
vi.mock("@/lib/supabase/server", () => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () =>
      db.down
        ? { data: null, error: { message: "connection reset" } }
        : { data: { key: "forms_discovery_source", value: db.value }, error: null },
  };
  return { supabaseAdmin: () => ({ from: () => query }) };
});
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));

const { GET } = await import("../route");

const activeIds = (catalog: { options: { id: string; active: boolean }[] }) =>
  catalog.options.filter((o) => o.active).map((o) => o.id);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.down = false;
  db.value = serializeDiscoverySourceCatalog(archiveDiscoverySourceOption(DEFAULT_DISCOVERY_SOURCE_CATALOG, "instagram"));
});

describe("GET /api/settings/forms/discovery-source", () => {
  it("answers 500 with an error, not the default options, when the read fails", async () => {
    db.down = true;
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: DISCOVERY_SOURCE_READ_FAILED });
    expect(body.catalog).toBeUndefined();
  });

  it("answers with the saved options when the read works", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(activeIds(body.catalog)).not.toContain("instagram");
  });
});
