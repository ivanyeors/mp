import { describe, it, expect, vi, beforeEach } from "vitest";

const productsUpdate = vi.fn(async () => ({ id: "prod_x" }));
const productsCreate = vi.fn(async () => ({ id: "prod_fresh" }));
const pricesRetrieve = vi.fn();
const pricesUpdate = vi.fn();
const pricesCreate = vi.fn();
const paymentLinksUpdate = vi.fn();
const paymentLinksCreate = vi.fn();
vi.mock("../client", () => ({
  getStripe: () => ({
    products: { update: productsUpdate, create: productsCreate },
    prices: { create: pricesCreate, retrieve: pricesRetrieve, update: pricesUpdate },
    paymentLinks: { update: paymentLinksUpdate, create: paymentLinksCreate },
  }),
}));

type Variant = {
  id: string;
  title: string;
  sku: string;
  price: number;
  currency: string;
  stripe_price_id: string | null;
  stripe_price_id_test: string | null;
  is_active: boolean;
  position: number;
};

const product: {
  id: string;
  slug: string;
  content: Record<string, { title: string }>;
  stripe_product_id: string | null;
  stripe_product_id_test: string | null;
  stripe_payment_link_id: string | null;
  product_variants: Variant[];
  product_images: unknown[];
} = {
  id: "p1",
  slug: "x",
  content: { "en-US": { title: "X" } },
  stripe_product_id: "prod_live_x",
  stripe_product_id_test: "prod_x",
  stripe_payment_link_id: null,
  product_variants: [],
  product_images: [],
};

const rowUpdates: { table: string; values: Record<string, unknown> }[] = [];
const callLog: string[] = [];
const updateErrorFor: Record<string, { message: string } | null> = {};
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: product }) }) }),
      update: (values: Record<string, unknown>) => {
        rowUpdates.push({ table, values });
        if (table === "product_variants") {
          callLog.push(`save ${String(values.stripe_price_id_test)}`);
        }
        return { eq: async () => ({ error: updateErrorFor[table] ?? null }) };
      },
    }),
  }),
}));

const { syncProductToStripe, syncProductToStripeSafe, createPaymentLink } = await import("../sync");

function variant(id = "v1", priceId = "price_old"): Variant {
  return {
    id,
    title: "Basic",
    sku: `MP-${id}`,
    price: 10,
    currency: "SGD",
    stripe_price_id: null,
    stripe_price_id_test: priceId,
    is_active: true,
    position: 0,
  };
}

const samePrice = {
  unit_amount: 1000,
  currency: "sgd",
  tax_behavior: "exclusive",
  nickname: "Basic",
};
const oldAmount = { ...samePrice, unit_amount: 900 };

const rateLimited = Object.assign(new Error("Too many requests"), { code: "rate_limit" });
const createFailed = Object.assign(new Error("Stripe is unavailable"), { code: "api_error" });
const missing = Object.assign(new Error("No such object"), { code: "resource_missing" });

const retrieveFor = new Map<string, typeof samePrice | Error>();
const archiveFails = new Map<string, Error>();
const renameFails = new Map<string, Error>();
let createQueue: (string | Error)[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [pricesRetrieve, pricesUpdate, pricesCreate, paymentLinksUpdate, paymentLinksCreate]) {
    fn.mockReset();
  }
  rowUpdates.length = 0;
  callLog.length = 0;
  retrieveFor.clear();
  archiveFails.clear();
  renameFails.clear();
  createQueue = [];
  for (const k of Object.keys(updateErrorFor)) delete updateErrorFor[k];
  product.stripe_product_id_test = "prod_x";
  product.stripe_payment_link_id = null;
  product.product_variants = [];
  pricesRetrieve.mockImplementation(async (id: string) => {
    const found = retrieveFor.get(id) ?? samePrice;
    if (found instanceof Error) throw found;
    return { ...found, id };
  });
  pricesUpdate.mockImplementation(async (id: string, params: { active?: boolean }) => {
    const failure = params.active === false ? archiveFails.get(id) : renameFails.get(id);
    callLog.push(`${params.active === false ? "archive" : "rename"} ${id}`);
    if (failure) throw failure;
    return {};
  });
  pricesCreate.mockImplementation(async () => {
    callLog.push("create");
    const next = createQueue.shift() ?? "price_new";
    if (next instanceof Error) throw next;
    return { id: next };
  });
  paymentLinksUpdate.mockResolvedValue({});
  paymentLinksCreate.mockResolvedValue({ id: "plink_new", url: "https://buy.stripe.com/new" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncProductToStripeSafe", () => {
  it("returns synced:true with the sync result on success", async () => {
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(true);
    expect(out.result?.stripeProductId).toBe("prod_x");
    expect(out.result?.variants).toEqual([]);
  });

  it("touches this account's product, not the one beside it", async () => {
    await syncProductToStripeSafe("p1");
    expect(productsUpdate).toHaveBeenCalledWith("prod_x", expect.anything());
    expect(productsCreate).not.toHaveBeenCalled();
  });

  it("creates fresh rather than reusing the other account's id", async () => {
    product.stripe_product_id_test = null;
    const out = await syncProductToStripeSafe("p1");
    expect(productsUpdate).not.toHaveBeenCalled();
    expect(productsCreate).toHaveBeenCalled();
    expect(out.result?.stripeProductId).toBe("prod_fresh");
  });

  it("swallows errors and returns synced:false (never throws)", async () => {
    productsUpdate.mockRejectedValueOnce(new Error("boom"));
    const out = await syncProductToStripeSafe("p1");
    expect(out.synced).toBe(false);
    expect(out.error).toBe("boom");
  });
});

