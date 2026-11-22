// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { byLabel, click, settle, typeField, until } from "@/components/block-editor/__tests__/dom";
import { holdCancelDraftKey } from "@/lib/configurator/hold-cancel-restore";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/mbolster-config",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
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
vi.mock("@/components/spatial/xray-bolster", () => ({ XrayBolster: () => null }));
vi.mock("@/components/spatial/xray-section-dock", () => ({ XraySectionDock: () => null }));
vi.mock("@/components/spatial/xray-cross-section", () => ({ BolsterCrossSection: () => null }));
vi.mock("@/components/configurator/config-image-upload", () => ({ ConfigImageUpload: () => null }));

const panelRenders = vi.hoisted(() => [] as { length: string; template: number | null; slots: number[] }[]);
vi.mock("@/components/configurator/staff-assist-bolster-panel", () => ({
  StaffAssistBolsterPanel: ({
    length,
    placements,
    loadedTemplate,
  }: {
    length: string;
    placements: { slot: number; itemId: number }[];
    loadedTemplate: { id: number } | null;
  }) => {
    panelRenders.push({ length, template: loadedTemplate?.id ?? null, slots: placements.map((p) => p.itemId) });
    return <div data-assist-length={length} data-assist-template={loadedTemplate?.id ?? ""} />;
  },
}));

const { MbolsterConfigClient } = await import("../mbolster-config-client");
const { PAIRED_HANDOFF_KEY } = await import("@/lib/configurator/paired-mbolster");

const INFO = { h1: "Customise your Mbolster", lede: "", faqTitle: null, faqItems: [] };

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

const TEMPLATE_FOR: Record<string, { id: number; itemId: number }> = {
  medium: { id: 11, itemId: 501 },
  long: { id: 12, itemId: 502 },
};

const recommendation = (length: string) => ({
  ok: true,
  product_type: "bolster",
  bolster_variant: length,
  recommendation: { recommended_size: length, recommended_kind: "bolster", filling_lines: [], summary: "", explanation: "" },
  pillow_product: { id: 1, size: length, kind: "bolster" },
  variant: { id: "v1", product_id: "p1", price: 80, currency: "SGD" },
  components: {
    covers: [],
    cases: [{ item_id: 7, category: "case", name: "Linen case", stock_available: 5, unit_price: 0, base_quantity: 1 }],
    protectors: [],
    packaging: [],
  },
  templates: [
    {
      id: TEMPLATE_FOR[length].id,
      name: `${length} mix`,
      lines: [],
      placements: [{ slot: 1, item_id: TEMPLATE_FOR[length].itemId }],
    },
  ],
  available_fillings: [],
  recommendation_record: { flow: "mbolster", size: length, templateId: TEMPLATE_FOR[length].id, flowRoute: null },
});

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
let holdShipping = false;
const answered = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  held = [];
  holdShipping = false;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/en-US/mbolster-config");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
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
      if (url === "/api/shop/customize") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return answered(recommendation(body.bolster_preferences.height_cm >= 180 ? "long" : "medium"));
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

