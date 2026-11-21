import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackGaEvent, trackGaEventOnce, trackGaEventThen } from "@/lib/analytics/ga-events";

type W = { gtag?: ReturnType<typeof vi.fn>; dataLayer?: unknown[]; localStorage: Storage };

function storage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe("ga-events", () => {
  let win: W;
  beforeEach(() => {
    win = { localStorage: storage() };
    vi.stubGlobal("window", win);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sends through gtag with an upper-cased currency", () => {
    win.gtag = vi.fn();
    expect(trackGaEvent({ name: "generate_lead", params: { product_type: "pillow", value: 189, currency: "sgd" } })).toBe(true);
    expect(win.gtag).toHaveBeenCalledWith("event", "generate_lead", {
      product_type: "pillow",
      value: 189,
      currency: "SGD",
      transport_type: "beacon",
    });
  });

  it("falls back to a dataLayer event when only GTM is loaded, and is a no-op with neither", () => {
    win.dataLayer = [];
    trackGaEvent({ name: "book_appointment", params: { location_id: "loc-1" } });
    expect(win.dataLayer).toEqual([{ event: "book_appointment", location_id: "loc-1", transport_type: "beacon" }]);
    delete win.dataLayer;
    expect(trackGaEvent({ name: "book_appointment", params: { location_id: "loc-1" } })).toBe(false);
  });

  it("continues exactly once: on gtag's callback, or on timeout if it never comes", () => {
    const next = vi.fn();
    win.gtag = vi.fn((_e, _n, params: { event_callback: () => void }) => params.event_callback());
    trackGaEventThen({ name: "begin_checkout", params: { value: 10, currency: "SGD", items: [] } }, next);
    vi.advanceTimersByTime(1000);
    expect(next).toHaveBeenCalledTimes(1);

    const next2 = vi.fn();
    win.gtag = vi.fn();
    trackGaEventThen({ name: "begin_checkout", params: { value: 10, currency: "SGD", items: [] } }, next2, 800);
    expect(next2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it("continues immediately when there is no gtag", () => {
    const next = vi.fn();
    trackGaEventThen({ name: "generate_lead", params: { product_type: "bolster" } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("fires a purchase once per key, so a refreshed confirmation page does not double count", () => {
    win.gtag = vi.fn();
    const purchase = { name: "purchase" as const, params: { transaction_id: "MP-1001", value: 189, currency: "SGD" } };
    expect(trackGaEventOnce("purchase:MP-1001", purchase)).toBe(true);
    expect(trackGaEventOnce("purchase:MP-1001", purchase)).toBe(false);
    expect(win.gtag).toHaveBeenCalledTimes(1);
  });
});
