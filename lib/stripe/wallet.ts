import type { Stripe } from "@stripe/stripe-js";

export const WALLETS = ["applePay", "googlePay"] as const;
export type Wallet = (typeof WALLETS)[number];

export const WALLET_NAMES: Record<Wallet, string> = {
  applePay: "Apple Pay",
  googlePay: "Google Pay",
};

export type WalletDisplay = "auto" | "always";

export const COMPUTER_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";

export function walletsBeside(available: Iterable<Wallet>, wide: boolean): Wallet[] {
  const can = new Set(available);
  return WALLETS.filter((wallet) => can.has(wallet)).slice(0, wide ? WALLETS.length : 1);
}

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

function minorPerMajor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * minorPerMajor(currency));
}

export function fromMinorUnits(amount: number, currency: string): number {
  return amount / minorPerMajor(currency);
}

export type WalletConfirmResult =
  | { type: "paid" }
  | { type: "total_changed"; total: number }
  | { type: "failed"; message: string };

export async function confirmWithWallet(
  stripe: Pick<Stripe, "initCheckoutElementsSdk">,
  opts: { clientSecret: string; paymentMethodId: string; authorizedMinor: number },
): Promise<WalletConfirmResult> {
  const checkout = stripe.initCheckoutElementsSdk({ clientSecret: opts.clientSecret });
  const loaded = await checkout.loadActions();
  if (loaded.type === "error") return { type: "failed", message: loaded.error.message };

  const session = loaded.actions.getSession();
  const totalMinor = session.total.total.minorUnitsAmount;
  if (totalMinor !== opts.authorizedMinor) {
    return { type: "total_changed", total: totalMinor / session.minorUnitsAmountDivisor };
  }

  const result = await loaded.actions.confirm({ paymentMethod: opts.paymentMethodId });
  if (result.type === "error") return { type: "failed", message: result.error.message };
  return { type: "paid" };
}
