/**
 * GA4 key events (PRD-search-visibility slice 08, GA4-SETUP.md §5).
 *
 * The site loads GA4 directly (gtag via NEXT_PUBLIC_GA_MEASUREMENT_ID), and
 * gtag ignores `dataLayer.push({ event })` objects — those only reach GTM. So
 * conversions go through `gtag('event', …)` here. When only GTM is present the
 * same event is pushed to dataLayer, so a GTM-only setup still sees it.
 *
 * Params are typed and contain no personal data (no names, emails, phones):
 * Google policy and PDPA. Values come from server responses or Order rows.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export type GaItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

export type GaEvent =
  | { name: "generate_lead"; params: { product_type: "pillow" | "bolster"; value?: number; currency?: string } }
  | { name: "book_appointment"; params: { location_id: string; location_name?: string; appointment_type?: string } }
  | { name: "begin_checkout"; params: { value: number; currency: string; items: GaItem[]; coupon?: string } }
  | {
      name: "purchase";
      params: { transaction_id: string; value: number; currency: string; items?: GaItem[]; shipping?: number; tax?: number; coupon?: string };
    };

function send(event: GaEvent, extra: Record<string, unknown> = {}): boolean {
  if (typeof window === "undefined") return false;
  // GA4 rejects ISO currency in lower case.
  const params: Record<string, unknown> = { ...event.params, ...extra };
  if (typeof params.currency === "string") params.currency = params.currency.toUpperCase();
  if (typeof window.gtag === "function") {
    window.gtag("event", event.name, params);
    return true;
  }
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event: event.name, ...params });
    return true;
  }
  return false;
}

export function trackGaEvent(event: GaEvent): boolean {
  return send(event, { transport_type: "beacon" });
}

/**
 * Track, then continue (usually a redirect to Stripe). Waits for gtag's
 * event_callback so the hit is not lost to the navigation, but never longer
 * than `timeoutMs` — analytics must not hold up a checkout.
 */
export function trackGaEventThen(event: GaEvent, next: () => void, timeoutMs = 800): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    next();
  };
  const sent = send(event, { transport_type: "beacon", event_callback: go, event_timeout: timeoutMs });
  // No gtag (dev, ad blocker, GTM-only): event_callback will never fire.
  if (!sent || typeof window.gtag !== "function") return go();
  setTimeout(go, timeoutMs);
}

const ONCE_PREFIX = "mp_ga_once:";

/**
 * Fire at most once per key in this browser. Confirmation pages can be
 * refreshed or bookmarked; GA4 also dedupes purchase by transaction_id, but
 * only within a session.
 */
export function trackGaEventOnce(key: string, event: GaEvent): boolean {
  const storageKey = `${ONCE_PREFIX}${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return false;
  } catch {
    // Storage blocked (private mode): fall through and rely on GA4's own dedupe.
  }
  const sent = trackGaEvent(event);
  if (sent) {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  }
  return sent;
}
