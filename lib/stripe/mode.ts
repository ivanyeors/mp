/**
 * Which Stripe account this environment talks to, and which column holds its ids.
 *
 * Stripe object ids are per-account: a Price created in the sandbox does not exist
 * in the live account. We run BOTH against one database — sandbox on localhost, live
 * on Vercel — so every id lives in a mode-specific column and is read back through
 * here rather than off the row directly.
 *
 * The mode is derived from the key rather than configured separately, because a
 * separate flag is a second source of truth that can disagree with the key actually
 * in use — and disagreeing means charging the wrong account.
 */

export type StripeMode = "test" | "live";

/** Both secret (`sk_`/`rk_`) and publishable (`pk_`) keys carry the mode this way. */
const TEST_MARKER = "_test_";

/**
 * The active mode.
 *
 * Server code sees `STRIPE_SECRET_KEY`. Client code cannot — Next replaces non-public
 * env with `undefined` in the browser bundle — so it falls back to the publishable
 * key, which encodes the same mode and is safe to ship.
 *
 * With neither key set this answers "test". An unconfigured environment must not
 * default to reading live ids.
 */
export function stripeMode(): StripeMode {
  const key =
    process.env.STRIPE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "";
  if (!key) return "test";
  return key.includes(TEST_MARKER) ? "test" : "live";
}

/** Column names, so a writer updates the same column the reader will look at. */
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

/**
 * `undefined` means the COLUMN is absent, which a database that has not run
 * `20260913120000_stripe_ids_per_mode.sql` yet reports for a `select("*")`. That is a
 * deploy that ran ahead of its migration, not an unlinked product.
 *
 * Told apart from `null` (column present, nothing linked) on purpose. Before that
 * migration the legacy column holds SANDBOX ids, which is exactly what test mode
 * wants, so falling through keeps checkout working instead of refusing every item
 * with "not available for online purchase". Live mode never needs this — it reads
 * the legacy column either way.
 *
 * Delete once the migration is applied everywhere; it is a bridge, not a design.
 */
function preMigration(testColumn: string | null | undefined): boolean {
  return testColumn === undefined;
}

/** The Stripe Product id valid in THIS environment's account, or null. */
export function stripeProductIdOf(
  row: ProductIdRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  if (!row) return null;
  if (mode === "live") return row.stripe_product_id ?? null;
  if (preMigration(row.stripe_product_id_test)) return row.stripe_product_id ?? null;
  return row.stripe_product_id_test ?? null;
}

/** The Stripe Price id valid in THIS environment's account, or null. */
export function stripePriceIdOf(
  row: PriceIdRow | null | undefined,
  mode: StripeMode = stripeMode(),
): string | null {
  if (!row) return null;
  if (mode === "live") return row.stripe_price_id ?? null;
  if (preMigration(row.stripe_price_id_test)) return row.stripe_price_id ?? null;
  return row.stripe_price_id_test ?? null;
}
