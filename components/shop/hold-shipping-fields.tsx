"use client";

import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import {
  SavedAddressSelect,
  type HoldShippingAddress,
} from "@/components/shop/saved-address-select";
import { formatDeliveryWindow, isPostalReady, useShippingQuote } from "@/lib/shop/use-shipping-quote";
import { useDeliveryCountries } from "@/lib/shop/use-delivery-countries";
import { findCountry, usesPostalCode } from "@/lib/shipping/countries";
import { needsState } from "@/lib/shipping/state-countries";
import { shownDeliveryTime } from "@/lib/shipping/delivery-time";
import type { PackageType } from "@/lib/shipping/types";
import type { CustomerAddress } from "@/lib/types/ecommerce";

const CountryPicker = dynamic(() => import("@/components/shop/country-picker").then((m) => m.CountryPicker), {
  loading: () => <div className="h-9 w-full rounded-md border border-input max-md:min-h-11" />,
});

export type HoldShippingMethod = {
  id: string;
  slug: string;
  base_rate: number;
  free_above: number | null;
  currency?: string;
  rate_source?: "flat" | "easyship";
  content: Record<string, { name?: string; description?: string; estimated_days?: string }>;
  collect_location?: { id: string; name: string; address: string } | null;
};

export type HoldShippingMethods = { country: string; rows: HoldShippingMethod[] };

export const HOLD_SHIPPING_METHODS_PATH = "/api/shop/shipping?collect=1";

export function isSelfCollectMethod(method: HoldShippingMethod | undefined): boolean {
  return Boolean(method?.collect_location);
}

function isLiveMethod(method: HoldShippingMethod): boolean {
  return method.rate_source === "easyship" && !method.collect_location;
}

export type HoldShippingOption = {
  method: HoldShippingMethod;
  price: number | null;
  status: "priced" | "needs_postal" | "quoting" | "unavailable";
  currency: string;
  window: string | null;
  courier: string | null;
};

export function useHoldShippingQuote({
  methods,
  address,
  parcelTypes,
  selectedId,
  onSelect,
}: {
  methods: HoldShippingMethods;
  address: HoldShippingAddress;
  parcelTypes: PackageType[];
  selectedId: string;
  onSelect: (id: string) => void;
}): { options: HoldShippingOption[]; selected: HoldShippingOption | undefined; loading: boolean } {
  const country = address.country || "SG";
  const loading = methods.country !== country;
  const rows = loading ? [] : methods.rows;
  const wantsLive = parcelTypes.length > 0 && rows.some(isLiveMethod);
  const quote = useShippingQuote(
    wantsLive
      ?
        { profile: parcelTypes, country, postalCode: address.postal_code }
      : null,
  );
  const postalReady = isPostalReady(address.postal_code, country);
  const quoted = new Map(quote.options.map((o) => [o.method_id, o]));

  const options = rows.map((method): HoldShippingOption => {
    const base = {
      method,
      currency: method.currency ?? "SGD",
      window: shownDeliveryTime(method.content, "en-US", null),
      courier: null,
    };
    if (!isLiveMethod(method)) return { ...base, price: Number(method.base_rate), status: "priced" };
    if (!postalReady) return { ...base, price: null, status: "needs_postal" };
    if (quote.loading) return { ...base, price: null, status: "quoting" };
    const option = quoted.get(method.id);
    if (quote.error || !option) return { ...base, price: null, status: "unavailable" };
    return {
      method,
      price: option.price,
      status: "priced",
      currency: option.currency,
      window: shownDeliveryTime(method.content, "en-US", formatDeliveryWindow(option.min_days, option.max_days)),
      courier: option.courier?.name ?? null,
    };
  });

  const statusKey = options.map((o) => `${o.method.id}:${o.status}`).join(",");
  useEffect(() => {
    const current = options.find((o) => o.method.id === selectedId);
    if (current && current.status !== "unavailable") return;
    const shippable = options.filter((o) => o.status !== "unavailable");
    const next = current ? (shippable.find((o) => o.status === "priced") ?? shippable[0]) : shippable[0];
    if (next && next.method.id !== selectedId) onSelect(next.method.id);
  }, [statusKey, selectedId, onSelect]);

  return { options, selected: options.find((o) => o.method.id === selectedId), loading };
}

export function holdShippingAmount(
  option: HoldShippingOption | undefined,
  goodsSubtotal: number,
  freeShipping = false,
): number | null {
  if (!option || option.price == null) return null;
  if (freeShipping) return 0;
  const freeAbove = option.method.free_above == null ? null : Number(option.method.free_above);
  return freeAbove != null && goodsSubtotal >= freeAbove ? 0 : option.price;
}

export function holdShippingCheck(status: HoldShippingOption["status"] | undefined): {
  key: "shipping";
  touched: boolean;
  valid: boolean;
  message: string;
} {
  const message =
    status === "needs_postal"
      ? "Enter your postal code to see the shipping rate"
      : status === "quoting"
        ? "Getting the shipping rate for your address…"
        : status === "unavailable"
          ? "This method can't ship to your address. Choose another."
          : "Choose a shipping method";
  return { key: "shipping", touched: status != null, valid: status === "priced", message };
}

function optionPrice(option: HoldShippingOption, goodsSubtotal: number | null, freeShipping = false): string {
  switch (option.status) {
    case "needs_postal":
      return "Enter postal code";
    case "quoting":
      return "Getting rate…";
    case "unavailable":
      return "Unavailable";
    default: {
      const amount =
        goodsSubtotal == null
          ? freeShipping
            ? 0
            : option.price
          : holdShippingAmount(option, goodsSubtotal, freeShipping);
      return amount === 0 && (option.price ?? 0) > 0 ? "Free" : `${option.currency} ${(amount ?? 0).toFixed(2)}`;
    }
  }
}

