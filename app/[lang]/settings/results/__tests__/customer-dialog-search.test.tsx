// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/components/block-editor/__tests__/dom";

const { ResultCustomerPanel } = await import("../[id]/result-customer-panel");

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            answer: (body) =>
              act(async () => {
                resolve({ ok: true, status: 200, json: async () => body });
              }),
          });
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const mountPanel = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ResultCustomerPanel
        resultId="r1"
        resultName="Mei Tan"
        resultEmail={null}
        resultPhone={null}
        editable
        customer={null}
        canEdit
        customerHref={(id) => `/en-US/settings/customers/${id}`}
        onChanged={() => {}}
      />,
    ),
  );
};

const page = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const click = (el: Element) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const box = () => document.getElementById("customer-search") as HTMLInputElement;
const typeInto = (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const pastDebounce = () => act(() => new Promise<void>((r) => setTimeout(r, 400)));
const searchFor = async (text: string) => {
  await typeInto(box(), text);
  await pastDebounce();
};
const lastFor = (part: string) => [...held].reverse().find((h) => h.url.includes(part))!;
const customer = (name: string) => ({
  id: name,
  first_name: name,
  last_name: null,
  email: `${name.toLowerCase()}@example.test`,
  phone: null,
  lifecycle_stage: "lead",
});

describe("Result customer dialog: 'jo' then 'john', answered out of order", () => {
  it("lists the matches for 'john' when the 'jo' search answers last", async () => {
    await mountPanel();
    await click(button("Link existing"));
    await searchFor("jo");
    await searchFor("john");
    const jo = lastFor("search=jo&");
    const john = lastFor("search=john&");

    await john.answer({ ok: true, rows: [customer("Johnny")] });
    await jo.answer({ ok: true, rows: [customer("Joanne")] });

    expect(page()).toContain("Johnny");
    expect(page()).not.toContain("Joanne");
    expect(page()).not.toContain("Searching…");
  });

  it("stops saying Searching… when a search answers after the box was emptied", async () => {
    await mountPanel();
    await click(button("Link existing"));
    await searchFor("jo");
    await typeInto(box(), "");
    expect(page()).toContain("Searching…");

    await lastFor("search=jo&").answer({ ok: true, rows: [customer("Joanne")] });

    expect(page()).not.toContain("Searching…");
    expect(page()).not.toContain("Joanne");
  });
});
