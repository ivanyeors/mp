import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  customerForCustomisation: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "127.0.0.1",
  rateLimitExceeded: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/results/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/access")>()),
  requireResultAccess: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/crm/customisation-customer", () => ({
  customerForCustomisation: h.customerForCustomisation,
}));
vi.mock("@/lib/discovery-source", () => ({
  getDiscoverySourceCatalog: vi.fn().mockResolvedValue([]),
  validateDiscoverySource: () => null,
  normalizeDiscoverySourceOther: () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = { from: () => b, select: () => b, eq: () => b, maybeSingle: h.maybeSingle, upsert: h.upsert };
    return b;
  },
}));

const { POST } = await import("@/app/api/mp-config/responses/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("https://x.test/api/mp-config/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ID, data: { name: "Ada" }, ...body }),
    }),
  );

const written = () => h.upsert.mock.calls[0]![0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockResolvedValue({ error: null });
  h.customerForCustomisation.mockResolvedValue("c-1");
});

describe("POST /api/mp-config/responses — the first question's email", () => {
  it("creates the Draft Result with the email, trimmed and lower-cased", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await post({ draftEmail: "  Ada@Example.COM ", marketingEmail: true });
    expect(res.status).toBe(200);
    expect(written().customer_email).toBe("ada@example.com");
    expect(h.customerForCustomisation).toHaveBeenCalledWith(
      expect.anything(),
      { email: "ada@example.com", name: "Ada" },
      true,
    );
  });

  it("makes the email a Customer even with the box unticked, which records no consent (ADR 0051)", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await post({ draftEmail: "ada@example.com" });
    expect(h.customerForCustomisation).toHaveBeenCalledWith(
      expect.anything(),
      { email: "ada@example.com", name: "Ada" },
      false,
    );
  });

  it("changes the email on an existing Draft", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: {} }, error: null });
    await post({ draftEmail: "new@example.com", marketingEmail: true });
    expect(written().customer_email).toBe("new@example.com");
  });

  it("never points a held Result's email elsewhere", async () => {
    h.maybeSingle.mockResolvedValue({
      data: { status: "held", customer_email: "owner@example.com", data: {} },
      error: null,
    });
    const res = await post({ draftEmail: "someone-else@example.com", marketingEmail: true });
    expect(res.status).toBe(200);
    expect(written()).not.toHaveProperty("customer_email");
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });

  it("leaves customer_email alone on an autosave that sends no email", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: {} }, error: null });
    await post({});
    expect(written()).not.toHaveProperty("customer_email");
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });

  it("refuses an address that is not an email", async () => {
    const res = await post({ draftEmail: "not-an-email" });
    expect(res.status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("keeps the configurator it was started in, beside the answers, for its continue link", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await post({ draftEmail: "ada@example.com", configurator: "basic" });
    expect(written().data).toEqual(expect.objectContaining({ name: "Ada", configurator: "basic" }));
  });

  it("keeps a stored configurator through an autosave that does not send one", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: { configurator: "basic" } }, error: null });
    await post({});
    expect(written().data).toEqual(expect.objectContaining({ name: "Ada", configurator: "basic" }));
  });

  it("writes no configurator without the first question's email", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    await post({ configurator: "basic" });
    expect(written().data).not.toHaveProperty("configurator");
  });

  it("records no consent when the save fails", async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    h.upsert.mockResolvedValue({ error: { message: "connection reset" } });
    const res = await post({ draftEmail: "ada@example.com", marketingEmail: true });
    expect(res.status).toBe(500);
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });
});

describe("POST /api/mp-config/responses — Save without purchasing", () => {
  const save = (extra: Record<string, unknown> = {}) =>
    post({
      persistContact: true,
      email: "Shopper@Example.com",
      phone: "9123 4567",
      discoverySource: "instagram",
      ...extra,
    });

  it("makes the contact a Customer, with its name and mobile, and the box", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: {} }, error: null });
    const res = await save({ marketingEmail: true });
    expect(res.status).toBe(200);
    expect(h.customerForCustomisation).toHaveBeenCalledWith(
      expect.anything(),
      { email: "Shopper@Example.com", name: "Ada", phone: written().customer_phone },
      true,
    );
    expect(written().customer_phone).toBeTruthy();
  });

  it("an unticked box still makes the Customer, and records no consent", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: {} }, error: null });
    await save();
    expect(h.customerForCustomisation).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  });

  it("records nothing when the save fails", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: null, data: {} }, error: null });
    h.upsert.mockResolvedValue({ error: { message: "connection reset" } });
    const res = await save({ marketingEmail: true });
    expect(res.status).toBe(500);
    expect(h.customerForCustomisation).not.toHaveBeenCalled();
  });
});