describe("syncProductToStripe: a variant's Stripe Price", () => {
  beforeEach(() => {
    product.product_variants = [variant()];
  });

  it("keeps the existing Price when amount, currency and tax behaviour match", async () => {
    const out = await syncProductToStripe("p1");
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_old" }]);
    expect(callLog).toEqual(["save price_old"]);
  });

  it("archives the old Price, then creates and saves the new one, when the amount changed", async () => {
    retrieveFor.set("price_old", oldAmount);
    const out = await syncProductToStripe("p1");
    expect(pricesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ product: "prod_x", unit_amount: 1000, currency: "sgd" }),
    );
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_new" }]);
    expect(callLog).toEqual(["archive price_old", "create", "save price_new"]);
  });

  it("1. mismatch, archive fails: still creates and saves, then names the old Price", async () => {
    retrieveFor.set("price_old", oldAmount);
    archiveFails.set("price_old", rateLimited);
    await expect(syncProductToStripe("p1")).rejects.toThrow(
      "The new prices are in place, but Stripe needs attention: old price price_old is still active and needs archiving in Stripe (Too many requests)",
    );
    expect(callLog).toEqual(["archive price_old", "create", "save price_new"]);
  });

  it("2. mismatch, archive succeeds, create fails: archived first, nothing saved, create error rethrown", async () => {
    retrieveFor.set("price_old", oldAmount);
    createQueue = [createFailed];
    await expect(syncProductToStripe("p1")).rejects.toBe(createFailed);
    expect(callLog).toEqual(["archive price_old", "create"]);
    expect(rowUpdates).toEqual([]);
  });

  it("3. an earlier archive notice survives a later create failure", async () => {
    product.product_variants = [variant("v1", "price_old"), variant("v2", "price_old_2")];
    retrieveFor.set("price_old", oldAmount);
    retrieveFor.set("price_old_2", oldAmount);
    archiveFails.set("price_old", rateLimited);
    createQueue = ["price_new_1", createFailed];
    const run = syncProductToStripe("p1");
    await expect(run).rejects.toThrow(/Stripe is unavailable/);
    await expect(run).rejects.toThrow(/old price price_old is still active and needs archiving in Stripe/);
    expect(callLog).toEqual([
      "archive price_old",
      "create",
      "save price_new_1",
      "archive price_old_2",
      "create",
    ]);
  });

  it("4. an earlier archive failure doesn't stop later variants, and names only that Price", async () => {
    product.product_variants = [variant("v1", "price_old"), variant("v2", "price_old_2")];
    retrieveFor.set("price_old", oldAmount);
    retrieveFor.set("price_old_2", oldAmount);
    archiveFails.set("price_old", rateLimited);
    createQueue = ["price_new_1", "price_new_2"];
    const run = syncProductToStripe("p1");
    await expect(run).rejects.toThrow(/price price_old is still active/);
    await expect(run).rejects.not.toThrow(/price_old_2/);
    expect(callLog).toEqual([
      "archive price_old",
      "create",
      "save price_new_1",
      "archive price_old_2",
      "create",
      "save price_new_2",
    ]);
  });

  it("5. unreadable Price: creates, saves, then archives the unread one, and resolves", async () => {
    retrieveFor.set("price_old", rateLimited);
    const out = await syncProductToStripe("p1");
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_new" }]);
    expect(callLog).toEqual(["create", "save price_new", "archive price_old"]);
  });

  it("6. unreadable Price whose archive after the save fails: saved, and named", async () => {
    retrieveFor.set("price_old", rateLimited);
    archiveFails.set("price_old", rateLimited);
    await expect(syncProductToStripe("p1")).rejects.toThrow(
      /old price price_old is still active and needs archiving in Stripe/,
    );
    expect(callLog).toEqual(["create", "save price_new", "archive price_old"]);
  });

  it("7. unreadable Price, create fails: create error rethrown, nothing saved or archived", async () => {
    retrieveFor.set("price_old", rateLimited);
    createQueue = [createFailed];
    await expect(syncProductToStripe("p1")).rejects.toBe(createFailed);
    expect(callLog).toEqual(["create"]);
    expect(rowUpdates).toEqual([]);
  });

  it("an unreadable Price is left alone when the new id can't be saved, since the row still points at it", async () => {
    retrieveFor.set("price_old", rateLimited);
    updateErrorFor.product_variants = { message: "connection reset" };
    await expect(syncProductToStripe("p1")).rejects.toThrow(/Couldn't save the Stripe price/);
    expect(callLog).toEqual(["create", "save price_new"]);
  });

  it("8. a failed rename keeps the Price, later variants still sync, and the rename is named", async () => {
    product.product_variants = [variant("v1", "price_old"), variant("v2", "price_old_2")];
    retrieveFor.set("price_old", { ...samePrice, nickname: "Old name" });
    retrieveFor.set("price_old_2", oldAmount);
    renameFails.set("price_old", rateLimited);
    const run = syncProductToStripe("p1");
    await expect(run).rejects.toThrow(/couldn't rename price price_old \(Too many requests\)/);
    expect(pricesCreate).toHaveBeenCalledTimes(1);
    expect(callLog).toEqual([
      "rename price_old",
      "save price_old",
      "archive price_old_2",
      "create",
      "save price_new",
    ]);
  });

  it("9a. stored Price missing: creates and saves, archives nothing", async () => {
    retrieveFor.set("price_old", missing);
    const out = await syncProductToStripe("p1");
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_new" }]);
    expect(callLog).toEqual(["create", "save price_new"]);
  });

  it("9b. old Price already gone when archiving: resolves", async () => {
    retrieveFor.set("price_old", oldAmount);
    archiveFails.set("price_old", missing);
    const out = await syncProductToStripe("p1");
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_new" }]);
  });

  it("a failed row save still aborts with the save error when nothing else went wrong", async () => {
    retrieveFor.set("price_old", oldAmount);
    updateErrorFor.product_variants = { message: "connection reset" };
    await expect(syncProductToStripe("p1")).rejects.toThrow(
      "Couldn't save the Stripe price for variant MP-v1: connection reset",
    );
  });
});