export function holdShippingName(method: HoldShippingMethod): string {
  return method.content?.["en-US"]?.name ?? method.slug;
}

export function HoldShippingTotalRow({
  option,
  goodsSubtotal,
  freeShipping = false,
}: {
  option: HoldShippingOption | undefined;
  goodsSubtotal: number | null;
  freeShipping?: boolean;
}) {
  if (!option) return null;
  return (
    <div className="mb-1 flex justify-between gap-4 text-sm">
      <span className="min-w-0 text-muted-foreground">Shipping · {holdShippingName(option.method)}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{optionPrice(option, goodsSubtotal, freeShipping)}</span>
    </div>
  );
}

export function HoldShippingFields({
  options,
  loading = false,
  goodsSubtotal,
  selectedId,
  onSelect,
  address,
  setAddress,
  errors,
  savedAddresses,
  recipientPlaceholder,
  hideTitle = false,
}: {
  options: HoldShippingOption[];
  loading?: boolean;
  goodsSubtotal: number | null;
  selectedId: string;
  onSelect: (id: string) => void;
  address: HoldShippingAddress;
  setAddress: Dispatch<SetStateAction<HoldShippingAddress>>;
  errors: Record<string, string>;
  savedAddresses: {
    signedIn: boolean;
    addresses: CustomerAddress[];
    value: string;
    onValueChange: (id: string) => void;
  };
  recipientPlaceholder: string;
  hideTitle?: boolean;
}) {
  const country = address.country || "SG";
  const countryOptions = useDeliveryCountries(country);
  const countryKey = countryOptions.map((c) => c.code).join(",");
  const countryCodes = useMemo(() => (countryKey ? countryKey.split(",") : []), [countryKey]);
  const selected = options.find((o) => o.method.id === selectedId);
  const collect = selected?.method.collect_location ?? null;
  const postalRequired = usesPostalCode(country);
  const awaitingPostal = !collect && options.some((o) => o.status === "needs_postal");

  return (
    <div className="space-y-3">
      {hideTitle ? null : <Label className="text-base font-semibold">Shipping</Label>}
      <div className="space-y-2">
        <Label htmlFor="hold-country">Ship to</Label>
        <CountryPicker
          id="hold-country"
          value={country}
          codes={countryCodes}
          onChange={(code) => setAddress((a) => ({ ...a, country: code, state: "" }))}
        />
      </div>
      <div className="space-y-2">
        <Label>Shipping method</Label>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading shipping methods…
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shipping methods available for this country.
          </p>
        ) : (
          <div className="space-y-2">
            {options.map((option) => {
              const m = option.method;
              const label = holdShippingName(m);
              const isSelected = selectedId === m.id;
              const unavailable = option.status === "unavailable";
              const detail = unavailable
                ? "No courier delivers this to your address"
                : [option.courier ? `via ${option.courier}` : null, option.window].filter(Boolean).join(" · ");
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m.id)}
                  disabled={unavailable}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : errors.shipping
                        ? "border-destructive"
                        : "border-border"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{label}</span>
                    {detail ? (
                      <span className="block text-xs text-muted-foreground">{detail}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {optionPrice(option, goodsSubtotal)}
                    {isSelected && <Check className="ml-2 inline size-4 text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {awaitingPostal ? (
          <p className="text-xs text-muted-foreground">
            Delivery is priced by courier for your address. Enter your postal code below to see the rate.
          </p>
        ) : null}
        {errors.shipping ? <p className="text-sm text-destructive">{errors.shipping}</p> : null}
      </div>

      {collect ? (
        <div className="space-y-0.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Collect from {collect.name}</p>
          <p className="break-words text-muted-foreground">{collect.address}</p>
        </div>
      ) : (
        <SavedAddressSelect {...savedAddresses} />
      )}

      <div className="space-y-2">
        <Label htmlFor="hold-recipient">{collect ? "Collected by" : "Recipient"}</Label>
        <Input
          id="hold-recipient"
          value={address.recipient}
          onChange={(e) => setAddress((a) => ({ ...a, recipient: e.target.value }))}
          placeholder={recipientPlaceholder}
          aria-invalid={!!errors.recipient}
        />
        {errors.recipient ? <p className="text-sm text-destructive">{errors.recipient}</p> : null}
      </div>

      {collect ? null : (
        <>
          <div className="space-y-2">
            <Label htmlFor="hold-line1">Address</Label>
            <Input
              id="hold-line1"
              value={address.line1}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
              placeholder="Street address"
              aria-invalid={!!errors.line1}
            />
            {errors.line1 ? <p className="text-sm text-destructive">{errors.line1}</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hold-city">City</Label>
              <Input
                id="hold-city"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                aria-invalid={!!errors.city}
              />
              {errors.city ? <p className="text-sm text-destructive">{errors.city}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="hold-postal">
                Postal code
                {postalRequired ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
              </Label>
              <Input
                id="hold-postal"
                value={address.postal_code}
                onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))}
                placeholder={findCountry(country)?.postal ?? ""}
                autoComplete="postal-code"
                aria-invalid={!!errors.postal_code}
              />
              {errors.postal_code ? (
                <p className="text-sm text-destructive">{errors.postal_code}</p>
              ) : null}
            </div>
          </div>
          {needsState(country) ? (
            <div className="space-y-2">
              <Label htmlFor="hold-state">
                State / Province <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="hold-state"
                value={address.state ?? ""}
                onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                autoComplete="address-level1"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
