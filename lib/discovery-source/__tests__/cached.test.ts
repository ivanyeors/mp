import { AsyncLocalStorage } from "node:async_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { archiveDiscoverySourceOption, DEFAULT_DISCOVERY_SOURCE_CATALOG, serializeDiscoverySourceCatalog } from "@/lib/discovery-source";

const db = vi.hoisted(() => ({ down: false, reads: 0, value: "" }));
vi.mock("@/lib/supabase/server", () => {
  const answer = () => {
    db.reads += 1;
    return db.down
      ? { data: null, error: { message: "connection reset" } }
      : { data: { key: "forms_discovery_source", value: db.value }, error: null };
  };
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () => answer(),
    then: (resolve: (r: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const r = answer();
      return Promise.resolve({ ...r, data: r.data ? [r.data] : null }).then(resolve, reject);
    },
  };
  return { supabaseAdmin: () => ({ from: () => query }) };
});

const entries = new Map<string, unknown>();
Object.assign(globalThis, { AsyncLocalStorage });
(globalThis as { __incrementalCache?: unknown }).__incrementalCache = {
  isOnDemandRevalidate: false,
  generateSimpleCacheKey: async (key: string) => key,
  get: async (key: string) => (entries.has(key) ? { value: entries.get(key), isStale: false } : null),
  set: async (key: string, value: unknown) => void entries.set(key, value),
};

const { readDiscoverySourceCatalog } = await import("../cached");

const activeIds = (catalog: { options: { id: string; active: boolean }[] }) =>
  catalog.options.filter((o) => o.active).map((o) => o.id);

beforeEach(() => {
  entries.clear();
  db.down = false;
  db.reads = 0;
  db.value = serializeDiscoverySourceCatalog(archiveDiscoverySourceOption(DEFAULT_DISCOVERY_SOURCE_CATALOG, "instagram"));
});

describe("readDiscoverySourceCatalog", () => {
  it("never keeps the default catalog from a failed read: the next read lists what the owner saved", async () => {
    db.down = true;
    expect(activeIds(await readDiscoverySourceCatalog())).toContain("instagram");

    db.down = false;
    expect(activeIds(await readDiscoverySourceCatalog())).not.toContain("instagram");
  });

  it("keeps a good read for the next requests, through a later outage", async () => {
    expect(activeIds(await readDiscoverySourceCatalog())).not.toContain("instagram");
    db.down = true;
    expect(activeIds(await readDiscoverySourceCatalog())).not.toContain("instagram");
    expect(db.reads).toBe(1);
  });
});
