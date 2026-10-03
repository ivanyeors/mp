import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  easyshipConfig,
  easyshipRequest,
  EasyshipError,
  parseShipment,
  ratesRequestBody,
  shipmentRequestBody,
} from "@/lib/shipping/easyship";
import {
  isDeliveredStatus,
  parseEasyshipEvent,
  verifyEasyshipSignature,
} from "@/lib/shipping/easyship-webhook";
import { DEFAULT_SHIPPING_SETTINGS } from "@/lib/shipping/settings";
import type { Parcel, ShippingSettings } from "@/lib/shipping/types";
import type { EasyshipAddress } from "@/lib/easyship/schema";

const settings: ShippingSettings = { ...DEFAULT_SHIPPING_SETTINGS, easyship_enabled: true };

const origin: EasyshipAddress = {
  line_1: "1 Office Road",
  line_2: null,
  city: "Singapore",
  state: null,
  postal_code: "123456",
  country_alpha2: "sg",
  company_name: "Mpillow Pte Ltd",
  contact_name: "Mpillow",
  contact_phone: "+6560000000",
  contact_email: "ops@mpillow.test",
  default_for: { sender: true, return: false, pickup: false, billing: false },
};

const parcels: Parcel[] = [
  {
    length_cm: 70,
    width_cm: 45,
    height_cm: 20,
    weight_kg: 1.5,
    items: [{ description: "Mpillow", sku: "MP-M", quantity: 1, weight_kg: 1.5, declared_value: 190, currency: "SGD" }],
  },
];

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("easyshipConfig", () => {
  it("is null without a token", () => {
    expect(easyshipConfig(env({}))).toBeNull();
  });

  it("routes a sand_ token to the sandbox and anything else to production", () => {
    expect(easyshipConfig(env({ EASYSHIP_API_TOKEN: "sand_abc" }))).toEqual({
      token: "sand_abc",
      baseUrl: "https://public-api-sandbox.easyship.com/2024-09",
      environment: "sandbox",
    });
    expect(easyshipConfig(env({ EASYSHIP_API_TOKEN: "prod_abc" }))?.baseUrl).toBe(
      "https://public-api.easyship.com/2024-09",
    );
  });

  it("honours a pinned version and a base URL override", () => {
    const config = easyshipConfig(
      env({
        EASYSHIP_API_TOKEN: "prod_abc",
        EASYSHIP_API_VERSION: "2023-01",
        EASYSHIP_API_BASE_URL: "https://mock.test/",
      }),
    );
    expect(config?.baseUrl).toBe("https://mock.test/2023-01");
  });
});

describe("request bodies", () => {
  it("asks for rates in the store currency, in kg and cm, with the HS code", () => {
    const body = ratesRequestBody({
      settings,
      origin,
      destination: { country: "my", postal_code: "50450", city: "Kuala Lumpur" },
      parcels,
      currency: "SGD",
    });
    expect(body.origin_address).toMatchObject({ country_alpha2: "SG", postal_code: "123456" });
    expect(body.destination_address).toEqual({ country_alpha2: "MY", postal_code: "50450", city: "Kuala Lumpur" });
    expect(body.shipping_settings).toEqual({ units: { weight: "kg", dimensions: "cm" }, output_currency: "SGD" });
    expect(body.incoterms).toBe("DDU");
    expect(body.parcels[0]).toEqual({
      box: { length: 70, width: 45, height: 20 },
      total_actual_weight: 1.5,
      items: [
        {
          description: "Mpillow",
          sku: "MP-M",
          quantity: 1,
          actual_weight: 1.5,
          declared_currency: "SGD",
          declared_customs_value: 190,
          hs_code: "940490",
          origin_country_alpha2: "SG",
        },
      ],
    });
  });

  it("falls back to the item category when no HS code is set", () => {
    const body = ratesRequestBody({
      settings: { ...settings, hs_code: "" },
      origin,
      destination: { country: "SG", postal_code: "018989" },
      parcels,
      currency: "SGD",
    });
    expect(body.parcels[0].items[0]).toMatchObject({ category: "home_decor" });
    expect(body.parcels[0].items[0]).not.toHaveProperty("hs_code");
  });

  it("buys the label for exactly the courier chosen, with no fallback", () => {
    const body = shipmentRequestBody({
      settings,
      origin,
      destination: { country: "SG", postal_code: "018989", line1: "10 Bayfront Ave", city: "Singapore" },
      contact: { name: "Ada", email: "ada@x.test", phone: "+6591234567" },
      parcels,
      courierServiceId: "cs_ninja",
      orderNumber: "MP-1001",
      courierName: "Ninja Van Standard",
    });
    expect(body.courier_settings).toEqual({ courier_service_id: "cs_ninja", allow_fallback: false });
    expect(body.shipping_settings).toMatchObject({ buy_label: true, buy_label_synchronous: true });
    expect(body.destination_address).toMatchObject({
      contact_name: "Ada",
      contact_email: "ada@x.test",
      line_1: "10 Bayfront Ave",
    });
    expect(body.order_data).toMatchObject({ platform_order_number: "MP-1001" });
  });
});

