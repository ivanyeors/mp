"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, CreditCard, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/shop/cart-context";
import { useCurrency } from "@/lib/shop/currency-context";
import { PriceDisplay, formatPrice } from "@/components/shop/price-display";
import { Button } from "@/components/ui/button";
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

const NEW_ADDRESS = "new";

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

const COUNTRY_OPTIONS = [
  { code: "MY", label: "Malaysia" },
  { code: "SG", label: "Singapore" },
  { code: "ID", label: "Indonesia" },
  { code: "TH", label: "Thailand" },
  { code: "PH", label: "Philippines" },
  { code: "BN", label: "Brunei" },
];

function getShippingContent(method: ShippingMethod, lang: string): LocalizedShippingContent {
  return method.content[lang] ?? method.content["en"] ?? { name: method.slug };
}

// ---------------------------------------------------------------------------
// Checkout Page
// ---------------------------------------------------------------------------

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";

  const { items, subtotal, couponCode, couponDiscount, couponFreeShipping, clearCart } = useCart();
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

  // Shipping
  const [shippingMethods, setShippingMethods] = useState<ShippingMethod[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedShipping, setSelectedShipping] = useState<string>("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Order summary collapsible on mobile
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Saved addresses (signed-in shoppers only)
  const [signedIn, setSignedIn] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(NEW_ADDRESS);
  const [saveNewAddress, setSaveNewAddress] = useState(false);

  // Redirect if cart is empty
  useEffect(() => {
    if (items.length === 0) {
      router.replace(`/${lang}/shop`);
    }
  }, [items.length, lang, router]);

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

  // Fetch shipping methods when country changes
  useEffect(() => {
    if (!form.country) return;

    setShippingLoading(true);
    setSelectedShipping("");

    fetch(`/api/shop/shipping?country=${form.country}`)
      .then((res) => res.json())
      .then((data: { rows?: ShippingMethod[] }) => {
        const methods = data.rows ?? [];
        setShippingMethods(methods);
        if (methods.length > 0) setSelectedShipping(methods[0].id);
      })
      .catch(() => setShippingMethods([]))
      .finally(() => setShippingLoading(false));
  }, [form.country]);

  const [checkoutDiscount, setCheckoutDiscount] = useState(couponDiscount);
  const [checkoutFreeShipping, setCheckoutFreeShipping] = useState(couponFreeShipping);
  const [couponPreviewError, setCouponPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!couponCode) {
      setCheckoutDiscount(0);
      setCheckoutFreeShipping(false);
      setCouponPreviewError(null);
      return;
    }

    fetch("/api/shop/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: couponCode,
        subtotal,
        product_ids: items.map((i) => i.productId),
        email: form.email || undefined,
        line_items: items.map((i) => ({
          product_id: i.productId,
          line_total: (i.price + (i.addonPrice ?? 0)) * i.quantity,
        })),
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.valid) {
          setCheckoutDiscount(0);
          setCheckoutFreeShipping(false);
          setCouponPreviewError(json.reason ?? "Invalid coupon");
          return;
        }
        setCheckoutDiscount(json.discount_amount ?? 0);
        setCheckoutFreeShipping(json.coupon?.discount_type === "free_shipping");
        setCouponPreviewError(null);
      })
      .catch(() => {
        setCheckoutDiscount(couponDiscount);
        setCheckoutFreeShipping(couponFreeShipping);
      });
  }, [couponCode, subtotal, items, form.email, couponDiscount, couponFreeShipping]);

  // Derived values
  const selectedMethod = shippingMethods.find((m) => m.id === selectedShipping) ?? null;
  const currency = items[0]?.currency ?? "SGD";
  const shippingCost =
    selectedMethod
      ? checkoutFreeShipping || (selectedMethod.free_above != null && subtotal >= selectedMethod.free_above)
        ? 0
        : selectedMethod.base_rate
      : 0;
  const total = Math.max(0, subtotal + shippingCost - checkoutDiscount);

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
    if (!form.postal_code.trim()) next.postal_code = "Postal code is required";
    if (!form.country) next.country = "Country is required";
    if (!selectedShipping) next.shipping_method = "Please select a shipping method";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setSubmitting(true);

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

    try {
      const payload = {
        email: form.email,
        phone: form.phone || undefined,
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
        shipping_method_id: selectedShipping,
        coupon_code: couponCode ?? undefined,
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

      const data = await res.json();

      if (data.checkout_url || data.url) {
        clearCart();
        window.location.href = data.checkout_url ?? data.url;
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

          {couponCode && (
            <div className="flex justify-between text-green-600 dark:text-green-400">
              <span>Coupon ({couponCode})</span>
              <span>
                {checkoutFreeShipping
                  ? "Free shipping"
                  : checkoutDiscount > 0
                    ? <>-<PriceDisplay price={checkoutDiscount} currency={currency} className="inline text-sm" /></>
                    : "Applied"}
              </span>
            </div>
          )}
          {couponPreviewError && (
            <p className="text-xs text-destructive">{couponPreviewError}</p>
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>

      {/* Mobile: collapsible order summary at top */}
      <div className="lg:hidden mb-6" data-section="order-summary">
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
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
            {/* Contact */}
            <section data-section="contact">
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
              </div>
            </section>

            {/* Shipping address */}
            <section data-section="shipping-address">
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
                <div className="grid grid-cols-3 gap-3 sm:col-span-2">
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
                      Postcode <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="postal_code"
                      type="text"
                      autoComplete="postal-code"
                      placeholder="50000"
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
                      {COUNTRY_OPTIONS.map((c) => (
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
            <section data-section="shipping-method">
              <h2 className="text-lg font-semibold mb-4">Shipping Method</h2>

              {shippingLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="size-4 animate-spin" />
                  Loading shipping options…
                </div>
              ) : shippingMethods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No shipping methods available for the selected country.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {shippingMethods.map((method) => {
                    const content = getShippingContent(method, lang);
                    const isFree =
                      method.free_above != null && subtotal >= method.free_above;
                    const cost = isFree ? 0 : method.base_rate;
                    const isSelected = selectedShipping === method.id;

                    return (
                      <label
                        key={method.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-input hover:bg-accent/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping_method"
                          value={method.id}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedShipping(method.id);
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
                            {content.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {content.description}
                              </p>
                            )}
                            {content.estimated_days && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {content.estimated_days}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-sm font-semibold">
                            {isFree
                              ? "Free"
                              : <PriceDisplay price={cost} currency={method.currency} className="inline text-sm" />}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {errors.shipping_method && (
                <p className="text-xs text-destructive mt-2">
                  {errors.shipping_method}
                </p>
              )}
            </section>

            {/* Submit error */}
            {submitError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            {/* Submit / payment handoff */}
            <div data-section="payment">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <CreditCard className="size-4" />
                  Pay with Stripe
                </>
              )}
            </Button>
            </div>
          </form>
        </div>

        {/* Right: Desktop order summary */}
        <div className="hidden lg:block lg:col-span-2" data-section="order-summary">
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
