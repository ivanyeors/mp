import type {
  Parcel,
  ShippingDestination,
  ShippingSettings,
} from "@/lib/shipping/types";
import type { EasyshipAddress } from "@/lib/easyship/schema";

/**
 * Easyship Public API client (https://developers.easyship.com).
 *
 * The token is an environment variable, never a database row. Easyship issues
 * sandbox tokens prefixed `sand_` and production tokens prefixed `prod_`; the
 * prefix picks the host, so a sandbox token can never buy a real label.
 * EASYSHIP_API_BASE_URL overrides the host (for a proxy or a mock server).
 */

export const DEFAULT_EASYSHIP_API_VERSION = "2024-09";
const PRODUCTION_HOST = "https://public-api.easyship.com";
const SANDBOX_HOST = "https://public-api-sandbox.easyship.com";
const RATES_TIMEOUT_MS = 8_000;
const SHIPMENT_TIMEOUT_MS = 30_000;

export interface EasyshipConfig {
  token: string;
  baseUrl: string;
  environment: "sandbox" | "production";
}

export function easyshipConfig(env: NodeJS.ProcessEnv = process.env): EasyshipConfig | null {
  const token = env.EASYSHIP_API_TOKEN?.trim();
  if (!token) return null;
  const environment = token.startsWith("sand_") ? "sandbox" : "production";
  const version = env.EASYSHIP_API_VERSION?.trim() || DEFAULT_EASYSHIP_API_VERSION;
  const host = env.EASYSHIP_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    (environment === "sandbox" ? SANDBOX_HOST : PRODUCTION_HOST);
  return { token, baseUrl: `${host}/${version}`, environment };
}

export class EasyshipError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "EasyshipError";
  }
}

/** Easyship errors arrive as `{ error: { message, details } }`; flatten them for a person. */
function errorMessage(body: unknown, status: number): string {
  const b = body as { error?: { message?: unknown; details?: unknown } | string; message?: unknown } | null;
  const e = b?.error;
  const parts: string[] = [];
  if (typeof e === "string") parts.push(e);
  if (e && typeof e === "object") {
    if (typeof e.message === "string") parts.push(e.message);
    if (Array.isArray(e.details)) parts.push(...e.details.filter((d): d is string => typeof d === "string"));
  }
  if (typeof b?.message === "string") parts.push(b.message);
  return parts.length > 0 ? parts.join(" — ") : `Easyship request failed (${status})`;
}

export async function easyshipRequest<T = unknown>(
  config: EasyshipConfig,
  path: string,
  init: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; timeoutMs?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? RATES_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${config.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) throw new EasyshipError(errorMessage(body, res.status), res.status, body);
    return body as T;
  } catch (err) {
    if (err instanceof EasyshipError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new EasyshipError("Easyship did not respond in time", null);
    }
    throw new EasyshipError(err instanceof Error ? err.message : "Easyship request failed", null);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

function clean<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  ) as T;
}

export function originAddressBody(origin: EasyshipAddress) {
  return clean({
    contact_name: origin.contact_name,
    company_name: origin.company_name,
    contact_phone: origin.contact_phone,
    contact_email: origin.contact_email,
    line_1: origin.line_1,
    line_2: origin.line_2,
    city: origin.city,
    state: origin.state,
    postal_code: origin.postal_code,
    country_alpha2: origin.country_alpha2?.toUpperCase(),
  });
}

export function destinationAddressBody(
  destination: ShippingDestination,
  contact?: { name?: string | null; email?: string | null; phone?: string | null },
) {
  return clean({
    contact_name: contact?.name ?? undefined,
    contact_email: contact?.email ?? undefined,
    contact_phone: contact?.phone ?? undefined,
    line_1: destination.line1 ?? undefined,
    line_2: destination.line2 ?? undefined,
    city: destination.city ?? undefined,
    state: destination.state ?? undefined,
    postal_code: destination.postal_code,
    country_alpha2: destination.country.toUpperCase(),
  });
}

export function parcelsBody(parcels: Parcel[], settings: ShippingSettings, originCountry: string) {
  return parcels.map((p) => ({
    box: { length: p.length_cm, width: p.width_cm, height: p.height_cm },
    total_actual_weight: p.weight_kg,
    items: p.items.map((i) =>
      clean({
        description: i.description.slice(0, 200),
        sku: i.sku ?? undefined,
        quantity: i.quantity,
        actual_weight: i.weight_kg,
        declared_currency: i.currency,
        declared_customs_value: i.declared_value,
        // An HS code classifies the goods for customs; the category is the fallback.
        hs_code: settings.hs_code || undefined,
        category: settings.hs_code ? undefined : settings.item_category,
        origin_country_alpha2: originCountry,
      }),
    ),
  }));
}

