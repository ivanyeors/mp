// @vitest-environment jsdom
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byLabel, click, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import type { DraftAnswers } from "@/lib/configurator/continue-draft";
import { holdCancelDraftKey } from "@/lib/configurator/hold-cancel-restore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/mp-config",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span data-image={alt} /> }));
vi.mock("next/dynamic", () => ({
  default: (loader: () => unknown) => {
    if (!/country-picker/.test(String(loader))) return () => null;
    return function CountryPicker({ id, value, codes, onChange }: { id: string; value: string; codes: string[]; onChange: (code: string) => void }) {
      return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
          {codes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      );
    };
  },
}));
vi.mock("@/components/ui/particles", () => ({ Particles: () => null }));
vi.mock("@/components/ui/shadcn-io/dot-pattern", () => ({ DotPattern: () => null }));
vi.mock("@/components/ui/shadcn-io/retro-grid", () => ({ RetroGrid: () => null }));
vi.mock("@/components/spatial/xray-pillow", () => ({ XrayPillow: () => null }));
vi.mock("@/components/spatial/xray-pack-list", () => ({ XrayPackList: () => null }));
vi.mock("@/components/spatial/xray-section-dock", () => ({ XraySectionDock: () => null }));
vi.mock("@/components/spatial/xray-cross-section", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/spatial/xray-cross-section")>()),
  XrayCrossSection: () => null,
}));
vi.mock("@/components/configurator/config-image-upload", () => ({ ConfigImageUpload: () => null }));

const panelRenders = vi.hoisted(() => [] as { template: number | null; items: number[] }[]);
vi.mock("@/components/configurator/staff-assist-panel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/configurator/staff-assist-panel")>()),
  StaffAssistPanel: ({
    placements,
    loadedTemplate,
  }: {
    placements: { itemId: number }[];
    loadedTemplate: { id: number } | null;
  }) => {
    panelRenders.push({ template: loadedTemplate?.id ?? null, items: placements.map((p) => p.itemId) });
    return <div data-assist-template={loadedTemplate?.id ?? ""} />;
  },
}));

const { MpConfigClient } = await import("../mp-config-client");

const INFO = { h1: "Customise your Mpillow", lede: "", faqTitle: null, faqItems: [] };

const shippingMethod = (id: string, name: string) => ({
  id,
  slug: id,
  base_rate: 10,
  free_above: null,
  rate_source: "flat",
  content: { "en-US": { name } },
});
const SHIPPING: Record<string, ReturnType<typeof shippingMethod>[]> = {
  SG: [shippingMethod("sg-courier", "Singapore courier")],
  MY: [shippingMethod("my-post", "Malaysia post")],
};

const option = (item_id: number, category: string, name: string) => ({
  item_id,
  category,
  name,
  stock_available: 5,
  unit_price: 0,
  base_quantity: 1,
});
const RECOMMENDATION = {
  ok: true,
  product_type: "pillow",
  recommendation: { recommended_size: "M", recommended_kind: "premium", filling_lines: [], summary: "", explanation: "" },
  pillow_product: { id: 1, size: "M", kind: "premium" },
  variant: { id: "v1", product_id: "p1", price: 200, currency: "SGD" },
  components: {
    covers: [option(3, "cover", "Cotton cover")],
    cases: [option(4, "case", "Linen case")],
    protectors: [],
    packaging: [],
  },
  templates: [],
  available_fillings: [],
  recommendation_record: null,
};

