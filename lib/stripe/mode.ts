export type StripeMode = "test" | "live";

const TEST_MARKER = "_test_";

export function stripeMode(): StripeMode {
  if (typeof window !== "undefined") {
    throw new Error(
      "stripeMode() is server-only. Pass the mode from the server page as a prop and " +
        "hand it to stripeProductIdOf(row, mode) / stripePriceIdOf(row, mode).",
    );
  }
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) return "test";
  return key.includes(TEST_MARKER) ? "test" : "live";
}

export const STRIPE_ID_COLUMN = {
  test: { product: "stripe_product_id_test", price: "stripe_price_id_test" },
  live: { product: "stripe_product_id", price: "stripe_price_id" },
} as const;

export function stripeProductIdColumn(mode: StripeMode = stripeMode()) {
  return STRIPE_ID_COLUMN[mode].product;
}

export function stripePriceIdColumn(mode: StripeMode = stripeMode()) {
  return STRIPE_ID_COLUMN[mode].price;
}

type ProductIdRow = {
  stripe_product_id?: string | null;
  stripe_product_id_test?: string | null;
};

type PriceIdRow = {
  stripe_price_id?: string | null;
  stripe_price_id_test?: string | null;
};

function preMigration(testColumn: string | null | undefined): boolean {
  return testColumn === undefined;
}

export function stripeProductIdOf(
  row: ProductIdRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  if (!row) return null;
  if (mode === "live") return row.stripe_product_id ?? null;
  if (preMigration(row.stripe_product_id_test)) return row.stripe_product_id ?? null;
  return row.stripe_product_id_test ?? null;
}

export function stripePriceIdOf(
  row: PriceIdRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  if (!row) return null;
  if (mode === "live") return row.stripe_price_id ?? null;
  if (preMigration(row.stripe_price_id_test)) return row.stripe_price_id ?? null;
  return row.stripe_price_id_test ?? null;
}

export const STRIPE_PAYMENT_LINK_COLUMN = {
  test: { url: "stripe_payment_link_test", id: "stripe_payment_link_id_test" },
  live: { url: "stripe_payment_link", id: "stripe_payment_link_id" },
} as const;

export function stripePaymentLinkColumns(mode: StripeMode = stripeMode()) {
  return STRIPE_PAYMENT_LINK_COLUMN[mode];
}

export type PaymentLinkRow = {
  stripe_payment_link?: string | null;
  stripe_payment_link_id?: string | null;
  stripe_payment_link_test?: string | null;
  stripe_payment_link_id_test?: string | null;
};

export function stripePaymentLinkUrlOf(
  row: PaymentLinkRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  return row?.[STRIPE_PAYMENT_LINK_COLUMN[mode].url] ?? null;
}

export function stripePaymentLinkIdOf(
  row: PaymentLinkRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  return row?.[STRIPE_PAYMENT_LINK_COLUMN[mode].id] ?? null;
}

export function hasPaymentLinkColumns(row: PaymentLinkRow, mode: StripeMode = stripeMode()): boolean {
  return STRIPE_PAYMENT_LINK_COLUMN[mode].id in row;
}
