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
import type { Wallet, WalletDisplay } from "@/lib/stripe/wallet";

export interface WalletButtonProps {
  wallet: Wallet;
  display: WalletDisplay;
  amountMinor: number;
  currency: string;
  height: number;
  onAvailable: (available: boolean) => void;
  onTap: () => boolean;
  onApproved: (paymentMethodId: string, authorizedMinor: number) => void;
  onFailed: () => void;
}

const BUTTON_RADIUS = "16px";

export default function WalletButton(props: WalletButtonProps) {
  const { resolvedTheme } = useTheme();
  const [stripe] = useState(() => stripeJs());
  const dark = resolvedTheme === "dark";

  const options = useMemo<StripeElementsOptionsMode>(
    () => ({
      mode: "payment",
      amount: props.amountMinor,
      currency: props.currency.toLowerCase(),
      paymentMethodCreation: "manual",
      appearance: { theme: dark ? "night" : "stripe", variables: { borderRadius: BUTTON_RADIUS } },
    }),
    [props.amountMinor, props.currency, dark],
  );

  return (
    <Elements stripe={stripe} options={options}>
      <ExpressButton {...props} dark={dark} />
    </Elements>
  );
}

function ExpressButton({
  wallet,
  display,
  amountMinor,
  height,
  dark,
  onAvailable,
  onTap,
  onApproved,
  onFailed,
}: WalletButtonProps & { dark: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const shown = useRef(amountMinor);

  const options = useMemo<NonNullable<ExpressCheckoutElementProps["options"]>>(
    () => ({
      buttonHeight: height,
      buttonTheme: { [wallet]: dark ? "white" : "black" },
      buttonType: { [wallet]: "plain" },
      layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
      paymentMethods: {
        applePay: wallet === "applePay" ? display : "never",
        googlePay: wallet === "googlePay" ? display : "never",
        link: "never",
        paypal: "never",
        amazonPay: "never",
        klarna: "never",
      },
    }),
    [wallet, display, height, dark],
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
      console.warn(`[checkout] ${wallet} did not hand over a payment method:`, error?.message);
      event.paymentFailed({ reason: "fail" });
      onFailed();
      return;
    }
    onApproved(created.paymentMethod.id, shown.current);
  }

  return (
    <ExpressCheckoutElement
      options={options}
      onReady={(e) => onAvailable(Boolean(e.availablePaymentMethods?.[wallet]))}
      onLoadError={() => onAvailable(false)}
      onClick={tap}
      onConfirm={approve}
    />
  );
}