export function ratesRequestBody(input: {
  settings: ShippingSettings;
  origin: EasyshipAddress;
  destination: ShippingDestination;
  parcels: Parcel[];
  currency: string;
}) {
  const { settings } = input;
  const originCountry = input.origin.country_alpha2.toUpperCase();
  return {
    origin_address: originAddressBody(input.origin),
    destination_address: destinationAddressBody(input.destination),
    incoterms: settings.incoterms,
    insurance: { is_insured: settings.insure_shipments },
    shipping_settings: {
      units: { weight: "kg", dimensions: "cm" },
      output_currency: input.currency,
    },
    parcels: parcelsBody(input.parcels, settings, originCountry),
  };
}

export function shipmentRequestBody(input: {
  settings: ShippingSettings;
  origin: EasyshipAddress;
  destination: ShippingDestination;
  contact: { name: string; email: string; phone?: string | null };
  parcels: Parcel[];
  courierServiceId: string;
  orderNumber: string;
  courierName?: string | null;
}) {
  const { settings } = input;
  const originCountry = input.origin.country_alpha2.toUpperCase();
  return {
    origin_address: originAddressBody(input.origin),
    destination_address: destinationAddressBody(input.destination, input.contact),
    incoterms: settings.incoterms,
    insurance: { is_insured: settings.insure_shipments },
    order_data: clean({
      platform_name: "Mpillow",
      platform_order_number: input.orderNumber,
      buyer_selected_courier_name: input.courierName ?? undefined,
    }),
    courier_settings: {
      courier_service_id: input.courierServiceId,
      allow_fallback: false,
    },
    shipping_settings: {
      units: { weight: "kg", dimensions: "cm" },
      buy_label: true,
      buy_label_synchronous: true,
      printing_options: { format: "pdf", label: "4x6", commercial_invoice: "A4", packing_slip: "none" },
    },
    parcels: parcelsBody(input.parcels, settings, originCountry),
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function requestRates(config: EasyshipConfig, body: unknown, fetchImpl?: typeof fetch) {
  return easyshipRequest(config, "/rates", { method: "POST", body, timeoutMs: RATES_TIMEOUT_MS }, fetchImpl);
}

export function createShipment(config: EasyshipConfig, body: unknown, fetchImpl?: typeof fetch) {
  return easyshipRequest(
    config,
    "/shipments",
    { method: "POST", body, timeoutMs: SHIPMENT_TIMEOUT_MS },
    fetchImpl,
  );
}

export function getShipment(config: EasyshipConfig, shipmentId: string, fetchImpl?: typeof fetch) {
  return easyshipRequest(
    config,
    `/shipments/${encodeURIComponent(shipmentId)}`,
    { timeoutMs: SHIPMENT_TIMEOUT_MS },
    fetchImpl,
  );
}

// ---------------------------------------------------------------------------
// Shipment parsing
// ---------------------------------------------------------------------------

export interface ParsedShipment {
  shipmentId: string;
  labelState: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  /** A hosted label, when Easyship returns one. */
  labelUrl: string | null;
  /** The label as base64 PDF pages, when Easyship returns the document inline. */
  labelBase64: string[];
  courierName: string | null;
  courierServiceId: string | null;
  totalCharge: number | null;
  currency: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Read what fulfilment needs out of a shipment response (`{ shipment: {...} }` or
 * the bare object). Tolerant by design: label documents and tracking moved
 * between API versions, and a field Easyship has not filled yet (an async label)
 * reads as null rather than throwing.
 */
export function parseShipment(raw: unknown): ParsedShipment | null {
  const root = obj(raw);
  const s = obj(root?.shipment) ?? root;
  const shipmentId = text(s?.easyship_shipment_id) ?? text(s?.id);
  if (!s || !shipmentId) return null;

  const trackings = Array.isArray(s.trackings) ? s.trackings.map(obj).filter(Boolean) as Obj[] : [];
  const docs = Array.isArray(s.shipping_documents)
    ? (s.shipping_documents.map(obj).filter(Boolean) as Obj[])
    : [];
  const label = docs.find((d) => String(d.category ?? "").toLowerCase() === "label") ?? null;
  const labelPages = Array.isArray(label?.base64_encoded_strings)
    ? (label!.base64_encoded_strings as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];

  const service = obj(s.courier_service) ?? obj(s.selected_courier) ?? obj(s.courier);
  const rates = Array.isArray(s.rates) ? (s.rates.map(obj).filter(Boolean) as Obj[]) : [];
  const rate = rates[0] ?? null;
  const charge = rate?.total_charge ?? s.total_charge;

  return {
    shipmentId,
    labelState: text(s.label_state),
    trackingNumber: text(trackings[0]?.tracking_number) ?? text(s.tracking_number),
    trackingUrl: text(s.tracking_page_url) ?? text(trackings[0]?.tracking_page_url),
    labelUrl: text(label?.url) ?? text(s.label_url),
    labelBase64: labelPages,
    courierName: text(service?.name) ?? text(s.courier_name),
    courierServiceId: text(service?.id) ?? text(s.courier_id),
    totalCharge: typeof charge === "number" && Number.isFinite(charge) ? Math.round(charge * 100) / 100 : null,
    currency: text(rate?.currency) ?? text(s.currency),
  };
}