const restoreToPreview = (country = "SG") =>
  window.localStorage.setItem(
    holdCancelDraftKey("mbolster"),
    JSON.stringify({
      v: 1,
      surface: "mbolster",
      step: "preview",
      responseId: null,
      heightUnit: "cm",
      heightCm: "170",
      sleepPosition: "side",
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

const heightInput = () => host.querySelector<HTMLInputElement>('input[inputmode="decimal"]')!;
const heightError = () =>
  [...host.querySelectorAll("p.text-destructive")].find((p) => p.textContent === "Enter a height between 80 and 250 cm") ?? null;

describe("MbolsterConfigClient preview shipping", () => {
  it("lists the methods for the country picked last when an earlier country's answer lands after it", async () => {
    restoreToPreview("SG");
    holdShipping = true;
    await mount(<MbolsterConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => host.querySelector("#hold-country"));
    await until(() => held.length > 0 && held.every((h) => h.url.endsWith("country=SG")));

    await chooseCountry("MY");
    const my = await until(() => held.find((h) => h.url.endsWith("country=MY")));
    const sg = held.filter((h) => h.url.endsWith("country=SG"));

    await my.answer({ rows: SHIPPING.MY });
    for (const h of sg) await h.answer({ rows: SHIPPING.SG });
    await settle();

    expect(shippingNames()).toEqual(["Malaysia post"]);
    expect(selectedShipping()).toContain("Malaysia post");
  });

  it("lists the restored country's methods when nothing races", async () => {
    restoreToPreview("MY");
    await mount(<MbolsterConfigClient info={INFO} discoverySourceOptions={[]} />);
    await until(() => shippingNames().length > 0);
    expect(shippingNames()).toEqual(["Malaysia post"]);
  });
});

describe("MbolsterConfigClient staff assist mix", () => {
  const pairedFromPillow = () => {
    window.history.replaceState({}, "", "/en-US/mbolster-config?paired=1");
    window.sessionStorage.setItem(
      PAIRED_HANDOFF_KEY,
      JSON.stringify({
        v: 2,
        anchorId: "anchor-1",
        companionId: "companion-1",
        sleepPosition: "side",
        reason: "",
        configPath: "/mp-config",
        pillow: { label: "Mpillow", ballpark: 200, currency: "SGD" },
        bolster: { heightUnit: "cm", heightCm: "170" },
      }),
    );
  };
  const sizeAt = async (height: string) => {
    await until(() => heightInput());
    typeField(heightInput(), height);
    await click(byLabel("Continue")!);
    await until(() => host.querySelector("[data-assist-length]"));
    await settle();
  };

  it("seeds each length's suggested mix and never shows the old length's mix at the new length", async () => {
    panelRenders.length = 0;
    pairedFromPillow();
    await mount(<MbolsterConfigClient info={INFO} discoverySourceOptions={[]} staffAssist />);

    await sizeAt("170");
    expect(panelRenders.at(-1)).toEqual({ length: "medium", template: 11, slots: [501] });

    await click(byLabel("Back")!);
    await sizeAt("190");
    expect(panelRenders.at(-1)).toEqual({ length: "long", template: 12, slots: [502] });
    expect(panelRenders.filter((r) => r.length === "long" && r.slots.includes(501))).toEqual([]);
  });
});

describe("MbolsterConfigClient field errors", () => {
  const toHeightStep = async () => {
    await mount(<MbolsterConfigClient info={INFO} discoverySourceOptions={[]} />);
    await click(byLabel("Get started")!);
    await until(() => heightInput());
  };

  it("shows the height error on Continue and drops it once the height is valid", async () => {
    await toHeightStep();
    typeField(heightInput(), "5");
    await click(byLabel("Continue")!);
    expect(heightError()).not.toBeNull();

    typeField(heightInput(), "66");
    await settle();
    expect(heightError()).toBeNull();
  });

  it("keeps a dropped error hidden when the answer turns invalid again, until the next Continue", async () => {
    await toHeightStep();
    typeField(heightInput(), "5");
    await click(byLabel("Continue")!);
    typeField(heightInput(), "66");
    typeField(heightInput(), "6");
    await settle();
    expect(heightError()).toBeNull();

    await click(byLabel("Continue")!);
    expect(heightError()).not.toBeNull();
  });

  it("clears the step's errors when the visitor leaves the step and comes back", async () => {
    await toHeightStep();
    typeField(heightInput(), "5");
    await click(byLabel("Continue")!);
    expect(heightError()).not.toBeNull();

    await click(byLabel("Back")!);
    await click(byLabel("Get started")!);
    await until(() => heightInput());
    expect(heightInput().value).toBe("5");
    expect(heightError()).toBeNull();
  });
});
