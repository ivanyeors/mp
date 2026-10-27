import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PRD-crm-retention-loop slice 02: the Result page resolves *Open customer*
 * on the server, only for a role holding `customers`, and a failed lookup
 * never fails the page.
 */

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  lookup: vi.fn(async (): Promise<string | null> => "c-456"),
  props: null as unknown,
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminPage: vi.fn(async () => ({ permissions: h.permissions, email: "owner@mpillow.com" })),
}));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/crm/customer-link", () => ({ customerIdForResult: h.lookup }));
vi.mock("@/lib/results/admin/response-detail", () => ({
  loadMpConfigResponseDetail: vi.fn(async () => ({
    status: 200,
    body: {
      ok: true,
      response: { id: "r1", status: "accepted", customer_id: null, customer_email: "mei@example.com" },
      order_number: null,
      order: null,
      suggestion: { recommended: null },
    },
  })),
}));
vi.mock("@/lib/results/admin/detail-prep", () => ({
  canAssignResult: () => false,
  loadFillingItems: vi.fn(),
  loadResultAssignPrep: vi.fn(),
}));
vi.mock("../[id]/result-detail-client", () => ({
  default: (props: unknown) => {
    h.props = props;
    return null;
  },
}));

const { default: ResultDetailRoute } = await import("../[id]/page");

const open = async (...keys: string[]) => {
  h.permissions = new Set(["results", ...keys]);
  const el = await ResultDetailRoute({ params: Promise.resolve({ lang: "en-US", id: "r1" }) });
  return (el as { props: { initialData: { customerId: string | null } } }).props.initialData;
};

beforeEach(() => {
  h.lookup.mockClear();
  h.lookup.mockImplementation(async () => "c-456");
});

describe("Result page: Open customer", () => {
  it("resolves the Customer for a role holding customers", async () => {
    expect((await open("customers")).customerId).toBe("c-456");
    expect(h.lookup).toHaveBeenCalledWith({}, expect.objectContaining({ customer_email: "mei@example.com" }));
  });

  it("does not look for one without customers", async () => {
    expect((await open()).customerId).toBeNull();
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("renders the page without the link when the lookup fails", async () => {
    h.lookup.mockImplementation(async () => {
      throw new Error("network");
    });
    expect((await open("customers")).customerId).toBeNull();
  });
});
