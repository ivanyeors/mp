"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, CreditCard, Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/shop/cart-context";
import { useCurrency } from "@/lib/shop/currency-context";
import { PriceDisplay, formatPrice } from "@/components/shop/price-display";
import { Button } from "@/components/ui/button";
import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ShippingMethod,
  LocalizedShippingContent,
  CustomerAddress,
} from "@/lib/types/ecommerce";
import type { ShippingQuoteOptionView } from "@/lib/shipping/types";
import {
  formatDeliveryWindow,
  isPostalReady,
  useShippingQuote,
} from "@/lib/shop/use-shipping-quote";
import { useDeliveryCountries } from "@/lib/shop/use-delivery-countries";
import { countryName, findCountry, usesPostalCode } from "@/lib/shipping/countries";
import { shownDeliveryTime } from "@/lib/shipping/delivery-time";
import { trackGaEvent, trackGaEventThen } from "@/lib/analytics/ga-events";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { POINTS_ACCOUNT_ERROR, POINTS_CHECKOUT_COPY } from "@/lib/points/spend";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";
import { CheckoutCodeField } from "@/components/shop/checkout-code-field";
import {
  checkoutCodeDiscount,
  checkoutCodeFreeShipping,
  checkoutCodeToSend,
  type CheckoutCodeContext,
} from "@/lib/checkout-code/shared";
import { useCheckoutCode } from "@/lib/checkout-code/use-checkout-code";
import { POINTS_PER_DOLLAR, formatPoints, pointsToDollars } from "@/lib/points/value";
import { stripeJs } from "@/lib/stripe/browser";
import {
  COMPUTER_MEDIA_QUERY,
  WALLETS,
  WALLET_NAMES,
  confirmWithWallet,
  fromMinorUnits,
  toMinorUnits,
  walletsBeside,
  type Wallet,
  type WalletDisplay,
} from "@/lib/stripe/wallet";
import { formatCurrency } from "@/lib/i18n/currencies";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/**
 * The on-page payment step (ADR 0053), loaded only once the shopper reaches it:
 * it carries React Stripe.js, which nobody filling in the form needs yet.
 */
const PayOnPage = dynamic(() => import("./pay-on-page"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />,
});

/**
 * Apple Pay and Google Pay beside the checkout button (ADR 0053), loaded only
 * once Stripe.js is here. Each shows nothing until Stripe says this device can
 * pay with it.
 */
const WalletButton = dynamic(() => import("./wallet-button"), { ssr: false });

/** An Order made and its Checkout Session opened on this page, awaiting payment. */
interface OnPagePayment {
  clientSecret: string;
  sessionId: string;
  orderNumber: string;
}

const NEW_ADDRESS = "new";

/**
 * What /api/shop/points/allowance says for the signed-in shopper (ADR 0030
 * (h), (i)). Absent for a guest, a partner, points switched off, or a
 * balance below the minimum: the control does not show.
 */
interface PointsPreview {
  available: number;
  min: number;
  /** The most this order takes; null when it is too small to take any. */
  max: number | null;
  /** Whether the email typed is the account's; null before one is typed. */
  emailOk: boolean | null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormErrors {
  email?: string;
  recipient?: string;
  line1?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  shipping_method?: string;
}

interface FormData {
  email: string;
  phone: string;
  recipient: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function getShippingContent(
  content: ShippingMethod["content"],
  slug: string,
  lang: string,
): LocalizedShippingContent {
  return content[lang] ?? content["en-US"] ?? content["en"] ?? { name: slug };
}

/**
 * A shipping method as the checkout lists it. Until there is a postal code the
 * list comes from the country's methods, and a live (Easyship) method has no
 * price yet — it is `pending` and cannot be chosen. With a postal code, every
 * option comes from the live quote for this cart and address.
 */
interface DisplayOption {
  id: string;
  slug: string;
  content: ShippingMethod["content"];
  currency: string;
  /** Before free_above; null while a live price is pending. */
  price: number | null;
  free_above: number | null;
  courier: ShippingQuoteOptionView["courier"];
  min_days: number | null;
  max_days: number | null;
  pending: boolean;
}

// ---------------------------------------------------------------------------
// Checkout Page
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";

  const { items, subtotal, couponCode, hydrated, rememberCode } = useCart();
  const { isConverted } = useCurrency();

