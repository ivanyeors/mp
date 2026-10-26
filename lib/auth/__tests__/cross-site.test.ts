import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "@/lib/auth/cross-site";

const req = (method: string, headers: Record<string, string>) =>
  new Request("https://custom.mpillow.com/api/x", { method, headers: { host: "custom.mpillow.com", ...headers } });

describe("isCrossSiteWrite", () => {
  it("allows the site's own pages", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://custom.mpillow.com" }), "/api/shop/checkout")).toBe(false);
  });

  it("refuses a write from another origin, a sibling subdomain included", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://mpillow.com" }), "/api/landing-sections/publish")).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { origin: "https://evil.example" }), "/api/faq/items/1")).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "null" }), "/api/account/addresses")).toBe(true);
  });

  it("leaves reads, server callers and signed webhooks alone", () => {
    expect(isCrossSiteWrite(req("GET", { origin: "https://evil.example" }), "/api/shop/stock")).toBe(false);
    expect(isCrossSiteWrite(req("POST", {}), "/api/shop/checkout")).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: "https://hooks.example" }), "/api/stripe/webhook")).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: "https://hooks.example" }), "/api/webhooks/whatsapp")).toBe(false);
  });
});
