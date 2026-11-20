import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_CAMPAIGN_DRAFT, type Campaign } from "@/lib/email-campaigns/rules";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Seg = { id: string; name: string; params: Record<string, string>; needsReview: boolean };
const h = vi.hoisted(() => ({
  permissions: new Set<string>(["campaigns", "customers-edit"]),
  segments: [] as Seg[],
  campaigns: [] as { campaign: Campaign; stats: unknown }[],
  read: 0,
  created: [] as { name: string; params: Record<string, string> }[],
  pointed: [] as [string, string][],
  pointOk: true,
  newCampaigns: [] as unknown[],
  audit: [] as { action: string; entityId?: string; before?: unknown; after?: unknown }[],
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async (permission: string) => {
    if (!h.permissions.has(permission)) throw new Error("Forbidden");
    return { permissions: h.permissions, email: "owner@mpillow.com", memberId: "m1", userId: "u1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async (a: (typeof h.audit)[number]) => void h.audit.push(a)) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/staff/working-as", () => ({ actingProfile: async () => ({ id: "p1", name: "Owner" }), getWorkingAs: async () => ({ id: "p1", name: "Owner" }) }));
vi.mock("@/lib/crm/segments", () => {
  class SegmentNameTakenError extends Error {}
  return {
    SegmentNameTakenError,
    listSegments: vi.fn(async () => {
      h.read += 1;
      return h.segments.map((s) => ({ ...s, count: 1, ignored: [], createdBy: null, createdAt: "", updatedAt: "" }));
    }),
    createSegment: vi.fn(async (name: string, params: Record<string, string>) => {
      const row = { id: id(500 + h.created.length), name, params, needsReview: false };
      h.created.push({ name, params });
      h.segments.push(row);
      return { ...row, count: 0, ignored: [], createdBy: null, createdAt: "", updatedAt: "" };
    }),
    getSegment: vi.fn(async (sid: string) => {
      const s = h.segments.find((x) => x.id === sid);
      return s ? { id: s.id, name: s.name, filters: s.params, filtersVersion: 2, archivedAt: null } : null;
    }),
  };
});
vi.mock("@/lib/email-campaigns/store", () => ({
  listCampaigns: vi.fn(async () => h.campaigns),
  pointDraftAt: vi.fn(async (_admin: unknown, cid: string, sid: string) => {
    if (!h.pointOk) return false;
    h.pointed.push([cid, sid]);
    return true;
  }),
  createCampaign: vi.fn(async (_admin: unknown, draft: Record<string, unknown>) => {
    h.newCampaigns.push(draft);
    const saved = { ...draft, id: id(900 + h.newCampaigns.length - 1), lockedAt: null, archivedAt: null, createdAt: "2026-11-19T00:00:00Z" };
    h.campaigns.push({ campaign: saved as unknown as Campaign, stats: { handed: 0, firstSentAt: null, lastSentAt: null } });
    return saved.id;
  }),
}));

const { moveFunnelEmail, addPlaybookDraft } = await import("../arrange-actions");

const camp = (n: number, name: string, segment: number, started = false) => ({
  campaign: {
    ...EMPTY_CAMPAIGN_DRAFT,
    id: id(n),
    name,
    subject: name,
    preheader: "",
    audience: "segment" as const,
    segmentId: id(segment),
    lockedAt: started ? "2026-11-01T00:00:00Z" : null,
    archivedAt: null,
    createdAt: `2026-10-${10 + (n % 10)}T00:00:00Z`,
  } as unknown as Campaign,
  stats: { handed: 0, firstSentAt: null, lastSentAt: null },
});

beforeEach(() => {
  h.permissions = new Set(["campaigns", "customers-edit"]);
  h.segments = [
    { id: id(1), name: "Lead", params: { stage: "lead" }, needsReview: false },
    { id: id(2), name: "got A", params: { campaign: `${id(10)}:sent` }, needsReview: false },
    { id: id(3), name: "clicked B", params: { campaign: `${id(11)}:clicked` }, needsReview: false },
  ];
  h.campaigns = [camp(10, "A", 1), camp(11, "B", 2), camp(12, "C", 3)];
  h.read = 0;
  h.created = [];
  h.pointed = [];
  h.pointOk = true;
  h.newCampaigns = [];
  h.audit = [];
});

const swap = { campaignId: id(12), stage: "lead" as const, after: { campaignId: id(10), did: "sent" as const }, before: id(11) };

describe("moveFunnelEmail", () => {
  it("is guarded by campaigns, before anything is read", async () => {
    h.permissions = new Set(["customers", "customers-edit"]);
    await expect(moveFunnelEmail(swap)).rejects.toThrow("Forbidden");
    expect(h.read).toBe(0);
  });

  it("refuses input that is not ids, a stage and a condition", async () => {
    const res = await moveFunnelEmail({ ...swap, after: { campaignId: id(10), did: "not-sent" } } as never);
    expect(res.ok).toBe(false);
    const filters = await moveFunnelEmail({ ...swap, filters: { search: "tan" } } as never);
    expect(filters.ok).toBe(false);
    expect(h.read).toBe(0);
  });

  it("swaps two drafts: reuses the Segment found by its filters, creates the missing one, an audit row per campaign", async () => {
    h.segments.push({ id: id(4), name: "Anyone who got A", params: { campaign: `${id(10)}:sent` }, needsReview: false });
    const res = await moveFunnelEmail(swap);
    expect(res).toEqual({ ok: true, moved: [id(12), id(11)] });
    expect(h.pointed[0]).toEqual([id(12), id(2)]);
    expect(h.created).toEqual([{ name: "Lead · got “C”", params: { campaign: `${id(12)}:sent` } }]);
    expect(h.pointed[1]).toEqual([id(11), id(500)]);
    expect(h.audit.map((a) => [a.action, a.entityId])).toEqual([
      ["email_campaign.update", id(12)],
      ["customer_segment.create", id(500)],
      ["email_campaign.update", id(11)],
    ]);
    expect(h.audit[0].before).toEqual({ audience: "segment", segment_id: id(3) });
    expect(h.audit[0].after).toMatchObject({ audience: "segment", segment_id: id(2) });
  });

  it("refuses a started campaign on the server even when the page says it is a draft", async () => {
    h.campaigns = [camp(10, "A", 1), camp(11, "B", 2), camp(12, "C", 3, true)];
    const res = await moveFunnelEmail(swap);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("“C” stays where it is");
    expect(h.pointed).toEqual([]);
    expect(h.created).toEqual([]);
  });

  it("refuses when the campaign started between the read and the write, and says which did not move", async () => {
    h.pointOk = false;
    const res = await moveFunnelEmail(swap);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/^“C” did not move: it has started sending/);
    expect(h.audit.filter((a) => a.action === "email_campaign.update")).toEqual([]);
  });

  it("refuses, with nothing written, a move that needs a Segment created by someone who may not create one", async () => {
    h.permissions = new Set(["campaigns"]);
    const res = await moveFunnelEmail(swap);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("only someone who can edit Customers");
    expect(!res.ok && res.error).toContain("Nothing moved.");
    expect(h.pointed).toEqual([]);
    expect(h.created).toEqual([]);
  });
});

describe("addPlaybookDraft", () => {
  it("saves the Playbook as a draft to its found Segment, and plans no Wave", async () => {
    h.segments.push({ id: id(20), name: "At risk · Lapsed", params: { stage: "at-risk:lapsed" }, needsReview: false });
    const res = await addPlaybookDraft("playbook_welcome_back");
    expect(res).toEqual({ ok: true, id: id(900) });
    expect(h.newCampaigns).toHaveLength(1);
    expect(h.newCampaigns[0]).toMatchObject({ name: "Welcome back", audience: "segment", segmentId: id(20), includeUnengaged: true });
    expect(h.created).toEqual([]);
    expect(h.audit.map((a) => a.action)).toEqual(["email_campaign.create"]);
  });

  it("creates the Playbook's Segment when missing", async () => {
    const res = await addPlaybookDraft("playbook_we_miss_you");
    expect(res.ok).toBe(true);
    expect(h.created).toEqual([{ name: "At risk · 12 to 24 months", params: { stage: "at-risk", last_order: "within:24" } }]);
    expect(h.newCampaigns[0]).toMatchObject({ audience: "segment", segmentId: id(500) });
  });

  it("refuses a second draft of the same Playbook, and creates nothing", async () => {
    h.segments.push({ id: id(20), name: "At risk · Lapsed", params: { stage: "at-risk:lapsed" }, needsReview: false });
    expect((await addPlaybookDraft("playbook_welcome_back")).ok).toBe(true);
    const again = await addPlaybookDraft("playbook_welcome_back");
    expect(again).toEqual({ ok: false, error: "“Welcome back” is already this Playbook in the flow. Open it to change it." });
    expect(h.newCampaigns).toHaveLength(1);
    expect(h.created).toEqual([]);
  });

  it("refuses a Playbook whose words wait for the owner, and an unknown one", async () => {
    for (const s of ["playbook_how_its_made", "nope"]) {
      const res = await addPlaybookDraft(s);
      expect(res.ok, s).toBe(false);
    }
    expect(h.newCampaigns).toEqual([]);
  });

  it("offers only Playbooks whose drafts save as they are: no points balance, no images", async () => {
    const { PLAYBOOK_STARTERS, starterDraft } = await import("@/lib/email-campaigns/starters");
    const { usesPointsBalance } = await import("@/lib/email-campaigns/sender");
    const { imageAssetsIn } = await import("@/lib/email-campaigns/content");
    for (const s of PLAYBOOK_STARTERS) {
      const d = starterDraft(s);
      expect(usesPointsBalance(d), s.id).toBe(false);
      expect(imageAssetsIn(d.content!), s.id).toEqual([]);
    }
  });
});

describe("the module graph", () => {
  it("never reaches the sending code: send-flow, sender or keep-sending-run", () => {
    const root = path.resolve(__dirname, "../../../../../..");
    const reached = importsOf(root, path.resolve(__dirname, "../arrange-actions.ts"));
    expect(reached.size).toBeGreaterThan(10);
    const sending = [...reached].map((f) => path.relative(root, f)).filter((f) => /(^|\/)(send-flow|sender|keep-sending-run)\.tsx?$/.test(f));
    expect(sending).toEqual([]);
    const renders = [...importsOf(root, path.resolve(__dirname, "../actions.ts"))].map((f) => path.relative(root, f));
    expect(renders).toContain("lib/email-campaigns/sender.ts");
  });
});

function importsOf(root: string, entry: string): Set<string> {
  const resolve = (from: string, spec: string) => {
    const base = spec.startsWith("@/") ? path.join(root, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
      const p = base + ext;
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    return null;
  };
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      if (m[1]) continue;
      const next = resolve(file, m[2] ?? m[3]);
      if (next) queue.push(next);
    }
  }
  return seen;
}
