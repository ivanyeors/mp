"use client";

import { useEffect, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { PriceDisplay, useDisplayPrice } from "@/components/shop/price-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMessages } from "@/lib/i18n/messages/client";
import type { Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";
import {
  formatDeliveryWindow,
  isPostalReady,
  useShippingQuote,
  type ShippingQuoteRequest,
} from "@/lib/shop/use-shipping-quote";
import { useDeliveryCountries } from "@/lib/shop/use-delivery-countries";
import { usesPostalCode } from "@/lib/shipping/countries";
import type { ShippingMethod } from "@/lib/types/ecommerce";

interface DeliveryEstimatorProps {
  locale: Locale;
  /** Price this whole cart. Wins over `variantId` and `profile`. */
  items?: Array<{ variant_id: string; quantity: number }>;
  /** Price this variant (one unit). Omit for a generic estimate by product type. */
  variantId?: string;
  /** The box to estimate with when there is no variant. */
  profile?: "pillow" | "bolster" | "accessory";
  /** Tighter layout for the product page's trust column. */
  compact?: boolean;
  /** Leave out the free-shipping line where the page already shows progress towards it (the cart). */
  hideFreeThreshold?: boolean;
  /** Page-builder overrides for the heading; the shop.delivery copy otherwise. */
  title?: string;
  subtitle?: string;
  className?: string;
}

function contentName(content: ShippingMethod["content"], slug: string, locale: Locale): string {
  return content[locale]?.name ?? content["en-US"]?.name ?? content.en?.name ?? slug;
}

/**
 * "What will delivery cost me?" before the cart: country + postal code → every
 * shipping method that delivers there, with the live Easyship price and courier
 * transit time where the method is live, and the flat rate otherwise. Prices come
 * from the same quote endpoint the checkout uses.
 */
export function DeliveryEstimator({
  locale,
  items,
  variantId,
  profile = "pillow",
  compact = false,
  hideFreeThreshold = false,
  title,
  subtitle,
  className,
}: DeliveryEstimatorProps) {
  const m = useMessages(locale).shop.delivery;
  const displayPrice = useDisplayPrice();
  const [country, setCountry] = useState("SG");
  const [postal, setPostal] = useState("");
  // Quote what was submitted, not every keystroke: a partial postal code is a wasted courier call.
  const [submitted, setSubmitted] = useState<{ country: string; postal: string } | null>(null);
  const [freeAbove, setFreeAbove] = useState<number | null>(null);
  // Where we deliver: every country an active shipping method lists.
  const countries = useDeliveryCountries(country);
  const postalReady = isPostalReady(postal, country);

  // The free-shipping threshold for the chosen country, from the methods themselves.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/shop/shipping?country=${country}`)
      .then((res) => res.json())
      .then((json: { rows?: ShippingMethod[] }) => {
        if (cancelled) return;
        const thresholds = (json.rows ?? [])
          .map((row) => row.free_above)
          .filter((v): v is number => v != null)
          .map(Number);
        setFreeAbove(thresholds.length > 0 ? Math.min(...thresholds) : null);
      })
      .catch(() => !cancelled && setFreeAbove(null));
    return () => {
      cancelled = true;
    };
  }, [country]);

  const cart = items && items.length > 0 ? items : null;
  const request: ShippingQuoteRequest | null = submitted
    ? {
        ...(cart
          ? { items: cart }
          : variantId
            ? { items: [{ variant_id: variantId, quantity: 1 }] }
            : { profile }),
        country: submitted.country,
        postalCode: submitted.postal,
      }
    : null;
  const fieldId = cart ? "cart" : (variantId ?? profile);
  const quote = useShippingQuote(request, 0);
  const showResults = submitted != null && quote.ready && !quote.loading;
  const windowLabels = { sameDay: m.sameDay, day: m.day, days: m.days, range: m.range };

  return (
    <div className={cn("space-y-3", className)}>
      {!compact && (
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Truck className="size-4 shrink-0" />
            {title || m.title}
          </h3>
          <p className="text-sm text-muted-foreground">{subtitle || m.subtitle}</p>
        </div>
      )}

      {freeAbove != null && !hideFreeThreshold && (
        <p className={cn("flex items-center gap-2 text-sm", compact ? "text-muted-foreground" : "font-medium")}>
          {compact && <Truck className="size-4 shrink-0" />}
          {m.freeOver.replace("{amount}", displayPrice(freeAbove))}
        </p>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (postalReady) setSubmitted({ country, postal: postal.trim() });
        }}
      >
        <div className="flex flex-1 gap-2">
          <div className="w-36 shrink-0 space-y-1">
            <Label htmlFor={`delivery-country-${fieldId}`} className="text-xs">
              {m.country}
            </Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id={`delivery-country-${fieldId}`} className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`delivery-postal-${fieldId}`} className="text-xs">
              {m.postalCode}
            </Label>
            <Input
              id={`delivery-postal-${fieldId}`}
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder={usesPostalCode(country) ? m.postalPlaceholder : m.postalOptional}
              autoComplete="postal-code"
              inputMode="text"
              maxLength={12}
              className="text-base md:text-sm"
            />
          </div>
        </div>
        <Button
          type="submit"
          variant={compact ? "outline" : "default"}
          disabled={!postalReady || (submitted != null && quote.loading)}
        >
          {submitted != null && quote.loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {m.checking}
            </>
          ) : (
            m.check
          )}
        </Button>
      </form>

      {showResults && quote.error && <p className="text-sm text-muted-foreground">{m.error}</p>}
      {showResults && !quote.error && quote.options.length === 0 && (
        <p className="text-sm text-muted-foreground">{m.noOptions}</p>
      )}
      {showResults && !quote.error && quote.options.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-live="polite">
          {quote.options.map((o) => {
            const eta = formatDeliveryWindow(o.min_days, o.max_days, windowLabels);
            return (
              <li key={o.method_id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{contentName(o.content, o.slug, locale)}</p>
                  <p className="text-xs text-muted-foreground">
                    {[o.courier ? m.via.replace("{courier}", o.courier.name) : null, eta]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">
                  {o.price === 0 ? m.free : <PriceDisplay price={o.price} currency={o.currency} className="inline text-sm" />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {showResults && !quote.error && quote.options.length > 0 && (
        <p className="text-xs text-muted-foreground">{cart ? m.noteCart : m.note}</p>
      )}
    </div>
  );
}
