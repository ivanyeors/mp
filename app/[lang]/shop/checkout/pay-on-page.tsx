"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { Loader2, Lock } from "lucide-react";
import type {
  Appearance,
  StripeCheckoutElementsSdkOptions,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
  type ExpressCheckoutElementProps,
  type PaymentElementProps,
} from "@stripe/react-stripe-js/checkout";
import { Button } from "@/components/ui/button";
import { MobileStickyActionBar } from "@/components/ui/mobile-sticky-action-bar";
import { stripeJs } from "@/lib/stripe/browser";
import { formatCurrency } from "@/lib/i18n/currencies";
import type { WalletDisplay } from "@/lib/stripe/wallet";

export interface PayOnPageProps {
  clientSecret: string;
  email: string;
  shipTo: string;
  delivery: string;
  notice?: string | null;
  walletDisplay: WalletDisplay;
  onEdit: (opts?: { payOnStripe?: boolean }) => void;
}

const FONTS: StripeCheckoutElementsSdkOptions["elementsOptions"] = {
  fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" }],
};

function appearance(dark: boolean): Appearance {
  return {
    theme: dark ? "night" : "stripe",
    variables: {
      fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif",
      borderRadius: "10px",
      colorPrimary: dark ? "#e5e5e5" : "#171717",
      colorBackground: dark ? "#0a0a0a" : "#ffffff",
      colorText: dark ? "#fafafa" : "#0a0a0a",
      colorDanger: dark ? "#ff6467" : "#e7000b",
    },
  };
}

function expressOptions(
  dark: boolean,
  walletDisplay: WalletDisplay,
): NonNullable<ExpressCheckoutElementProps["options"]> {
  return {
    buttonHeight: 48,
    buttonTheme: { applePay: dark ? "white" : "black", googlePay: dark ? "white" : "black" },
    buttonType: { applePay: "plain", googlePay: "plain" },
    layout: { maxColumns: 2, maxRows: 2, overflow: "never" },
    paymentMethodOrder: ["apple_pay", "google_pay", "link"],
    paymentMethods: { applePay: walletDisplay, googlePay: walletDisplay },
  };
}

const PAYMENT_OPTIONS: PaymentElementProps["options"] = {
  layout: { type: "accordion", defaultCollapsed: false, radios: "always", spacedAccordionItems: false },
};

export default function PayOnPage(props: PayOnPageProps) {
  const { resolvedTheme } = useTheme();
  const [dark] = useState(() => resolvedTheme === "dark");
  const options = useMemo<StripeCheckoutElementsSdkOptions>(
    () => ({
      clientSecret: props.clientSecret,
      elementsOptions: { appearance: appearance(dark), ...FONTS },
    }),
    [props.clientSecret, dark],
  );

  return (
    <CheckoutElementsProvider stripe={stripeJs()} options={options}>
      <PaymentStep {...props} dark={dark} />
    </CheckoutElementsProvider>
  );
}

function PaymentStep({
  email,
  shipTo,
  delivery,
  notice,
  walletDisplay,
  onEdit,
  dark,
}: PayOnPageProps & { dark: boolean }) {
  const state = useCheckoutElements();
  const [wallets, setWallets] = useState<"pending" | "shown" | "none">("pending");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = state.type === "success" ? state.checkout : null;
  const failed = state.type === "error";

  const loadError = state.type === "error" ? state.error.message : null;
  useEffect(() => {
    if (loadError) console.warn("[checkout] The on-page payment form did not load; falling back to Stripe's page:", loadError);
  }, [loadError]);
  const total = checkout
    ? formatCurrency(
        checkout.total.total.minorUnitsAmount / checkout.minorUnitsAmountDivisor,
        checkout.currency.toUpperCase(),
      )
    : null;

  async function payWithForm() {
    if (!checkout || paying) return;
    setPaying(true);
    setError(null);
    const result = await checkout.confirm();
    if (result.type === "error") {
      setError(result.error.message);
      setPaying(false);
    }
  }

  async function payWithWallet(event: StripeExpressCheckoutElementConfirmEvent) {
    if (!checkout) return;
    setError(null);
    const result = await checkout.confirm({ expressCheckoutConfirmEvent: event });
    if (result.type === "error") setError(result.error.message);
  }

  const payButton = failed ? (
    <Button type="button" size="lg" className="w-full" onClick={() => onEdit({ payOnStripe: true })}>
      Go back and try again
    </Button>
  ) : (
    <Button
      type="button"
      size="lg"
      className="w-full"
      disabled={!checkout || paying}
      onClick={payWithForm}
    >
      {paying || !checkout ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {paying ? "Processing…" : "Loading…"}
        </>
      ) : (
        <>
          <Lock className="size-4" />
          Pay {total}
        </>
      )}
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Your details" className="rounded-lg border bg-card text-sm">
        <dl className="divide-y">
          <RecapRow label="Contact" value={email} onEdit={paying ? undefined : () => onEdit({ payOnStripe: failed })} />
          <RecapRow label="Ship to" value={shipTo} onEdit={paying ? undefined : () => onEdit({ payOnStripe: failed })} />
          <RecapRow label="Delivery" value={delivery} onEdit={paying ? undefined : () => onEdit({ payOnStripe: failed })} />
        </dl>
      </section>

      <section id="payment" data-section="payment" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Payment</h2>

        {notice && (
          <div role="status" className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            {notice}
          </div>
        )}

        {failed ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            We couldn&apos;t load the payment form here. Nothing has been charged. Go back and try
            again: you&apos;ll pay on Stripe&apos;s secure page instead.
          </div>
        ) : state.type === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading payment options">
            <div className="h-12 animate-pulse rounded-[10px] bg-muted" />
            <div className="h-40 animate-pulse rounded-[10px] bg-muted" />
          </div>
        ) : (
          <>
            <ExpressCheckoutElement
              key={walletDisplay}
              options={expressOptions(dark, walletDisplay)}
              onReady={(e) => setWallets(e.availablePaymentMethods ? "shown" : "none")}
              onConfirm={payWithWallet}
            />
            {wallets === "shown" && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
                <span className="h-px flex-1 bg-border" />
                Or pay with card or PayNow
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <PaymentElement options={PAYMENT_OPTIONS} />
          </>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="max-md:hidden">{payButton}</div>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3 shrink-0" />
          <span>Payments are processed securely by Stripe. We never see your card details.</span>
        </div>
      </section>

      <MobileStickyActionBar>{payButton}</MobileStickyActionBar>
    </div>
  );
}

function RecapRow({ label, value, onEdit }: { label: string; value: string; onEdit?: () => void }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value}</dd>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-sm underline underline-offset-4 hover:text-foreground text-muted-foreground"
        >
          Edit
        </button>
      )}
    </div>
  );
}
