"use client";

import { useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type {
  StripeElementsOptionsMode,
  StripeExpressCheckoutElementClickEvent,
  StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import {
  Elements,
  ExpressCheckoutElement,
  useElements,
  useStripe,
  type ExpressCheckoutElementProps,
} from "@stripe/react-stripe-js";
import { stripeJs } from "@/lib/stripe/browser";

/**
 * The Apple Pay button beside the checkout button (ADR 0052, "Apple Pay beside
 * the checkout button").
 *
 * No Order exists yet, so this runs in Stripe's deferred mode: the sheet shows
 * `amountMinor`, and approving it only makes a PaymentMethod. The page then
 * makes the Order and pays its Checkout Session with it (`onApproved`). Apple
 * Pay only: card and PayNow stay on the button beside it.
 *
 * Shown only where Apple Pay can pay (an Apple device with a card in Wallet, on
 * a domain registered in Stripe); `onAvailable` says whether that is so.
 */
export interface ApplePayButtonProps {
  /** What the sheet shows and the shopper approves, in minor units. More than 0. */
  amountMinor: number;
  /** The cart's currency, which Stripe charges in. */
  currency: string;
  /** The same height as the button beside it: 40 inline, 44 in the phone's bar. */
  height: number;
  onAvailable: (available: boolean) => void;
  /**
   * The tap, before the sheet opens. Answer at once (Stripe allows a second):
   * false keeps the sheet shut, because the form has errors or a payment is
   * already under way.
   */
  onTap: () => boolean;
  /** Approved and the sheet is closed: make the Order and pay it with this. */
  onApproved: (paymentMethodId: string, authorizedMinor: number) => void;
  /** Apple Pay handed over nothing. Nothing was made or charged. */
  onFailed: () => void;
}

/** The site's button radius (`--radius-button`, app/globals.css). */
const BUTTON_RADIUS = "16px";

export default function ApplePayButton(props: ApplePayButtonProps) {
  const { resolvedTheme } = useTheme();
  // One Stripe.js for the page; the provider must get the same promise every render.
  const [stripe] = useState(() => stripeJs());
  const dark = resolvedTheme === "dark";

  // Elements takes later changes to amount and appearance in place.
  const options = useMemo<StripeElementsOptionsMode>(
    () => ({
      mode: "payment",
      amount: props.amountMinor,
      currency: props.currency.toLowerCase(),
      // Approving makes a PaymentMethod and nothing else; the Checkout Session is paid with it.
      paymentMethodCreation: "manual",
      appearance: { theme: dark ? "night" : "stripe", variables: { borderRadius: BUTTON_RADIUS } },
    }),
    [props.amountMinor, props.currency, dark],
  );

  return (
    <Elements stripe={stripe} options={options}>
      <WalletButton {...props} dark={dark} />
    </Elements>
  );
}

function WalletButton({
  amountMinor,
  height,
  dark,
  onAvailable,
  onTap,
  onApproved,
  onFailed,
}: ApplePayButtonProps & { dark: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  // The amount Elements held when the sheet opened: what the shopper approved.
  const shown = useRef(amountMinor);

  const options = useMemo<NonNullable<ExpressCheckoutElementProps["options"]>>(
    () => ({
      buttonHeight: height,
      buttonTheme: { applePay: dark ? "white" : "black" },
      buttonType: { applePay: "plain" },
      layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
      paymentMethods: {
        applePay: "auto",
        googlePay: "never",
        link: "never",
        paypal: "never",
        amazonPay: "never",
        klarna: "never",
      },
    }),
    [height, dark],
  );

  function tap(event: StripeExpressCheckoutElementClickEvent) {
    if (!onTap()) {
      event.reject();
      return;
    }
    shown.current = amountMinor;
    event.resolve();
  }

  async function approve(event: StripeExpressCheckoutElementConfirmEvent) {
    if (!stripe || !elements) {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const submitted = await elements.submit();
    const created = submitted.error ? null : await stripe.createPaymentMethod({ elements });
    const error = submitted.error ?? created?.error;
    if (error || !created?.paymentMethod) {
      console.warn("[checkout] Apple Pay did not hand over a payment method:", error?.message);
      event.paymentFailed({ reason: "fail" });
      onFailed();
      return;
    }
    onApproved(created.paymentMethod.id, shown.current);
  }

  return (
    <ExpressCheckoutElement
      options={options}
      onReady={(e) => onAvailable(Boolean(e.availablePaymentMethods?.applePay))}
      onLoadError={() => onAvailable(false)}
      onClick={tap}
      onConfirm={approve}
    />
  );
}