const ANSWERS: Partial<DraftAnswers> = {
  name: "Mei",
  gender: "female",
  ageGroup: "25-34",
  bloodPressureLevel: "normal",
  earDiscomfortSideSleep: "no",
  bedFirmness: "medium",
  acidReflux: "no",
  sleepPainAreas: ["none"],
  sleepPositionType: ["side"],
  usesBolster: "no",
};
const MEASURED = { ...ANSWERS, shoulderLength: "40", neckToBack: "10", headToBack: "12", neckLength: "9" };

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
let holdShipping = false;
let recommendationRecord: Record<string, unknown> | null = null;
const answered = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  held = [];
  holdShipping = false;
  recommendationRecord = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/en-US/mp-config");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.startsWith("/api/shop/shipping?collect=1")) {
        const country = new URL(url, "http://x").searchParams.get("country") ?? "";
        if (!holdShipping) return answered({ rows: SHIPPING[country] ?? [] });
        return new Promise((resolve) => {
          held.push({ url, answer: (body) => act(async () => resolve(answered(body))) });
        });
      }
      if (url === "/api/shop/shipping/countries") return answered({ countries: ["SG", "MY"] });
      if (url === "/api/account/addresses") return answered({ signedIn: false, addresses: [] });
      if (url.startsWith("/api/results/addons")) return answered({ addons: [] });
      if (url === "/api/shop/customize") return answered({ ...RECOMMENDATION, recommendation_record: recommendationRecord });
      if (url === "/api/mp-config/assist?templateId=21") {
        return answered({ placements: [{ section: "left", sub_section: "front", slot: 0, item_id: 901 }] });
      }
      return answered({});
    }),
  );
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle();
};
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  await settle();
  vi.unstubAllGlobals();
});

const restoreToPreview = (country: string) =>
  window.localStorage.setItem(
    holdCancelDraftKey("mp-full"),
    JSON.stringify({
      v: 1,
      surface: "mp-full",
      step: "preview",
      responseId: null,
      measurementUnit: "cm",
      measurementData: MEASURED,
      selections: {
        selectedCover: null,
        selectedCase: null,
        selectedAddons: [],
        selectedShippingId: "",
        holdEmail: "",
        holdPhone: "",
        discoverySource: "",
        discoverySourceOther: "",
        notes: "",
        holdAddress: { recipient: "", line1: "", line2: "", city: "", postal_code: "", country },
      },
    }),
  );

const shippingButtons = () =>
  [...host.querySelectorAll("button")].filter((b) => b.querySelector("span.block.break-words"));
const shippingNames = () => shippingButtons().map((b) => b.querySelector("span.block.break-words")!.textContent);
const selectedShipping = () =>
  shippingButtons().find((b) => b.classList.contains("border-primary"))?.textContent ?? null;

const chooseCountry = async (code: string) => {
  const select = await until(() => host.querySelector<HTMLSelectElement>("#hold-country"));
  await until(() => select.querySelector(`option[value="${code}"]`));
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, code);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("MpConfigClient preview shipping", () => {
  it("lists the methods for the country picked last when an earlier country's answer lands after it", async () => {
    restoreToPreview("SG");
    holdShipping = true;
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => host.querySelector("#hold-country"));
    await until(() => held.filter((h) => h.url.endsWith("country=SG")).length === 2);

    await chooseCountry("MY");
    const my = await until(() => held.find((h) => h.url.endsWith("country=MY")));
    const sg = held.filter((h) => h.url.endsWith("country=SG"));

    await my.answer({ rows: SHIPPING.MY });
    for (const h of sg) await h.answer({ rows: SHIPPING.SG });
    await settle();

    expect(shippingNames()).toEqual(["Malaysia post"]);
    expect(selectedShipping()).toContain("Malaysia post");
  });

  it("shows none of the old country's methods, and selects none, while the new country's load", async () => {
    restoreToPreview("SG");
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => shippingNames().length > 0);
    expect(selectedShipping()).toContain("Singapore courier");

    holdShipping = true;
    await chooseCountry("MY");
    const my = await until(() => held.find((h) => h.url.endsWith("country=MY")));

    expect(shippingNames()).toEqual([]);
    expect(selectedShipping()).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading shipping methods…");

    await my.answer({ rows: SHIPPING.MY });
    await settle();
    expect(shippingNames()).toEqual(["Malaysia post"]);
    expect(selectedShipping()).toContain("Malaysia post");
  });

  it("keeps the picked method when the new country offers it too, but not while that country's list loads", async () => {
    const intl = shippingMethod("intl", "International courier");
    restoreToPreview("SG");
    holdShipping = true;
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => held.filter((h) => h.url.endsWith("country=SG")).length === 2);
    for (const h of held) await h.answer({ rows: [...SHIPPING.SG, intl] });
    await until(() => shippingNames().length === 2);
    await click(shippingButtons().find((b) => b.textContent?.includes("International courier"))!);
    expect(selectedShipping()).toContain("International courier");

    await chooseCountry("MY");
    const my = await until(() => held.find((h) => h.url.endsWith("country=MY")));
    expect(selectedShipping()).toBeNull();

    await my.answer({ rows: [...SHIPPING.MY, intl] });
    await settle();
    expect(shippingNames()).toEqual(["Malaysia post", "International courier"]);
    expect(selectedShipping()).toContain("International courier");
  });

  it("lists the restored country's methods when nothing races", async () => {
    restoreToPreview("MY");
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => shippingNames().length > 0);
    expect(shippingNames()).toEqual(["Malaysia post"]);
  });
});