describe("easyshipRequest", () => {
  const config = { token: "sand_t", baseUrl: "https://es.test/2024-09", environment: "sandbox" as const };

  it("sends the bearer token and parses JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rates: [] }), { status: 200 }));
    await expect(easyshipRequest(config, "/rates", { method: "POST", body: { a: 1 } }, fetchImpl)).resolves.toEqual({
      rates: [],
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://es.test/2024-09/rates");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sand_t");
    expect(init.body).toBe('{"a":1}');
  });

  it("turns an Easyship error body into a readable message", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Invalid address", details: ["postal_code is invalid"] } }),
          { status: 422 },
        ),
    );
    const err = (await easyshipRequest(config, "/rates", {}, fetchImpl).catch((e: unknown) => e)) as EasyshipError;
    expect(err).toBeInstanceOf(EasyshipError);
    expect(err.status).toBe(422);
    expect(err.message).toBe("Invalid address — postal_code is invalid");
  });
});

describe("parseShipment", () => {
  it("reads tracking, the label and the courier from a bought shipment", () => {
    expect(
      parseShipment({
        shipment: {
          easyship_shipment_id: "ESSG123",
          label_state: "generated",
          tracking_page_url: "https://track.test/ESSG123",
          trackings: [{ tracking_number: "NV123" }],
          shipping_documents: [
            { category: "commercial_invoice", base64_encoded_strings: ["aW52"] },
            { category: "label", base64_encoded_strings: ["JVBERi0="] },
          ],
          courier_service: { id: "cs_ninja", name: "Ninja Van Standard" },
          rates: [{ total_charge: 6.42, currency: "SGD" }],
        },
      }),
    ).toEqual({
      shipmentId: "ESSG123",
      labelState: "generated",
      trackingNumber: "NV123",
      trackingUrl: "https://track.test/ESSG123",
      labelUrl: null,
      labelBase64: ["JVBERi0="],
      courierName: "Ninja Van Standard",
      courierServiceId: "cs_ninja",
      totalCharge: 6.42,
      currency: "SGD",
    });
  });

  it("reads a pending label as nulls, not an error", () => {
    const parsed = parseShipment({ shipment: { easyship_shipment_id: "ESSG9", label_state: "pending" } });
    expect(parsed).toMatchObject({ shipmentId: "ESSG9", trackingNumber: null, labelUrl: null, labelBase64: [] });
  });

  it("is null without a shipment id", () => {
    expect(parseShipment({ shipment: {} })).toBeNull();
    expect(parseShipment(null)).toBeNull();
  });
});

describe("webhooks", () => {
  const secret = "whsec_test";
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sign = (header: unknown, payload: unknown, key = secret) => {
    const head = `${b64(header)}.${b64(payload)}`;
    return `${head}.${createHmac("sha256", key).update(head).digest("base64url")}`;
  };
  const now = Date.parse("2026-10-02T00:00:00Z");

  it("accepts a token Easyship signed with the secret", () => {
    expect(verifyEasyshipSignature(sign({ alg: "HS256", typ: "JWT" }, { iat: now / 1000 }), secret, now)).toBe(true);
  });

  it("rejects a wrong secret, a tampered payload, alg none and an expired token", () => {
    expect(verifyEasyshipSignature(sign({ alg: "HS256" }, {}, "other"), secret, now)).toBe(false);
    const [h, , s] = sign({ alg: "HS256" }, { a: 1 }).split(".");
    expect(verifyEasyshipSignature(`${h}.${b64({ a: 2 })}.${s}`, secret, now)).toBe(false);
    expect(verifyEasyshipSignature(`${b64({ alg: "none" })}.${b64({})}.`, secret, now)).toBe(false);
    expect(verifyEasyshipSignature(sign({ alg: "HS256" }, { exp: now / 1000 - 3600 }), secret, now)).toBe(false);
    expect(verifyEasyshipSignature(null, secret, now)).toBe(false);
    expect(verifyEasyshipSignature("not.a.jwt.at.all", secret, now)).toBe(false);
  });

  it("parses label and tracking events", () => {
    expect(
      parseEasyshipEvent({
        event_type: "shipment.label.created",
        resource_id: "ESTEST00000",
        data: {
          easyship_shipment_id: "ESTEST00000",
          label_url: "https://labels.test/ESTEST00000.pdf",
          tracking_number: "12345",
          tracking_page_url: "https://track.test/ESTEST00000",
        },
      }),
    ).toEqual({
      eventType: "shipment.label.created",
      shipmentId: "ESTEST00000",
      trackingNumber: "12345",
      trackingUrl: "https://track.test/ESTEST00000",
      labelUrl: "https://labels.test/ESTEST00000.pdf",
      status: null,
    });
    expect(parseEasyshipEvent({ data: {} })).toBeNull();
  });

  it("knows a delivery when it sees one", () => {
    expect(isDeliveredStatus("Delivered")).toBe(true);
    expect(isDeliveredStatus(" delivered ")).toBe(true);
    expect(isDeliveredStatus("Out for Delivery")).toBe(false);
    expect(isDeliveredStatus(null)).toBe(false);
  });
});
