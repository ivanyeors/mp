// @vitest-environment jsdom
import { click, settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderCustomer } from "../order-customer-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const { OrderCustomerDialog } = await import("../order-customer-dialog");

const MEI = { id: "c-mei", email: "mei@example.com", first_name: "Mei", last_name: "Tan", phone: null, lifecycle_stage: "lead" };
const ZED = { id: "c-zed", email: "zed@example.com", first_name: "Zed", last_name: null, phone: null, lifecycle_stage: "lead" };

type Answer = { status?: number; body: unknown };
let searches: { q: string; answer: (rows: unknown[]) => Promise<void> }[];
let posts: unknown[];
let postAnswer: Answer;
let picked: OrderCustomer[];
let root: Root | null = null;

const response = ({ status = 200, body }: Answer) => ({ ok: status < 400, status, json: async () => body });

async function mount(canCreateCustomer: boolean) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <OrderCustomerDialog canCreateCustomer={canCreateCustomer} onClose={() => {}} onPicked={(c) => picked.push(c)} />,
    ),
  );
  await settle();
}

beforeEach(() => {
  searches = [];
  posts = [];
  picked = [];
  postAnswer = { body: { ok: true, row: ZED, created: true } };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return Promise.resolve(response(postAnswer));
      }
      const q = new URL(url, "http://x").searchParams.get("search") ?? "";
      return new Promise((resolve) => {
        searches.push({
          q,
          answer: async (rows) => {
            await act(async () => resolve(response({ body: { ok: true, rows } })));
            await settle();
          },
        });
      });
    }),
  );
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const field = (id: string) => document.querySelector<HTMLInputElement>(`#${id}`)!;
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text));
async function search(text: string) {
  typeField(field("order-customer-search"), text);
  await settle(400);
}
const listed = () => [...document.querySelectorAll('ul[aria-label="Customers"] button')].map((b) => b.textContent);

describe("Create order: who is it for", () => {
  it("searches once typing pauses, and hands the customer picked to the order", async () => {
    await mount(true);
    await search("m");
    expect(searches).toEqual([]);
    await search("mei");
    expect(searches.map((s) => s.q)).toEqual(["mei"]);
    await searches[0].answer([MEI]);
    await click(button("Mei Tan")!);
    expect(picked).toEqual([{ id: "c-mei", name: "Mei Tan", email: "mei@example.com" }]);
  });

  it("never shows an older search's customers under a newer search", async () => {
    await mount(true);
    await search("mei");
    await search("zed");
    await searches[1].answer([ZED]);
    await searches[0].answer([MEI]);
    expect(listed()).toEqual([expect.stringContaining("zed@example.com")]);
  });

  it("offers no way to add a customer to Staff who may not change Customers", async () => {
    await mount(false);
    expect(document.body.textContent).not.toContain("New customer");
    await search("nobody");
    await searches[0].answer([]);
    expect(document.body.textContent).toContain("Nobody matches");
    expect(button("Add as new customer")).toBeUndefined();
    expect(posts).toEqual([]);
  });

  it("carries a typed email into New customer, creates them and goes on to the order", async () => {
    await mount(true);
    await search("zed@example.com");
    await searches[0].answer([]);
    await click(button("Add as new customer")!);
    expect(field("order-customer-email").value).toBe("zed@example.com");
    typeField(field("order-customer-first-name"), " Zed ");
    await click(button("Create customer and continue")!);
    await settle();
    expect(posts).toEqual([{ email: "zed@example.com", first_name: "Zed" }]);
    expect(picked).toEqual([{ id: "c-zed", name: "Zed", email: "zed@example.com" }]);
  });

  it("shows a refused mobile under the mobile field and picks nobody", async () => {
    postAnswer = { status: 400, body: { error: "That mobile number doesn't look right.", field: "phone" } };
    await mount(true);
    await search("zed@example.com");
    await searches[0].answer([]);
    await click(button("Add as new customer")!);
    typeField(field("order-customer-phone"), "12");
    await click(button("Create customer and continue")!);
    await settle();
    expect(field("order-customer-phone").getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("That mobile number doesn't look right.");
    expect(picked).toEqual([]);
  });
});