describe("MpConfigClient staff assist mix", () => {
  it("seeds the engine's suggested Filling Template once under Strict Mode", async () => {
    panelRenders.length = 0;
    recommendationRecord = { flow: "premium-mpillow", size: "M", templateId: "21", flowRoute: null };
    restoreToPreview("SG");
    await mount(
      <StrictMode>
        <MpConfigClient info={INFO} discoverySourceOptions={[]} staffAssist />
      </StrictMode>,
    );
    await until(() => host.querySelector('[data-assist-template="21"]'));

    expect(panelRenders.at(-1)).toEqual({ template: 21, items: [901] });
    const templateReads = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.filter(([url]) =>
      String(url).startsWith("/api/mp-config/assist?templateId="),
    );
    expect(templateReads).toHaveLength(1);
  });
});

describe("MpConfigClient field errors", () => {
  const RESUME = {
    id: "00000000-0000-4000-8000-000000000001",
    token: "draft-token",
    answers: ANSWERS,
    email: "mei@example.com",
    configurator: "full" as const,
  };
  const measureInput = () => host.querySelector<HTMLInputElement>('input[placeholder="Enter measurement"]');
  const measureError = () =>
    [...host.querySelectorAll("p.text-destructive")].find((p) => p.textContent === "Enter a valid measurement") ?? null;
  const afterTransition = () => settle(350);
  const toShoulderStep = async () => {
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} resumeDraft={RESUME} />);
    await until(() => measureInput());
  };

  it("shows the measurement error on Continue and drops it once the measurement is valid", async () => {
    await toShoulderStep();
    typeField(measureInput()!, "0");
    await click(byLabel("Continue")!);
    expect(measureError()).not.toBeNull();

    typeField(measureInput()!, "15");
    await settle();
    expect(measureError()).toBeNull();
  });

  it("keeps a dropped error hidden when the answer turns invalid again, until the next Continue", async () => {
    await toShoulderStep();
    typeField(measureInput()!, "0");
    await click(byLabel("Continue")!);
    typeField(measureInput()!, "15");
    typeField(measureInput()!, "0");
    await settle();
    expect(measureError()).toBeNull();

    await click(byLabel("Continue")!);
    expect(measureError()).not.toBeNull();
  });

  it("clears the step's errors when the visitor leaves the step and comes back", async () => {
    const emailError = () =>
      [...host.querySelectorAll("p.text-destructive")].find((p) => p.textContent === "Enter a valid email address") ?? null;
    await mount(<MpConfigClient info={INFO} discoverySourceOptions={[]} askEmailFirst />);
    await click(byLabel("Get Started")!);
    await afterTransition();
    await click(byLabel("Continue")!);
    await afterTransition();
    typeField(host.querySelector<HTMLInputElement>("#mp-name")!, "Mei");
    typeField(host.querySelector<HTMLInputElement>("#mp-email")!, "mei");
    await click(byLabel("Continue")!);
    expect(emailError()).not.toBeNull();

    await click(byLabel("Back")!);
    await afterTransition();
    expect(host.querySelector("#mp-email")).toBeNull();
    await click(byLabel("Continue")!);
    await afterTransition();
    expect(host.querySelector<HTMLInputElement>("#mp-email")!.value).toBe("mei");
    expect(emailError()).toBeNull();
  });
});
