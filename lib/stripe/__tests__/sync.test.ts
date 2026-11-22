import { describe, it, expect, vi, beforeEach } from "vitest";

const productsUpdate = vi.fn(async () => ({ id: "prod_x" }));
const productsCreate = vi.fn(async () => ({ id: "prod_fresh" }));
const pricesRetrieve = vi.fn();
const pricesUpdate = vi.fn();
const pricesCreate = vi.fn();
const paymentLinksUpdate = vi.fn();
const paymentLinksCreate = vi.fn();
const paymentLinksListLineItems = vi.fn();
const paymentLinksRetrieve = vi.fn();
vi.mock("../client", () => ({
  getStripe: () => ({
    products: { update: productsUpdate, create: productsCreate },
    prices: { create: pricesCreate, retrieve: pricesRetrieve, update: pricesUpdate },
    paymentLinks: {
      update: paymentLinksUpdate,
      create: paymentLinksCreate,
      listLineItems: paymentLinksListLineItems,
      retrieve: paymentLinksRetrieve,
    },
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
  stripe_payment_link: string | null;
  stripe_payment_link_id: string | null;
  stripe_payment_link_test: string | null;
  stripe_payment_link_id_test: string | null;
  product_variants: Variant[];
  product_images: unknown[];
} = {
  id: "p1",
  slug: "x",
  content: { "en-US": { title: "X" } },
  stripe_product_id: "prod_live_x",
  stripe_product_id_test: "prod_x",
  stripe_payment_link: null,
  stripe_payment_link_id: null,
  stripe_payment_link_test: null,
  stripe_payment_link_id_test: null,
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
        if (table === "products") callLog.push(`row ${JSON.stringify(values)}`);
        const filters: [string, unknown][] = [];
        const answer = () => {
          const error = updateErrorFor[table] ?? null;
          const row = product as unknown as Record<string, unknown>;
          const matches = filters.every(([column, value]) => column === "id" || row[column] === value);
          return { error, data: error ? null : matches ? [{ id: product.id }] : [] };
        };
        type Chain = {
          eq: (column: string, value: unknown) => Chain;
          select: () => Promise<ReturnType<typeof answer>>;
          then: (resolve: (v: ReturnType<typeof answer>) => unknown) => unknown;
        };
        const chain: Chain = {
          eq: (column, value) => (filters.push([column, value]), chain),
          select: async () => answer(),
          then: (resolve) => resolve(answer()),
        };
        return chain;
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
  active: true,
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
const linkFailures: Error[] = [];
const linkLines = new Map<string, (string | null)[] | Error>();
const linkActive = new Map<string, boolean | Error>();

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [
    pricesRetrieve,
    pricesUpdate,
    pricesCreate,
    paymentLinksUpdate,
    paymentLinksCreate,
    paymentLinksListLineItems,
    paymentLinksRetrieve,
  ]) {
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
  product.stripe_product_id = "prod_live_x";
  product.stripe_payment_link = null;
  product.stripe_payment_link_id = null;
  product.stripe_payment_link_test = null;
  product.stripe_payment_link_id_test = null;
  product.product_variants = [];
  delete process.env.STRIPE_SECRET_KEY;
  linkFailures.length = 0;
  linkLines.clear();
  linkActive.clear();
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
  paymentLinksUpdate.mockImplementation(async (id: string) => {
    callLog.push(`deactivate ${id}`);
    const failure = linkFailures.shift();
    if (failure) throw failure;
    return {};
  });
  paymentLinksListLineItems.mockImplementation(async (id: string) => {
    callLog.push(`read link ${id}`);
    const found = linkLines.get(id) ?? [];
    if (found instanceof Error) throw found;
    return { data: found.map((price) => ({ price: price === null ? null : { id: price } })), has_more: false };
  });
  paymentLinksRetrieve.mockImplementation(async (id: string) => {
    callLog.push(`retrieve link ${id}`);
    const active = linkActive.get(id) ?? true;
    if (active instanceof Error) throw active;
    return { id, active };
  });
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

  it("4. an archived stored Price at the right amount is replaced, without archiving it again", async () => {
    retrieveFor.set("price_old", { ...samePrice, active: false });
    const out = await syncProductToStripe("p1");
    expect(out.variants).toEqual([{ id: "v1", stripePriceId: "price_new" }]);
    expect(callLog).toEqual(["create", "save price_new"]);
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


const { StripeNeedsAttentionError } = await import("../sync");

const LIVE_LINK_SAVED = { stripe_payment_link: "https://buy.stripe.com/new", stripe_payment_link_id: "plink_new" };
const SANDBOX_LINK_SAVED = {
  stripe_payment_link_test: "https://buy.stripe.com/new",
  stripe_payment_link_id_test: "plink_new",
};
const SANDBOX_LINK_CLEARED = { stripe_payment_link_test: null, stripe_payment_link_id_test: null };
const LIVE_LINK_CLEARED = { stripe_payment_link: null, stripe_payment_link_id: null };
const RETIRED =
  "Stripe payment link plink_old sold at a price this product no longer has, so it was deactivated; generate a new one";

async function attentionFrom(run: Promise<unknown>) {
  const err = await run.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(StripeNeedsAttentionError);
  return err as InstanceType<typeof StripeNeedsAttentionError>;
}

describe("createPaymentLink", () => {
  beforeEach(() => {
    product.product_variants = [variant()];
    product.stripe_payment_link_id_test = "plink_old";
  });

  it("deactivates the old link, then creates and saves the new one", async () => {
    const out = await createPaymentLink("p1");
    expect(paymentLinksUpdate).toHaveBeenCalledWith("plink_old", { active: false });
    expect(paymentLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_old", quantity: 1 }] }),
    );
    expect(out).toEqual({ id: "plink_new", url: "https://buy.stripe.com/new" });
    expect(rowUpdates).toContainEqual({ table: "products", values: SANDBOX_LINK_SAVED });
  });

  it("fails without a new link or a row change when deactivating the old link fails and it is still active", async () => {
    linkFailures.push(rateLimited);
    await expect(createPaymentLink("p1")).rejects.toBe(rateLimited);
    expect(callLog).toEqual(["deactivate plink_old", "retrieve link plink_old"]);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(rowUpdates).toEqual([]);
  });

  it("D. an old link that is already inactive counts as deactivated, so a new one is made", async () => {
    linkFailures.push(Object.assign(new Error("This link is already inactive"), { code: "parameter_invalid" }));
    linkActive.set("plink_old", false);
    const out = await createPaymentLink("p1");
    expect(out.id).toBe("plink_new");
    expect(rowUpdates).toContainEqual({ table: "products", values: SANDBOX_LINK_SAVED });
  });

  it("D. the original error stands when the link can't be read back either", async () => {
    linkFailures.push(rateLimited);
    linkActive.set("plink_old", rateLimited);
    await expect(createPaymentLink("p1")).rejects.toBe(rateLimited);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
  });

  it("creates and saves a new link when the old one is not in this Stripe account", async () => {
    linkFailures.push(missing);
    const out = await createPaymentLink("p1");
    expect(paymentLinksCreate).toHaveBeenCalledTimes(1);
    expect(out.id).toBe("plink_new");
    expect(rowUpdates).toContainEqual({ table: "products", values: SANDBOX_LINK_SAVED });
  });

  it("names the new link when its id can't be saved", async () => {
    updateErrorFor.products = { message: "connection reset" };
    await expect(createPaymentLink("p1")).rejects.toThrow(
      /plink_new.*couldn't save.*connection reset/,
    );
  });

  it.each([
    ["archived", { ...samePrice, active: false }],
    ["at another amount", oldAmount],
    ["in another currency", { ...samePrice, currency: "usd" }],
    ["missing", missing],
  ])("E. refuses, before touching any link, when the default Variant's Price is %s", async (_, price) => {
    retrieveFor.set("price_old", price);
    await expect(createPaymentLink("p1")).rejects.toThrow(/out of date\. Sync to Stripe first/);
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(rowUpdates).toEqual([]);
  });

  it("E. a fractional price matches its Price in cents (19.99 is 1999)", async () => {
    product.product_variants = [{ ...variant(), price: 19.99 }];
    retrieveFor.set("price_old", { ...samePrice, unit_amount: 1999 });
    const out = await createPaymentLink("p1");
    expect(out.id).toBe("plink_new");
  });

  it("E. a Price that can't be read stops the link with Stripe's error", async () => {
    retrieveFor.set("price_old", rateLimited);
    await expect(createPaymentLink("p1")).rejects.toBe(rateLimited);
    expect(paymentLinksCreate).not.toHaveBeenCalled();
  });

  it("test mode: reads and writes only the _test columns; the live link is neither deactivated nor overwritten", async () => {
    product.stripe_payment_link = "https://buy.stripe.com/live";
    product.stripe_payment_link_id = "plink_live";
    product.stripe_payment_link_id_test = null;
    await createPaymentLink("p1");
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(rowUpdates).toEqual([{ table: "products", values: SANDBOX_LINK_SAVED }]);
  });

  it("live mode: reads and writes only the live columns; the sandbox link is neither deactivated nor overwritten", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    product.product_variants = [{ ...variant(), stripe_price_id: "price_live" }];
    product.stripe_payment_link_test = "https://buy.stripe.com/test_sandbox";
    product.stripe_payment_link_id_test = "plink_sandbox";
    await createPaymentLink("p1");
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(paymentLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: "price_live", quantity: 1 }] }),
    );
    expect(rowUpdates).toEqual([{ table: "products", values: LIVE_LINK_SAVED }]);
  });

  it("live mode: deactivates its own old live link", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    product.product_variants = [{ ...variant(), stripe_price_id: "price_live" }];
    product.stripe_payment_link_id = "plink_live_old";
    await createPaymentLink("p1");
    expect(callLog[0]).toBe("deactivate plink_live_old");
  });

  it("test mode before the migration: refuses before calling Stripe, rather than orphaning a link", async () => {
    const row = product as Partial<typeof product>;
    delete row.stripe_payment_link_test;
    delete row.stripe_payment_link_id_test;
    product.stripe_payment_link_id = "plink_live";
    await expect(createPaymentLink("p1")).rejects.toThrow(/stripe_payment_link_per_mode/);
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(paymentLinksCreate).not.toHaveBeenCalled();
    expect(rowUpdates).toEqual([]);
  });
});

describe("syncProductToStripe: a payment link never outlives its Price", () => {
  beforeEach(() => {
    product.product_variants = [variant()];
    product.stripe_payment_link_test = "https://buy.stripe.com/test_old";
    product.stripe_payment_link_id_test = "plink_old";
    product.stripe_payment_link = "https://buy.stripe.com/live";
    product.stripe_payment_link_id = "plink_live";
    linkLines.set("plink_old", ["price_old"]);
  });

  it("no link stored for this mode: nothing is read", async () => {
    product.stripe_payment_link_test = null;
    product.stripe_payment_link_id_test = null;
    const out = await syncProductToStripe("p1");
    expect(paymentLinksListLineItems).not.toHaveBeenCalled();
    expect(out.notices).toEqual([]);
    expect(out.paymentLinkCleared).toBe(false);
  });

  it("a price change retires the link bound to the replaced Price, clears only this mode's row, and resolves", async () => {
    retrieveFor.set("price_old", oldAmount);
    const out = await syncProductToStripe("p1");
    expect(callLog).toEqual([
      "archive price_old",
      "create",
      "save price_new",
      "read link plink_old",
      "deactivate plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
    ]);
    expect(out.notices).toEqual([RETIRED]);
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("live mode retires the live link and clears only the live columns", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_x";
    product.product_variants = [{ ...variant(), stripe_price_id: "price_live_old" }];
    retrieveFor.set("price_live_old", oldAmount);
    linkLines.set("plink_live", ["price_live_old"]);
    const out = await syncProductToStripe("p1");
    expect(callLog.slice(-3)).toEqual([
      "read link plink_live",
      "deactivate plink_live",
      `row ${JSON.stringify(LIVE_LINK_CLEARED)}`,
    ]);
    expect(paymentLinksListLineItems).not.toHaveBeenCalledWith("plink_old", expect.anything());
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("a link whose Price is still a current Variant's Price is left alone", async () => {
    const out = await syncProductToStripe("p1");
    expect(callLog).toEqual(["save price_old", "read link plink_old"]);
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(rowUpdates.filter((u) => u.table === "products")).toEqual([]);
    expect(out.notices).toEqual([]);
    expect(out.paymentLinkCleared).toBe(false);
  });

  it("G. a two-line link where one Price is current and one is not is retired", async () => {
    product.product_variants = [variant("v1", "price_old"), { ...variant("v2", "price_b"), position: 1 }];
    linkLines.set("plink_old", ["price_old", "price_gone"]);
    const out = await syncProductToStripe("p1");
    expect(callLog).toContain("deactivate plink_old");
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("G. a two-line link whose Prices are both current is left alone", async () => {
    product.product_variants = [variant("v1", "price_old"), { ...variant("v2", "price_b"), position: 1 }];
    linkLines.set("plink_old", ["price_old", "price_b"]);
    const out = await syncProductToStripe("p1");
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(out.paymentLinkCleared).toBe(false);
  });

  it("G. a line with no Price is retired", async () => {
    linkLines.set("plink_old", [null]);
    const out = await syncProductToStripe("p1");
    expect(callLog).toContain("deactivate plink_old");
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("a link selling only an inactive Variant's Price is retired", async () => {
    product.product_variants = [
      variant("v1", "price_other"),
      { ...variant("v2", "price_old"), is_active: false, position: 1 },
    ];
    const out = await syncProductToStripe("p1");
    expect(callLog).toContain("deactivate plink_old");
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("deactivate fails with a rate limit: rejects naming the link, keeps the row, and the next sync tries again", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkFailures.push(rateLimited);
    const err = await attentionFrom(syncProductToStripe("p1"));
    expect(err.message).toBe(
      "The new prices are in place, but Stripe needs attention: Stripe payment link plink_old still sells at a price this product no longer has and needs deactivating in Stripe (Too many requests)",
    );
    expect(err.paymentLinkCleared).toBe(false);
    expect(rowUpdates.filter((u) => u.table === "products")).toEqual([]);

    callLog.length = 0;
    product.product_variants = [variant("v1", "price_new")];
    const out = await syncProductToStripe("p1");
    expect(callLog).toEqual([
      "save price_new",
      "read link plink_old",
      "deactivate plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
    ]);
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("D. deactivate refused but the link is already inactive: counts as deactivated, row cleared, resolves", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkFailures.push(Object.assign(new Error("already inactive"), { code: "parameter_invalid" }));
    linkActive.set("plink_old", false);
    const out = await syncProductToStripe("p1");
    expect(callLog.slice(-3)).toEqual([
      "deactivate plink_old",
      "retrieve link plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
    ]);
    expect(out.notices).toEqual([RETIRED]);
  });

  it("the link read fails with a rate limit: attention message, row untouched", async () => {
    linkLines.set("plink_old", rateLimited);
    await expect(syncProductToStripe("p1")).rejects.toThrow(
      "Stripe needs attention: couldn't check Stripe payment link plink_old (Too many requests)",
    );
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(rowUpdates.filter((u) => u.table === "products")).toEqual([]);
  });

  it("the link read answers resource_missing: row cleared, notice, resolves", async () => {
    linkLines.set("plink_old", missing);
    const out = await syncProductToStripe("p1");
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
    expect(rowUpdates).toContainEqual({ table: "products", values: SANDBOX_LINK_CLEARED });
    expect(out.notices).toEqual([
      "Stripe payment link plink_old is not in this Stripe account, so it was removed from the product; generate a new one if you need it",
    ]);
    expect(out.paymentLinkCleared).toBe(true);
  });

  it("deactivate answers resource_missing: row cleared, notice, resolves", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkFailures.push(missing);
    const out = await syncProductToStripe("p1");
    expect(rowUpdates).toContainEqual({ table: "products", values: SANDBOX_LINK_CLEARED });
    expect(out.notices).toEqual([RETIRED]);
    expect(out.paymentLinkCleared).toBe(true);
  });

  function swapLinkDuringDeactivate(to: string | null) {
    paymentLinksUpdate.mockImplementationOnce(async (id: string) => {
      callLog.push(`deactivate ${id}`);
      product.stripe_payment_link_test = to && `https://buy.stripe.com/test_${to}`;
      product.stripe_payment_link_id_test = to;
      return {};
    });
  }

  it("C. a newer link on a current Price, written while the sync ran, is checked once and left alone", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkLines.set("plink_newer", ["price_new"]);
    swapLinkDuringDeactivate("plink_newer");
    const out = await syncProductToStripe("p1");
    expect(callLog.slice(-3)).toEqual([
      "deactivate plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
      "read link plink_newer",
    ]);
    expect(paymentLinksUpdate).not.toHaveBeenCalledWith("plink_newer", expect.anything());
    expect(out.paymentLinkCleared).toBe(false);
    expect(out.notices).toEqual([
      "Stripe payment link plink_old sold at a price this product no longer has, so it was deactivated; the product now shows Stripe payment link plink_newer",
    ]);
  });

  it("1. a newer link on the old Price, written while the sync ran, is retired too", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkLines.set("plink_newer", ["price_old"]);
    swapLinkDuringDeactivate("plink_newer");
    const out = await syncProductToStripe("p1");
    expect(callLog.slice(-5)).toEqual([
      "deactivate plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
      "read link plink_newer",
      "deactivate plink_newer",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
    ]);
    expect(out.paymentLinkCleared).toBe(true);
    expect(out.notices).toEqual([
      "Stripe payment link plink_old sold at a price this product no longer has, so it was deactivated; the product now shows Stripe payment link plink_newer",
      "Stripe payment link plink_newer sold at a price this product no longer has, so it was deactivated; generate a new one",
    ]);
  });

  it("1. the newer link is followed once, not again", async () => {
    retrieveFor.set("price_old", oldAmount);
    linkLines.set("plink_newer", ["price_old"]);
    linkLines.set("plink_third", ["price_old"]);
    swapLinkDuringDeactivate("plink_newer");
    swapLinkDuringDeactivate("plink_third");
    const out = await syncProductToStripe("p1");
    expect(callLog).not.toContain("read link plink_third");
    expect(out.paymentLinkCleared).toBe(false);
  });

  it("1. another sync already emptied the row: says the link is gone and reports the clear", async () => {
    retrieveFor.set("price_old", oldAmount);
    swapLinkDuringDeactivate(null);
    const out = await syncProductToStripe("p1");
    expect(out.paymentLinkCleared).toBe(true);
    expect(out.notices).toEqual([
      "Stripe payment link plink_old sold at a price this product no longer has, so it was deactivated; it was already removed from the product",
    ]);
  });

  it("1. a missing link whose row was already emptied: gone, and cleared", async () => {
    paymentLinksListLineItems.mockImplementationOnce(async () => {
      product.stripe_payment_link_test = null;
      product.stripe_payment_link_id_test = null;
      throw missing;
    });
    const out = await syncProductToStripe("p1");
    expect(out.paymentLinkCleared).toBe(true);
    expect(out.notices).toEqual([
      "Stripe payment link plink_old is gone; it was already removed from the product",
    ]);
  });

  it("C. the clear is filtered on the link that was checked", async () => {
    linkLines.set("plink_old", missing);
    product.stripe_payment_link_id_test = "plink_old";
    paymentLinksListLineItems.mockImplementationOnce(async () => {
      product.stripe_payment_link_id_test = "plink_newer";
      throw missing;
    });
    const out = await syncProductToStripe("p1");
    expect(callLog).toContain("read link plink_newer");
    expect(out.paymentLinkCleared).toBe(false);
    expect(out.notices).toEqual([]);
  });

  it("A. the old Price's archive failed and the link was bound to it: the link is still deactivated, and the error carries the notice and the clear", async () => {
    retrieveFor.set("price_old", oldAmount);
    archiveFails.set("price_old", rateLimited);
    const err = await attentionFrom(syncProductToStripe("p1"));
    expect(err.message).toMatch(/old price price_old is still active and needs archiving in Stripe/);
    expect(err.message).not.toMatch(/plink_old/);
    expect(err.notices).toEqual([RETIRED]);
    expect(err.paymentLinkCleared).toBe(true);
    expect(callLog).toEqual([
      "archive price_old",
      "create",
      "save price_new",
      "read link plink_old",
      "deactivate plink_old",
      `row ${JSON.stringify(SANDBOX_LINK_CLEARED)}`,
    ]);
  });

  it("the Variant loop throws on prices.create: the link is not touched", async () => {
    retrieveFor.set("price_old", oldAmount);
    createQueue = [createFailed];
    await expect(syncProductToStripe("p1")).rejects.toBe(createFailed);
    expect(paymentLinksListLineItems).not.toHaveBeenCalled();
    expect(paymentLinksUpdate).not.toHaveBeenCalled();
  });

  it("clearing the row fails after the deactivate: attention names the link", async () => {
    retrieveFor.set("price_old", oldAmount);
    updateErrorFor.products = { message: "connection reset" };
    await expect(syncProductToStripe("p1")).rejects.toThrow(
      "Stripe payment link plink_old was deactivated because it sold at a price this product no longer has, but the product still shows it (connection reset)",
    );
  });
});

describe("A. syncProductToStripeSafe always answers the whole outcome", () => {
  beforeEach(() => {
    product.product_variants = [variant()];
    product.stripe_payment_link_test = "https://buy.stripe.com/test_old";
    product.stripe_payment_link_id_test = "plink_old";
    linkLines.set("plink_old", ["price_old"]);
  });

  it("success: synced, prices in place, the notice and the clear", async () => {
    retrieveFor.set("price_old", oldAmount);
    const out = await syncProductToStripeSafe("p1");
    expect(out).toMatchObject({
      synced: true,
      pricesInPlace: true,
      notices: [RETIRED],
      paymentLinkCleared: true,
    });
    expect(out.result?.stripeProductId).toBe("prod_x");
  });

  it("housekeeping failed after the loop: not synced, but prices in place, with the notice and the clear", async () => {
    retrieveFor.set("price_old", oldAmount);
    archiveFails.set("price_old", rateLimited);
    const out = await syncProductToStripeSafe("p1");
    expect(out).toEqual({
      synced: false,
      error:
        "The new prices are in place, but Stripe needs attention: old price price_old is still active and needs archiving in Stripe (Too many requests)",
      pricesInPlace: true,
      notices: [RETIRED],
      paymentLinkCleared: true,
    });
  });

  it("an archive failure with no link is still prices in place", async () => {
    product.stripe_payment_link_id_test = null;
    retrieveFor.set("price_old", oldAmount);
    archiveFails.set("price_old", rateLimited);
    const out = await syncProductToStripeSafe("p1");
    expect(out.pricesInPlace).toBe(true);
    expect(out.notices).toEqual([]);
  });

  it("a throw from inside the Variant loop: prices not in place", async () => {
    retrieveFor.set("price_old", oldAmount);
    createQueue = [createFailed];
    const out = await syncProductToStripeSafe("p1");
    expect(out).toEqual({
      synced: false,
      error: "Stripe is unavailable",
      pricesInPlace: false,
      notices: [],
      paymentLinkCleared: false,
    });
  });

  it("a throw before the loop (the Stripe Product): prices not in place", async () => {
    productsUpdate.mockRejectedValueOnce(rateLimited);
    const out = await syncProductToStripeSafe("p1");
    expect(out.pricesInPlace).toBe(false);
  });

  it("a loop throw after an earlier archive notice is still prices not in place", async () => {
    product.product_variants = [variant("v1", "price_old"), variant("v2", "price_old_2")];
    retrieveFor.set("price_old", oldAmount);
    retrieveFor.set("price_old_2", oldAmount);
    archiveFails.set("price_old", rateLimited);
    createQueue = ["price_new_1", createFailed];
    const out = await syncProductToStripeSafe("p1");
    expect(out.pricesInPlace).toBe(false);
    expect(out.error).toMatch(/Also in Stripe: old price price_old/);
  });
});