describe("createPaymentLink", () => {
  beforeEach(() => {
    product.product_variants = [variant()];
    product.stripe_payment_link_id = "plink_old";
  });

  it("deactivates the old link, then creates and saves the new one", async () => {
    const out = await createPaymentLink("p1");
    expect(paymentLinksUpdate).toHaveBeenCalledWith("plink_old", { active: false });
    expect(paymentLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_old", quantity: 1 }] }),
    );
    expect(out).toEqual({ id: "plink_new", url: "https://buy.stripe.com/new" });
    expect(rowUpdates).toContainEqual({
      table: "products",
      values: { stripe_payment_link: "https://buy.stripe.com/new", stripe_payment_link_id: "plink_new" },
    });
  });

  it("fails without a new link or a row change when deactivating the old link fails", async () => {
    paymentLinksUpdate.mockRejectedValueOnce(rateLimited);
    await expect(createPaymentLink("p1")).rejects.toBe(rateLimited);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(rowUpdates).toEqual([]);
  });

  it("creates and saves a new link when the old one is not in this Stripe account", async () => {
    paymentLinksUpdate.mockRejectedValueOnce(missing);
    const out = await createPaymentLink("p1");
    expect(paymentLinksCreate).toHaveBeenCalledTimes(1);
    expect(out.id).toBe("plink_new");
    expect(rowUpdates).toContainEqual({
      table: "products",
      values: { stripe_payment_link: "https://buy.stripe.com/new", stripe_payment_link_id: "plink_new" },
    });
  });

  it("names the new link when its id can't be saved", async () => {
    updateErrorFor.products = { message: "connection reset" };
    await expect(createPaymentLink("p1")).rejects.toThrow(
      /plink_new.*couldn't save.*connection reset/,
    );
  });
});