  // Form state
  const [form, setForm] = useState<FormData>({
    email: "",
    phone: "",
    recipient: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "SG",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  // Every country an active shipping method delivers to (Settings → Shipping).
  const countryOptions = useDeliveryCountries(form.country);
  const postalRequired = usesPostalCode(form.country);

  // Shipping
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedShipping, setSelectedShipping] = useState<string>("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Paying on this page (ADR 0053) needs Stripe.js in this browser before the
  // Order is made: an on-page Session has no Stripe page to fall back to. Until
  // it loads, or when it cannot (no key, an ad blocker), the shopper pays on
  // Stripe's hosted page as before.
  const [stripeReady, setStripeReady] = useState(false);
  const [payment, setPayment] = useState<OnPagePayment | null>(null);
  // Said above the payment step when a wallet on the form could not charge.
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  // Closing the Order the shopper went back from; a new submit waits for it,
  // so the points that Order reserved are free again.
  const releasing = useRef<Promise<unknown> | null>(null);
  // Wallet buttons beside the checkout button: inline on a wide screen, in the
  // sticky bar on a phone. `walletsAt` is where Stripe said each can show.
  const wide = useMediaQuery("(min-width: 768px)");
  // A computer shows Apple Pay and Google Pay whether set up or not; a phone
  // shows the one it has (`WalletDisplay`).
  const computer = useMediaQuery(COMPUTER_MEDIA_QUERY);
  const [walletsAt, setWalletsAt] = useState<Partial<Record<Wallet, "inline" | "bar">>>({});

  useEffect(() => {
    let cancelled = false;
    stripeJs().then((stripe) => {
      if (!cancelled) setStripeReady(Boolean(stripe));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Close an unpaid on-page Order now; the next submit waits for this. */
  function releaseSession(sessionId: string) {
    releasing.current = fetch("/api/shop/checkout/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).catch(() => undefined);
  }

  function editDetails(opts?: { payOnStripe?: boolean }) {
    if (!payment) return;
    // The form could not load here: the next attempt goes to Stripe's page.
    if (opts?.payOnStripe) setStripeReady(false);
    releaseSession(payment.sessionId);
    setPayment(null);
    setPaymentNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Order summary collapsible on mobile
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Saved addresses (signed-in shoppers only)
  const [signedIn, setSignedIn] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(NEW_ADDRESS);
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  // Marketing email: ticked by default (owner, 2026-10-31; ADR 0039). It only
  // ever subscribes someone nobody has asked; unticking changes nothing.
  const [marketingEmail, setMarketingEmail] = useState(true);

  // Redirect if cart is empty — once the cart has loaded from storage. This
  // effect runs before the provider's hydration effect, so on a full page load
  // (a refresh, or Stripe's cancel_url) `items` is still [] here.
  useEffect(() => {
    if (hydrated && items.length === 0) {
      router.replace(`/${lang}/shop`);
    }
  }, [hydrated, items.length, lang, router]);

  // Load the signed-in shopper's saved addresses; preselect the default.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/addresses")
      .then((res) => res.json())
      .then((data: { signedIn?: boolean; addresses?: CustomerAddress[]; email?: string | null }) => {
        if (cancelled || !data?.signedIn) return;
        setSignedIn(true);
        const addresses = Array.isArray(data.addresses) ? data.addresses : [];
        setSavedAddresses(addresses);
        setForm((prev) => ({ ...prev, email: prev.email || data.email || "" }));
        // Addresses are returned default-first, so the first one is the default.
        const preferred = addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          applyAddress(preferred);
        }
      })
      .catch(() => {
        /* anonymous checkout — nothing to load */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the country's shipping methods (flat prices) when the country changes.
  useEffect(() => {
    if (!form.country) return;

    setShippingLoading(true);

    fetch(`/api/shop/shipping?country=${form.country}`)
      .then((res) => res.json())
      .then((data: { rows?: ShippingMethod[] }) => setShippingMethods(data.rows ?? []))
      .catch(() => setShippingMethods([]))
      .finally(() => setShippingLoading(false));
  }, [form.country]);

  // Live rates for this cart once there is a postal code (debounced while typing).
  const postalReady = isPostalReady(form.postal_code, form.country);
  const quote = useShippingQuote(
    items.length > 0
      ? {
          items: items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
          country: form.country,
          postalCode: form.postal_code,
        }
      : null,
  );

  // The live quote once one has come back for this address; the country's list until then.
  const useQuote =
    postalReady && quote.ready && !quote.error && (quote.options.length > 0 || !quote.loading);
  const displayOptions: DisplayOption[] =
    useQuote
      ? quote.options.map((o) => ({
          id: o.method_id,
          slug: o.slug,
          content: o.content,
          currency: o.currency,
          price: o.price,
          free_above: o.free_above,
          courier: o.courier,
          min_days: o.min_days,
          max_days: o.max_days,
          pending: false,
        }))
      : shippingMethods.map((m) => {
          const live = (m.rate_source ?? "flat") === "easyship";
          return {
            id: m.id,
            slug: m.slug,
            content: m.content,
            currency: m.currency,
            price: live ? null : m.base_rate,
            free_above: m.free_above,
            courier: null,
            min_days: null,
            max_days: null,
            pending: live,
          };
        });

  // The shopper's choice while it is still offered, else the first choosable method.
  const selectableIds = displayOptions.filter((o) => !o.pending).map((o) => o.id);
  const chosenShipping = selectableIds.includes(selectedShipping)
    ? selectedShipping
    : (selectableIds[0] ?? "");

  // The one optional code (ADR 0033): a discount or a partner's referral code.
  // It reads as whatever the cart holds until the shopper types here, and is
  // checked against this order as they type and as the order changes, so the
  // summary's discount and total move with it. Checkout prices the order again
  // from the database; only that is charged.
  const [typedCode, setTypedCode] = useState<string | null>(null);
  const code = typedCode ?? couponCode ?? "";

  const codeContext = useMemo<CheckoutCodeContext | null>(
    () =>
      items.length > 0
        ? {
            flow: "shop",
            subtotal,
            line_items: items.map((i) => ({
              product_id: i.productId,
              line_total: (i.price + (i.addonPrice ?? 0)) * i.quantity,
            })),
          }
        : null,
    [items, subtotal],
  );
  const codeStatus = useCheckoutCode(code, codeContext, form.email);
  const checkoutDiscount = checkoutCodeDiscount(codeStatus);
  const checkoutFreeShipping = checkoutCodeFreeShipping(codeStatus);

  // The cart keeps what checkout settled on, so the code survives a Stripe
  // cancel or a trip back to the cart.
  useEffect(() => {
    if (codeStatus.state === "discount") {
      rememberCode({
        code: codeStatus.code,
        kind: "discount",
        discount: codeStatus.discount ?? 0,
        freeShipping: codeStatus.freeShipping,
      });
    } else if (codeStatus.state === "referral") {
      rememberCode({
        code: codeStatus.code,
        kind: "referral",
        discount: 0,
        freeShipping: false,
        partnerName: codeStatus.partnerName,
      });
    } else if (
      typedCode !== null &&
      (codeStatus.state === "idle" || codeStatus.state === "invalid" || codeStatus.state === "unknown")
    ) {
      rememberCode(null);
    }
  }, [codeStatus, typedCode, rememberCode]);

  // Points (ADR 0030 (h) to (j)): offered to a signed-in shopper who is not a
  // partner and holds at least the minimum. The server works the balance out
  // from the session; the page sends only the products less the coupon, and
  // the email, to show the most this order takes. Opt-in, because points used
  // are not refunded; once on, the amount starts at that most.
  const [fetchedPointsPreview, setPointsPreview] = useState<PointsPreview | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [pointsChoice, setPointsChoice] = useState<number | null>(null);
  const productsAfterCoupon = Math.max(0, subtotal - checkoutDiscount);
  const pointsPreview = signedIn && items.length > 0 ? fetchedPointsPreview : null;

  useEffect(() => {
    if (!signedIn || items.length === 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch("/api/shop/points/allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products_after_coupon: productsAfterCoupon,
          email: form.email.trim() || undefined,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          setPointsPreview(
            json?.usable
              ? { available: json.available, min: json.min, max: json.max ?? null, emailOk: json.email_ok ?? null }
              : null,
          );
        })
        .catch(() => {
          if (!cancelled) setPointsPreview(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [signedIn, items.length, productsAfterCoupon, form.email]);

  const pointsMax = pointsPreview?.max ?? null;
  const pointsToUse =
    usePoints && pointsPreview && pointsMax !== null && pointsPreview.emailOk !== false
      ? Math.min(pointsMax, Math.max(pointsPreview.min, pointsChoice ?? pointsMax))
      : 0;
  const pointsDiscount = pointsToDollars(pointsToUse);

  function stepPoints(direction: 1 | -1) {
    if (!pointsPreview || pointsMax === null) return;
    const current = pointsChoice ?? pointsMax;
    const next = Math.min(pointsMax, Math.max(pointsPreview.min, current + direction * POINTS_PER_DOLLAR));
    // Back at the most: follow it if the order grows or shrinks.
    setPointsChoice(next === pointsMax ? null : next);
  }

  // Derived values
  const selectedMethod =
    displayOptions.find((o) => o.id === chosenShipping && !o.pending) ?? null;
  const currency = items[0]?.currency ?? "SGD";
  const isFreeFor = (o: DisplayOption) => o.free_above != null && subtotal >= o.free_above;
  const shippingCost =
    selectedMethod
      ? checkoutFreeShipping || isFreeFor(selectedMethod)
        ? 0
        : (selectedMethod.price ?? 0)
      : 0;
  const total = Math.max(0, subtotal + shippingCost - checkoutDiscount - pointsDiscount);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): boolean {
    const next: FormErrors = {};

    if (!form.email) {
      next.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = "Enter a valid email address";
    }

    if (!form.recipient.trim()) next.recipient = "Recipient name is required";
    if (!form.line1.trim()) next.line1 = "Address is required";
    if (!form.city.trim()) next.city = "City is required";
    if (postalRequired && !form.postal_code.trim()) next.postal_code = "Postal code is required";
    if (!form.country) next.country = "Country is required";
    if (!chosenShipping) next.shipping_method = "Please select a shipping method";
    else if (postalReady && quote.loading) {
      next.shipping_method = "Updating shipping rates for your address — try again in a moment";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  /**
   * Price and make the Order, the same for every way of paying. Throws with
   * the server's message when it refuses.
   */
  async function createOrder(paymentUi: "elements" | "hosted") {
    if (releasing.current) {
      await releasing.current;
      releasing.current = null;
    }

    // Optionally persist a newly entered address to the signed-in account.
    // Best-effort: a failure here must not block checkout.
    if (signedIn && selectedAddressId === NEW_ADDRESS && saveNewAddress) {
      try {
        await fetch("/api/account/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: form.recipient,
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            state: form.state || undefined,
            postal_code: form.postal_code,
            country: form.country,
            phone: form.phone || undefined,
            is_default: savedAddresses.length === 0,
          }),
        });
      } catch {
        toast.error("Could not save the address, but your order will continue.");
      }
    }

    const payload = {
      email: form.email,
      phone: form.phone || undefined,
      marketing_email: marketingEmail,
      shipping_address: {
        recipient: form.recipient,
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        state: form.state || undefined,
        postal_code: form.postal_code,
        country: form.country,
        phone: form.phone || undefined,
      },
      shipping_method_id: chosenShipping,
      // Resolved and priced again on the server; the page only asks.
      code: checkoutCodeToSend(code, codeStatus),
      // Checked and reserved again on the server; the page only asks.
      points: pointsToUse > 0 ? pointsToUse : undefined,
      // Pay on this page once Stripe.js is here; the server may still say hosted.
      payment_ui: paymentUi,
      locale: lang,
      items: items.map((item) => ({
        variant_id: item.variantId,
        quantity: item.quantity,
        customization_id: item.customizationId,
        unit_price: item.price,
        product_title: item.productTitle,
        variant_title: item.variantTitle,
        image_url: item.imageUrl,
      })),
    };

    const res = await fetch("/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? data.message ?? "Checkout failed. Please try again.");
    }

    return res.json();
  }

  function beginCheckoutEvent() {
    return {
      name: "begin_checkout",
      params: {
        value: total,
        currency,
        ...(codeStatus.state === "discount" ? { coupon: codeStatus.code } : {}),
        items: items.map((item) => ({
          item_id: item.variantId,
          item_name: item.productTitle,
          ...(item.variantTitle ? { item_variant: item.variantTitle } : {}),
          price: item.price,
          quantity: item.quantity,
        })),
      },
    } as const;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setSubmitting(true);

    try {
      const data = await createOrder(stripeReady ? "elements" : "hosted");
      const beginCheckout = beginCheckoutEvent();

      if (data.client_secret && data.session_id) {
        // The Order is made and its Checkout open: pay for it right here. The
        // cart stays until the confirmation page, exactly as for Stripe's page.
        trackGaEvent(beginCheckout);
        setPaymentNotice(null);
        setPayment({
          clientSecret: data.client_secret,
          sessionId: data.session_id,
          orderNumber: data.order_number,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (data.checkout_url || data.url) {
        // Do NOT clear the cart here. The shopper has not paid yet: Stripe's
        // cancel_url and the browser back button both land on this page, and
        // the cart must still be there so they can review it or retry. The
        // confirmation page clears it once the paid order is confirmed.
        const checkoutUrl: string = data.checkout_url ?? data.url;
        trackGaEventThen(beginCheckout, () => {
          window.location.href = checkoutUrl;
        });
      } else {
        throw new Error("No checkout URL returned from server.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Apple Pay and Google Pay beside the checkout button (ADR 0053)
  // ---------------------------------------------------------------------------

  // What the wallet's sheet shows: the page's total, in the cart's currency.
  const walletAmount = toMinorUnits(total, currency);

  /**
   * The tap must open the sheet at once, so nothing here waits on the network:
   * the form is checked as the checkout button checks it, and an open sheet
   * stays shut while another payment is under way.
   */
  function tapWallet(): boolean {
    setSubmitError(null);
    if (submitting) return false;
    return validate();
  }

  /**
   * The shopper approved `authorizedMinor` in the wallet's sheet, which has
   * closed. Make the Order exactly as the checkout button does, then pay its
   * Checkout Session with the wallet's payment method.
   */
  async function payWithWallet(wallet: Wallet, paymentMethodId: string, authorizedMinor: number) {
    const name = WALLET_NAMES[wallet];
    setSubmitError(null);
    setSubmitting(true);
    let leaving = false;
    try {
      const data = await createOrder("elements");
      const beginCheckout = beginCheckoutEvent();

      if (!data.client_secret || !data.session_id) {
        // This deploy cannot pay on the page after all: Stripe's page, where
        // the wallets show too. The approved payment method is simply unused.
        const checkoutUrl: string | undefined = data.checkout_url ?? data.url;
        if (!checkoutUrl) throw new Error("No checkout URL returned from server.");
        leaving = true;
        trackGaEventThen(beginCheckout, () => {
          window.location.href = checkoutUrl;
        });
        return;
      }

      trackGaEvent(beginCheckout);
      const stripe = await stripeJs();
      const result = stripe
        ? await confirmWithWallet(stripe, {
            clientSecret: data.client_secret,
            paymentMethodId,
            authorizedMinor,
          })
        : ({ type: "failed", message: "Stripe.js is not loaded." } as const);

      if (result.type === "paid") {
        // Stripe is taking this tab to the confirmation page.
        leaving = true;
        return;
      }

      if (result.type === "total_changed") {
        // Keep this Order: its payment step shows the real total, with the
        // wallets on top again, and charges nothing until the shopper agrees.
        setPaymentNotice(
          `Your total is ${formatCurrency(result.total, currency)}, not the ` +
            `${formatCurrency(fromMinorUnits(authorizedMinor, currency), currency)} ${name} showed, ` +
            `so nothing has been charged. Check it and pay below.`,
        );
        setPayment({
          clientSecret: data.client_secret,
          sessionId: data.session_id,
          orderNumber: data.order_number,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      // Declined, or the Session would not load: close this Order so that
      // another try starts clean and its points are free again.
      console.warn(`[checkout] ${name} payment did not go through:`, result.message);
      releaseSession(data.session_id);
      throw new Error(walletFailedMessage(wallet));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      if (!leaving) setSubmitting(false);
    }
  }

  function walletFailedMessage(wallet: Wallet): string {
    return `${WALLET_NAMES[wallet]} didn't go through, and nothing has been charged. Try again, or pay by card or PayNow.`;
  }

  function walletFailed(wallet: Wallet) {
    const message = walletFailedMessage(wallet);
    setSubmitError(message);
    toast.error(message);
  }

  // ---------------------------------------------------------------------------
  // Field updater
  // ---------------------------------------------------------------------------

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  // Copy a saved address into the editable form (email is left untouched).
  function applyAddress(a: CustomerAddress) {
    setForm((prev) => ({
      ...prev,
      phone: a.phone ?? prev.phone,
      recipient: a.recipient,
      line1: a.line1,
      line2: a.line2 ?? "",
      city: a.city,
      state: a.state ?? "",
      postal_code: a.postal_code,
      country: a.country,
    }));
    setErrors({});
  }

  function handleSelectAddress(id: string) {
    setSelectedAddressId(id);
    if (id === NEW_ADDRESS) {
      setForm((prev) => ({
        ...prev,
        recipient: "",
        line1: "",
        line2: "",
        city: "",
        state: "",
        postal_code: "",
      }));
      return;
    }
    const match = savedAddresses.find((a) => a.id === id);
    if (match) applyAddress(match);
  }

  // ---------------------------------------------------------------------------
  // Render: Order Summary (shared between mobile collapsible and desktop card)
  // ---------------------------------------------------------------------------

  function OrderSummaryContent() {
    return (
      <div className="flex flex-col gap-4">
        {/* Items */}
        <div className="flex flex-col divide-y">
          {items.map((item) => (
            <div key={item.variantId} className="flex gap-3 py-3">
              <div className="relative w-12 h-12 shrink-0 rounded-md overflow-hidden border bg-muted">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.productTitle}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <ShoppingBag className="size-5 text-muted-foreground" />
                  </div>
                )}
                {/* Qty badge */}
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full bg-muted-foreground text-background text-[10px] w-4 h-4 font-medium leading-none">
                  {item.quantity}
                </span>
              </div>
              <div className="flex flex-1 items-start justify-between min-w-0 gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">
                    {item.productTitle}
                  </p>
                  {item.variantTitle && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.variantTitle}
                    </p>
                  )}
                </div>
                <PriceDisplay
                  price={item.price * item.quantity}
                  currency={item.currency}
                  className="text-sm shrink-0"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex flex-col gap-2 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <PriceDisplay price={subtotal} currency={currency} />
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Shipping</span>
            <span className="font-medium">
              {selectedMethod
                ? shippingCost === 0
                  ? "Free"
                  : <PriceDisplay price={shippingCost} currency={selectedMethod.currency} className="inline text-sm" />
                : "—"}
            </span>
          </div>

          {codeStatus.state === "discount" && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Discount ({codeStatus.code})</span>
              <span>
                {checkoutDiscount > 0
                  ? <>-<PriceDisplay price={checkoutDiscount} currency={currency} className="inline text-sm" /></>
                  : checkoutFreeShipping
                    ? "Free shipping"
                    : "Applied"}
              </span>
            </div>
          )}
          {pointsToUse > 0 && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Points ({pointsToUse.toLocaleString("en-SG")})</span>
              <span>
                -<PriceDisplay price={pointsDiscount} currency={currency} className="inline text-sm" />
              </span>
            </div>
          )}

          <div className="flex justify-between font-semibold text-base border-t pt-2 mt-1">
            <span>Total</span>
            <PriceDisplay price={total} currency={currency} />
          </div>
          {isConverted && (
            <p className="text-xs text-muted-foreground mt-2">
              You will be charged <span className="font-medium">{formatPrice(total, "SGD")}</span> SGD
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (items.length === 0) return null;

  // Shared Pay CTA label so the inline (desktop) and sticky (mobile) buttons
  // never drift.
  const walletPlace = wide ? "inline" : "bar";
  const walletDisplay: WalletDisplay = computer ? "always" : "auto";
  const walletsShown = walletsBeside(
    WALLETS.filter((wallet) => walletsAt[wallet] === walletPlace),
    wide,
  );
  const payLabel = submitting ? (
    <>
      <Loader2 className="size-4 animate-spin" />
      Processing…
    </>
  ) : (
    <>
      <CreditCard className="size-4" />
      {/* Beside a wallet, say what this button is for instead. */}
      {walletsShown.length > 0 ? "Card or PayNow" : stripeReady ? "Continue to payment" : "Pay with Stripe"}
    </>
  );

  /**
   * The checkout button, with Apple Pay and Google Pay beside it where this
   * device can use them: Apple Pay, Google Pay, then card or PayNow, at equal
   * widths. The wallet buttons are mounted only in the `place` that shows at
   * this width. Until Stripe says a wallet can show, its button sits unseen
   * under the checkout button, so nothing moves on a device without it.
   */
  function checkoutButtons(place: "inline" | "bar") {
    const withWallets = stripeReady && walletAmount > 0 && place === walletPlace;
    const columns = withWallets ? walletsShown.length : 0;
    // Equal columns once a wallet shows (flex would make the padded button wider).
    return (
      <div
        className={cn(
          "relative",
          columns > 0 && "grid gap-3",
          columns === 1 && "grid-cols-2",
          columns === 2 && "grid-cols-3",
        )}
      >
        {withWallets &&
          WALLETS.map((wallet) => {
            const seen = walletsShown.includes(wallet);
            return (
              <div
                // A new display setting is a new Stripe button.
                key={`${wallet}-${walletDisplay}`}
                className={seen ? "min-w-0" : "pointer-events-none invisible absolute inset-x-0 top-0"}
                aria-hidden={seen ? undefined : true}
              >
                <WalletButton
                  wallet={wallet}
                  display={walletDisplay}
                  amountMinor={walletAmount}
                  currency={currency}
                  height={place === "bar" ? 44 : 40}
                  onAvailable={(ok) =>
                    setWalletsAt((at) => ({ ...at, [wallet]: ok ? place : undefined }))
                  }
                  onTap={tapWallet}
                  onApproved={(paymentMethodId, authorizedMinor) =>
                    payWithWallet(wallet, paymentMethodId, authorizedMinor)
                  }
                  onFailed={() => walletFailed(wallet)}
                />
              </div>
            );
          })}
        <Button
          type="submit"
          form="checkout-form"
          size="lg"
          className="w-full min-w-0"
          disabled={submitting}
        >
          {payLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className={`max-w-5xl mx-auto px-4 py-8 ${mobileStickyActionBarSpacerClassName}`}>
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      {/* Mobile: collapsible order summary at top */}
      <div className="lg:hidden mb-6" id="order-summary" data-section="order-summary">
        <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="size-4 text-muted-foreground" />
                {summaryOpen ? "Hide" : "Show"} order summary
              </span>
              <div className="flex items-center gap-2">
                <PriceDisplay price={total} currency={currency} className="text-sm" />
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${summaryOpen ? "rotate-180" : ""}`}
                />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2 rounded-t-none border-t-0">
              <CardContent className="pt-4">
                <OrderSummaryContent />
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Main grid */}
      <div className="lg:grid lg:grid-cols-5 lg:gap-8">
        {/* Left: Form */}
        <div className="lg:col-span-3">
          {payment ? (
            <PayOnPage
              key={payment.clientSecret}
              clientSecret={payment.clientSecret}
              notice={paymentNotice}
              walletDisplay={walletDisplay}
              email={form.email}
              shipTo={[
                form.recipient,
                form.line1,
                form.line2,
                [form.city, form.state, form.postal_code].filter(Boolean).join(" "),
                countryName(form.country),
              ]
                .filter(Boolean)
                .join(", ")}
              delivery={
                selectedMethod
                  ? getShippingContent(selectedMethod.content, selectedMethod.slug, lang).name
                  : "—"
              }
              onEdit={editDetails}
            />
          ) : (
          <form id="checkout-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
            {/* Contact */}
            <section id="contact" data-section="contact">
              <h2 className="text-lg font-semibold mb-4">Contact</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="email">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    className={errors.email ? "border-destructive" : ""}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email}</p>
                  )}
                  <label className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      className="mt-0.5"
                      checked={marketingEmail}
                      onCheckedChange={(checked) => setMarketingEmail(checked === true)}
                    />
                    {MARKETING_BOX_LABEL}
                  </label>
                </div>

                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="phone">
                    Phone{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+60 12-345 6789"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <CheckoutCodeField
                    id="checkout_code"
                    value={code}
                    onChange={setTypedCode}
                    status={codeStatus}
                    formatAmount={(amount) => formatPrice(amount, currency)}
                  />
                </div>
              </div>
            </section>

            {/* Shipping address */}
            <section id="shipping-address" data-section="shipping-address">
              <h2 className="text-lg font-semibold mb-4">Shipping Address</h2>

              {/* Saved addresses (signed-in shoppers) */}
              {signedIn && savedAddresses.length > 0 && (
                <div className="mb-4 flex flex-col gap-1.5">
                  <Label htmlFor="saved_address">Use a saved address</Label>
                  <Select
                    value={selectedAddressId}
                    onValueChange={handleSelectAddress}
                  >
                    <SelectTrigger id="saved_address">
                      <SelectValue placeholder="Select a saved address" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedAddresses.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {(a.label ? `${a.label} — ` : "") +
                            `${a.recipient}, ${a.line1}, ${a.city}`}
                          {a.is_default ? " (default)" : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_ADDRESS}>Enter a new address</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Recipient */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="recipient">
                    Full name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="recipient"
                    type="text"
                    autoComplete="name"
                    placeholder="Jane Smith"
                    value={form.recipient}
                    onChange={(e) => setField("recipient", e.target.value)}
                    aria-invalid={!!errors.recipient}
                    className={errors.recipient ? "border-destructive" : ""}
                  />
                  {errors.recipient && (
                    <p className="text-xs text-destructive">{errors.recipient}</p>
                  )}
                </div>

                {/* Address line 1 */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="line1">
                    Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="line1"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="123 Jalan Example"
                    value={form.line1}
                    onChange={(e) => setField("line1", e.target.value)}
                    aria-invalid={!!errors.line1}
                    className={errors.line1 ? "border-destructive" : ""}
                  />
                  {errors.line1 && (
                    <p className="text-xs text-destructive">{errors.line1}</p>
                  )}
                </div>

                {/* Address line 2 */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="line2">
                    Address line 2{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="line2"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Apartment, suite, unit, etc."
                    value={form.line2}
                    onChange={(e) => setField("line2", e.target.value)}
                  />
                </div>

                {/* City / State / Postal */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:col-span-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="city">
                      City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="city"
                      type="text"
                      autoComplete="address-level2"
                      placeholder="Kuala Lumpur"
                      value={form.city}
                      onChange={(e) => setField("city", e.target.value)}
                      aria-invalid={!!errors.city}
                      className={errors.city ? "border-destructive" : ""}
                    />
                    {errors.city && (
                      <p className="text-xs text-destructive">{errors.city}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      type="text"
                      autoComplete="address-level1"
                      placeholder="Selangor"
                      value={form.state}
                      onChange={(e) => setField("state", e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="postal_code">
                      Postcode {postalRequired && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      id="postal_code"
                      type="text"
                      autoComplete="postal-code"
                      placeholder={findCountry(form.country)?.postal ?? (postalRequired ? "" : "Optional")}
                      value={form.postal_code}
                      onChange={(e) => setField("postal_code", e.target.value)}
                      aria-invalid={!!errors.postal_code}
                      className={errors.postal_code ? "border-destructive" : ""}
                    />
                    {errors.postal_code && (
                      <p className="text-xs text-destructive">{errors.postal_code}</p>
                    )}
                  </div>
                </div>

                {/* Country */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="country">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.country}
                    onValueChange={(val) => setField("country", val)}
                  >
                    <SelectTrigger
                      id="country"
                      className={errors.country ? "border-destructive" : ""}
                    >
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countryOptions.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.country && (
                    <p className="text-xs text-destructive">{errors.country}</p>
                  )}
                </div>

                {/* Save new address to account */}
                {signedIn && selectedAddressId === NEW_ADDRESS && (
                  <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={saveNewAddress}
                      onCheckedChange={(checked) => setSaveNewAddress(checked === true)}
                    />
                    Save this address to my account
                  </label>
                )}
              </div>
            </section>

            {/* Shipping method */}
            <section id="shipping-method" data-section="shipping-method">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Shipping Method</h2>
                {postalReady && quote.loading && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                    <Loader2 className="size-3.5 animate-spin" />
                    Updating rates…
                  </span>
                )}
              </div>

              {shippingLoading && displayOptions.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading shipping options…
                </div>
              ) : displayOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {postalReady && quote.ready
                    ? "No delivery options for this address yet. Check the postal code, or contact us and we'll arrange it."
                    : "No shipping methods available for the selected country."}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayOptions.map((option) => {
                    const content = getShippingContent(option.content, option.slug, lang);
                    const isFree =
                      !option.pending && (checkoutFreeShipping || isFreeFor(option) || option.price === 0);
                    const isSelected = chosenShipping === option.id;
                    // Staff's own delivery time wins over the courier's, and needs no address.
                    const eta = shownDeliveryTime(
                      option.content,
                      lang,
                      formatDeliveryWindow(option.min_days, option.max_days),
                    );

                    return (
                      <label
                        key={option.id}
                        className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                          option.pending
                            ? "cursor-not-allowed border-dashed border-input opacity-70"
                            : isSelected
                              ? "cursor-pointer border-primary bg-primary/5"
                              : "cursor-pointer border-input hover:bg-accent/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping_method"
                          value={option.id}
                          checked={isSelected}
                          disabled={option.pending}
                          onChange={() => {
                            setSelectedShipping(option.id);
                            if (errors.shipping_method) {
                              setErrors((prev) => ({
                                ...prev,
                                shipping_method: undefined,
                              }));
                            }
                          }}
                          className="mt-0.5 accent-primary"
                        />
                        <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{content.name}</p>
                            {option.courier && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                via {option.courier.name}
                              </p>
                            )}
                            {content.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {content.description}
                              </p>
                            )}
                            {eta && (
                              <p className="text-xs text-muted-foreground mt-0.5">{eta}</p>
                            )}
                            {option.pending && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {!postalReady
                                  ? "Enter your postal code to see the live courier rate."
                                  : quote.loading
                                    ? "Getting the live courier rate…"
                                    : "The live rate is unavailable right now. Please try again shortly."}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {option.pending
                              ? "—"
                              : isFree
                                ? "Free"
                                : <PriceDisplay price={option.price ?? 0} currency={option.currency} className="inline text-sm" />}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {postalReady && quote.error && (
                <p className="text-xs text-muted-foreground mt-2">{quote.error}</p>
              )}
              {errors.shipping_method && (
                <p className="text-xs text-destructive mt-2">
                  {errors.shipping_method}
                </p>
              )}
            </section>

            {/* Points: signed-in, not a partner, at least the minimum (ADR 0030 h, i) */}
            {pointsPreview && (
              <section id="points" data-section="points" className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Points</h2>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={usePoints}
                    disabled={pointsMax === null || pointsPreview.emailOk === false}
                    onCheckedChange={(checked) => {
                      setUsePoints(checked === true);
                      setPointsChoice(null);
                    }}
                  />
                  Use points
                </label>
                <p className="text-xs text-muted-foreground">
                  You have {formatPoints(pointsPreview.available)}.{" "}
                  {pointsMax !== null
                    ? `This order can take up to ${formatPoints(pointsMax)}.`
                    : `This order is too small to use points: the least you can use is ${formatPoints(pointsPreview.min)}.`}
                </p>
                {usePoints && pointsToUse > 0 && (
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Use S$1 less"
                      disabled={pointsToUse <= pointsPreview.min}
                      onClick={() => stepPoints(-1)}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="min-w-40 text-center text-sm font-medium" aria-live="polite">
                      {formatPoints(pointsToUse)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Use S$1 more"
                      disabled={pointsMax === null || pointsToUse >= pointsMax}
                      onClick={() => stepPoints(1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                )}
                {pointsPreview.emailOk === false && (
                  <p className="text-xs text-destructive">{POINTS_ACCOUNT_ERROR}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {POINTS_CHECKOUT_COPY}{" "}
                  <Link href={withLocale("/points", isSupportedLocale(lang) ? lang : DEFAULT_LOCALE)} className="underline underline-offset-4">
                    How points work
                  </Link>
                </p>
              </section>
            )}

            {/* Submit error */}
            {submitError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            {/* Submit / payment handoff (desktop inline) */}
            <div id="payment" data-section="payment" className="max-md:hidden">
              {checkoutButtons("inline")}
            </div>
          </form>
          )}
        </div>

        {/* Mobile sticky Pay CTA — submits the same #checkout-form via the
            button's form attribute, so no duplicated submit logic. The payment
            step brings its own bar, with the Pay button. */}
        {!payment && <MobileStickyActionBar>{checkoutButtons("bar")}</MobileStickyActionBar>}

        {/* Right: Desktop order summary */}
        <div className="hidden lg:block lg:col-span-2" id="order-summary" data-section="order-summary">
          <div className="sticky top-8">
            <Card>
              <CardContent className="pt-6">
                <h2 className="text-base font-semibold mb-4">Order Summary</h2>
                <OrderSummaryContent />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
