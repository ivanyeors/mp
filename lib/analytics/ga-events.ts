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

export function trackGaEventThen(event: GaEvent, next: () => void, timeoutMs = 800): void {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    next();
  };
  const sent = send(event, { transport_type: "beacon", event_callback: go, event_timeout: timeoutMs });
  if (!sent || typeof window.gtag !== "function") return go();
  setTimeout(go, timeoutMs);
}

const ONCE_PREFIX = "mp_ga_once:";

export function trackGaEventOnce(key: string, event: GaEvent): boolean {
  const storageKey = `${ONCE_PREFIX}${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return false;
  } catch {}
  const sent = trackGaEvent(event);
  if (sent) {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
  }
  return sent;
}
