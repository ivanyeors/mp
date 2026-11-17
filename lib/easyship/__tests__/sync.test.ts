import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type EasyshipSettings } from "@/lib/easyship/schema";

const h = vi.hoisted(() => ({ easyship: vi.fn(), easyshipList: vi.fn() }));
vi.mock("@/lib/easyship/client", () => ({ easyship: h.easyship, easyshipList: h.easyshipList }));
vi.mock("@/lib/site-url", () => ({ getSiteOrigin: () => "https://custom.mpillow.com" }));

const { syncEasyship } = await import("@/lib/easyship/sync");

type Call = { method: string; path: string; body?: Record<string, unknown> };
const ENDPOINT = "https://custom.mpillow.com/api/shipping/easyship/webhook";

const HQ = {
  line_1: "22 Sin Ming Lane", line_2: "#08-83, Midview City", city: "Singapore", state: null, postal_code: "573969",
  country_alpha2: "SG", company_name: "Mpillow Singapore", contact_name: "Mpillow SG",
  contact_phone: "87805311", contact_email: "sg@mpillow.com",
};

const live = {
  addresses: [{ id: "a1", status: "active", ...HQ, default_for: { pickup: true, billing: false, sender: true, return: true } }],
  boxes: [
    { id: "b-keep", name: "Keep", type: "box", outer_dimensions: { length: 20, width: 20, height: 40 }, weight: 0 },
    { id: "b-old", name: "Old", type: "box", outer_dimensions: { length: 1, width: 1, height: 1 }, weight: 0 },
    { id: "b-flat", name: "UPS Pak", type: "flat_rate_box", outer_dimensions: { length: 1, width: 1, height: 1 }, weight: 0 },
  ],
  shipping_rules: [
    { id: "r-same", name: "Same", description: "d", priority: 1, active: true, conditions: [{ id: "c", type: "match_all", options: {} }], actions: [{ id: "x", type: "force_insurance", options: { insured: true } }] },
    { id: "r-changed", name: "Changed", description: "d", priority: 2, active: true, conditions: [{ id: "c", type: "match_all", options: {} }], actions: [{ id: "x", type: "force_insurance", options: { insured: false } }] },
    { id: "r-gone", name: "Gone", description: "d", priority: 3, active: true, conditions: [{ id: "c", type: "match_all", options: {} }], actions: [{ id: "x", type: "force_insurance", options: { insured: false } }] },
  ],
  webhooks: [{ id: "w1", endpoint: ENDPOINT, event_types: ["shipment_label_created"], version: "2024-09", state: "inactive", secret_token: "webh_live" }],
};

const desired: EasyshipSettings = {
  ...DEFAULT_SETTINGS,
  tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["delivered"] },
  addresses: [
    { ...HQ, default_for: { pickup: true, billing: true, sender: true, return: true } },
    { ...HQ, line_1: "1 Warehouse Way", postal_code: "123456", company_name: "Mpillow WH", default_for: { pickup: false, billing: false, sender: false, return: false } },
  ],
  boxes: [
    { name: "Keep", outer_length: 20, outer_width: 20, outer_height: 40, weight: 0 },
    { name: "New", outer_length: 10, outer_width: 10, outer_height: 10, weight: 0.1 },
  ],
  box_for_type: { pillow: { box: "Keep", weight_grams: 1500 } },
  shipping_rules: [
    { name: "Same", description: "d", priority: 1, active: true, conditions: [{ type: "match_all", options: {} }], actions: [{ type: "force_insurance", options: { insured: true } }] },
    { name: "Changed", description: "d", priority: 2, active: true, conditions: [{ type: "match_all", options: {} }], actions: [{ type: "force_insurance", options: { insured: true } }] },
    { name: "Fresh", description: "", priority: 9, active: false, conditions: [{ type: "match_all", options: {} }], actions: [{ type: "force_insurance", options: { insured: true } }] },
  ],
  webhook: { enabled: true, event_types: ["shipment_label_created"] },
};

let calls: Call[];
let failDeleteOldBox = false;
let webhookState: "active" | "inactive" = "inactive";

beforeEach(() => {
  calls = [];
  failDeleteOldBox = false;
  webhookState = "inactive";
  h.easyshipList.mockImplementation(async (_path: string, key: string) => {
    const rows = structuredClone((live as Record<string, unknown[]>)[key] ?? []);
    if (key === "webhooks") (rows[0] as { state: string }).state = webhookState;
    return rows;
  });
  h.easyship.mockImplementation(async (path: string, init: { method?: string; body?: Record<string, unknown> } = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, path, body: init.body });
    if (path === "/account") return { account: { easyship_company_id: "CSG138001" } };
    if (method === "DELETE" && path === "/boxes/b-old" && failDeleteOldBox) throw new Error("box in use");
    if (method === "POST" && path === "/shipping_rules") return { shipping_rule: { id: `r-new-${init.body?.name}`, active: true, ...init.body } };
    if (method === "POST" && path === "/webhooks") return { webhook: { id: "w-new", state: "inactive", secret_token: "webh_new", ...init.body } };
    if (method === "PATCH" && path.startsWith("/webhooks/")) return { webhook: { ...live.webhooks[0], ...init.body } };
    return {};
  });
});

