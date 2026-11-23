// @vitest-environment jsdom
import { click, settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paidHowFromDraft } from "@/components/settings/paid-how-fields";
import type { StripePaymentOption } from "@/lib/staff-orders/shared";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: ReactNode }) => (
    <select aria-label="How it was paid" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">Pick how it was paid</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectGroupLabel: () => null,
  SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children: ReactNode }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
}));

const { MarkPaidDialog } = await import("../mark-paid-dialog");

const COUNTER: StripePaymentOption = {
  id: "pi_counter123456",
  amount: 108,
  currency: "SGD",
  paidAt: "2026-11-23T03:31:00.000Z",
  method: "Visa •••• 4242",
  description: null,
  email: "ada@example.com",
};

let listed: { status: number; body: unknown };
let asked: string[];
let posts: unknown[];
let markAnswer: { status: number; body: unknown };
let onPaid: ReturnType<typeof vi.fn<() => void>>;
let root: Root | null = null;

beforeEach(async () => {
  listed = { status: 200, body: { ok: true, payments: [COUNTER] } };
  markAnswer = { status: 200, body: { ok: true, warnings: [] } };
  asked = [];
  posts = [];
  onPaid = vi.fn<() => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return { ok: markAnswer.status < 400, status: markAnswer.status, json: async () => markAnswer.body };
      }
      asked.push(url);
      return { ok: listed.status < 400, status: listed.status, json: async () => listed.body };
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<MarkPaidDialog orderId="o1" orderNumber="MP-1" total={108} onPaid={onPaid} />));
  await settle();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const buttons = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => b.textContent?.trim() === text);
const select = () => document.querySelector<HTMLSelectElement>('select[aria-label="How it was paid"]')!;
const options = () => [...select().options].map((o) => o.textContent);
async function open() {
  await click(buttons("Mark as paid")[0]);
  await settle(50);
}
async function choose(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select(), value);
    select().dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const confirm = () => buttons("Mark as paid").at(-1)!;

describe("Mark as paid on the Order page", () => {
  it("asks Stripe for nothing until Staff open it, then for payments of exactly the order's total", async () => {
    expect(asked).toEqual([]);
    await open();
    expect(asked).toEqual(["/api/staff-orders/stripe-payments?amount=108.00"]);
    expect(options().join(" | ")).toContain("Visa •••• 4242");
    expect(options().join(" | ")).toContain("ada@example.com");
    expect(confirm().disabled).toBe(true);
  });

  it("marks it paid by the Stripe payment Staff pick", async () => {
    await open();
    await choose("stripe:pi_counter123456");
    await click(confirm());
    await settle();
    expect(posts).toEqual([
      { url: "/api/staff-orders/o1/mark-paid", body: { kind: "stripe", payment_intent_id: "pi_counter123456" } },
    ]);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("still offers the ways outside Stripe when Stripe cannot be read, and needs a note for another way", async () => {
    listed = { status: 503, body: { error: "Stripe isn't connected here, so its payments can't be listed." } };
    await open();
    expect(options().join(" | ")).toContain("Stripe isn't connected here");
    await choose("outside:other");
    expect(confirm().disabled).toBe(true);
    typeField(document.querySelector<HTMLInputElement>("#mark-paid-note")!, "Gift voucher 0042");
    await settle();
    await click(confirm());
    await settle();
    expect(posts).toEqual([
      { url: "/api/staff-orders/o1/mark-paid", body: { kind: "outside", method: "other", note: "Gift voucher 0042" } },
    ]);
  });

  it("shows why it was refused and leaves the order alone", async () => {
    markAnswer = { status: 409, body: { error: "This order was just paid through its payment link. Refresh the page." } };
    await open();
    await choose("outside:cash");
    await click(confirm());
    await settle();
    expect(document.body.textContent).toContain("just paid through its payment link");
    expect(onPaid).not.toHaveBeenCalled();
  });
});

describe("what a choice in the dropdown becomes", () => {
  it("is nothing for a Stripe payment that is no longer offered, so a changed total cannot send a stale one", () => {
    expect(paidHowFromDraft({ choice: "stripe:pi_counter123456", note: "" }, [COUNTER])).toEqual({
      kind: "stripe",
      payment_intent_id: "pi_counter123456",
    });
    expect(paidHowFromDraft({ choice: "stripe:pi_counter123456", note: "" }, [])).toBeNull();
    expect(paidHowFromDraft({ choice: "", note: "" }, [COUNTER])).toBeNull();
    expect(paidHowFromDraft({ choice: "outside:cash", note: "  " }, [])).toEqual({ kind: "outside", method: "cash" });
    expect(paidHowFromDraft({ choice: "outside:cheque", note: "x" }, [])).toBeNull();
  });
});