const find = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe("syncEasyship", () => {
  it("reconciles every area against the live account", async () => {
    const out = await syncEasyship(desired, ENDPOINT);

    const tracking = find("POST", "/account/settings")[0].body as { tracking_email: Record<string, unknown>; tracking_page: Record<string, unknown> };
    expect(tracking.tracking_email.allowed_statuses).toEqual(["delivered"]);
    expect("advertising" in tracking.tracking_email).toBe(false);

    expect(find("PATCH", "/addresses/a1")[0].body?.default_for).toEqual({ pickup: true, billing: true, sender: true, return: true });
    expect(find("POST", "/addresses")).toHaveLength(1);
    // Easyship rejects `false` flags on create: an address that is default for nothing sends none.
    expect("default_for" in find("POST", "/addresses")[0].body!).toBe(false);

    expect(find("POST", "/boxes").map((c) => c.body?.name)).toEqual(["New"]);
    expect(find("DELETE", "/boxes/b-old")).toHaveLength(1);
    expect(find("DELETE", "/boxes/b-flat")).toHaveLength(0);
    expect(find("PATCH", "/boxes/b-keep")).toHaveLength(0);
    // The type → box mapping is ours alone; the courier account never sees it.
    expect(calls.some((c) => JSON.stringify(c.body ?? {}).includes("box_for_type") || JSON.stringify(c.body ?? {}).includes("weight_grams"))).toBe(false);

    expect(find("DELETE", "/shipping_rules/r-same")).toHaveLength(0);
    expect(find("DELETE", "/shipping_rules/r-changed")).toHaveLength(1);
    expect(find("DELETE", "/shipping_rules/r-gone")).toHaveLength(1);
    expect(find("POST", "/shipping_rules").map((c) => c.body?.name).sort()).toEqual(["Changed", "Fresh"]);
    expect(find("POST", "/shipping_rules/r-new-Fresh/deactivate")).toHaveLength(1);
    expect(find("POST", "/shipping_rules/r-new-Changed/deactivate")).toHaveLength(0);

    expect(find("POST", "/webhooks/w1/activate")).toHaveLength(1);
    expect(out.webhook_secret_token).toBe("webh_live");
    expect(out.easyship_company_id).toBe("CSG138001");
    expect(out.report.ok).toBe(true);
  });

  it("keeps going after an error and reports it", async () => {
    failDeleteOldBox = true;
    const { report } = await syncEasyship(desired, ENDPOINT);
    expect(report.ok).toBe(false);
    expect(report.steps.find((s) => s.action === "error")?.area).toBe("boxes");
    expect(report.steps.some((s) => s.area === "webhook" && s.action === "activated")).toBe(true);
  });

  it("deactivates the webhook when disabled and skips it off a public origin", async () => {
    webhookState = "active";
    const off = { ...desired, webhook: { ...desired.webhook, enabled: false } };
    const { report } = await syncEasyship(off, ENDPOINT);
    expect(find("POST", "/webhooks/w1/deactivate")).toHaveLength(1);
    expect(report.ok).toBe(true);

    calls = [];
    const { report: local } = await syncEasyship(desired, null);
    expect(calls.some((c) => c.path.startsWith("/webhooks"))).toBe(false);
    expect(local.steps.find((s) => s.area === "webhook")?.action).toBe("skipped");
  });

  it("updates a renamed company at the same address instead of adding a second one", async () => {
    const renamed = { ...desired, addresses: [{ ...desired.addresses[0], company_name: "Mellow Life" }] };
    await syncEasyship(renamed, ENDPOINT);
    expect(find("POST", "/addresses")).toHaveLength(0);
    expect(find("PATCH", "/addresses/a1")[0].body?.company_name).toBe("Mellow Life");
  });

  it("creates a moved address with only its true default flags", async () => {
    // The studio moved: a new line 1 and postal code match no live address, so it is created.
    const moved = {
      ...desired,
      addresses: [{
        ...HQ, line_1: "8 New Studio Road", line_2: "#01-01", postal_code: "654321",
        default_for: { pickup: true, billing: false, sender: true, return: true },
      }],
    };
    const { report } = await syncEasyship(moved, ENDPOINT);
    const [created] = find("POST", "/addresses");
    expect(created.body).toMatchObject({ line_1: "8 New Studio Road", postal_code: "654321" });
    expect(created.body?.default_for).toEqual({ pickup: true, sender: true, return: true });
    expect(report.steps.find((s) => s.area === "addresses")?.action).toBe("created");
  });
});

describe("courierEmailStatuses", () => {
  it("switches the courier's emails off only while tracking webhooks reach us", async () => {
    const { courierEmailStatuses } = await import("@/lib/easyship/sync");
    const s = { ...DEFAULT_SETTINGS, tracking_email: { ...DEFAULT_SETTINGS.tracking_email, allowed_statuses: ["delivered" as const] } };
    expect(courierEmailStatuses({ ...s, webhook: { enabled: true, event_types: ["shipment_tracking_status_changed"] } })).toEqual([]);
    expect(courierEmailStatuses({ ...s, webhook: { enabled: false, event_types: ["shipment_tracking_status_changed"] } })).toEqual(["delivered"]);
    expect(courierEmailStatuses({ ...s, webhook: { enabled: true, event_types: ["shipment_label_created"] } })).toEqual(["delivered"]);
  });
});
