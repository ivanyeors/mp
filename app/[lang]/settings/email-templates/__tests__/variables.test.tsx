// @vitest-environment jsdom
process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { click, dragData, dragStart, dropInto, pasteInto, press, richTextById, settle, typeInto, until, wordsOf } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docFromValue, richTextFromWords, richTextWords, valueFromDoc, type DocNode, type RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { richTextExtensions } from "@/components/block-editor/rich-text-schema";
import { defaultEmailCopy, editedFields, resolveEmailCopy, validateEmailCopy, type CopyField, type EmailCopy, type EmailCopySpec } from "@/lib/email/copy";
import { editableEmails, type EditableEmail, type SavedCopy } from "@/lib/email/copy-admin";
import { ORDER_EMAIL_COPY } from "@/lib/email/templates";
import { copyVariables, isOneLine } from "../copy-fields";

const h = vi.hoisted(() => ({
  rows: new Map<string, { template_id: string; copy: unknown; updated_at: string; editor: null }>(),
  sent: [] as { to: string; subject: string; html: string }[],
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => ({ permissions: new Set(["email-templates"]), email: "owner@mpillow.com", memberId: "m1", userId: "u1" })),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "p1", name: "Ivan Yeo" })) }));
vi.mock("@/lib/email/transport", async (orig) => ({
  ...(await orig<typeof import("@/lib/email/transport")>()),
  getDefaultTransport: () => ({
    name: "fake",
    send: async (e: { to: string; subject: string; html: string }) => (h.sent.push(e), { id: "1" }),
  }),
  getDefaultFromAddress: () => "Mpillow <orders@mpillow.com>",
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: h.rows.get(id) ?? null, error: null }) }) }),
      upsert: async (row: { template_id: string; copy: unknown }) => {
        h.rows.set(row.template_id, { ...row, updated_at: "2026-10-29T05:00:00Z", editor: null });
        return { error: null };
      },
      delete: () => ({ eq: async (_c: string, id: string) => (h.rows.delete(id), { error: null }) }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/email-templates/order.order_confirmation",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { EmailCopyEditor } = await import("../email-copy-editor");

const EMAILS = editableEmails();
const CONFIRMED = EMAILS.find((e) => e.spec.id === ORDER_EMAIL_COPY.order_confirmation.id)!;

function savedEdit(spec: EmailCopySpec): EmailCopy {
  const all = Object.keys(spec.placeholders).map((k) => `{${k}}`);
  const edit = (f: CopyField) =>
    f.multiline
      ? `${f.default || "Some words."}\n\n${["A second paragraph", ...all].join(" ")}.\nAnd a line of its own.`
      : [f.default || "Some words", ...all, "again"].join(" ");
  return resolveEmailCopy(spec, Object.fromEntries(Object.entries(spec.fields).map(([k, f]) => [k, edit(f)])));
}

const editors: Editor[] = [];
function throughTheInput(words: string, field: CopyField, variables: RichTextVariable[]) {
  const value = richTextFromWords(words, variables);
  const e = new Editor({ extensions: richTextExtensions({ marks: {}, variables, singleLine: isOneLine(field) }), content: docFromValue(value) });
  editors.push(e);
  return { value, read: valueFromDoc(e.getJSON() as DocNode, variables) };
}

let root: Root | null = null;
function mount(email: EditableEmail, copy: EmailCopy = defaultEmailCopy(email.spec)) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const saved: SavedCopy = { copy, edited: editedFields(email.spec, copy), updatedAt: null, updatedBy: null };
  act(() =>
    root!.render(
      <EmailCopyEditor spec={email.spec} groupLabel="Orders" variants={email.variants} saved={saved} readError={null} staffEmail="owner@mpillow.com" />,
    ),
  );
}

const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ?? null;
const chips = (within: ParentNode = document) => [...within.querySelectorAll<HTMLButtonElement>("ul[aria-label='Variables'] button")];
const chip = (label: string, within?: ParentNode) => chips(within).find((b) => b.textContent?.startsWith(label))!;
const said = () => [...document.querySelectorAll('[role="status"]')].map((s) => s.textContent ?? "").filter(Boolean);
const end = (e: Editor) => e.state.doc.content.size - 1;

beforeEach(() => {
  h.rows.clear();
  h.sent = [];
});
afterEach(async () => {
  for (const e of editors.splice(0)) e.destroy();
  act(() => root?.unmount());
  root = null;
  await settle(20);
  document.body.innerHTML = "";
});

describe("every email's words, loaded and saved", () => {
  it("round-trips every field of every email, original or saved, through the input unchanged", () => {
    expect(EMAILS.length).toBeGreaterThan(30);
    for (const { spec } of EMAILS) {
      const variables = copyVariables(spec);
      const saved = savedEdit(spec);
      expect(editedFields(spec, saved).length, spec.id).toBeGreaterThan(0);
      for (const copy of [defaultEmailCopy(spec), saved]) {
        const written: EmailCopy = {};
        for (const [k, f] of Object.entries(spec.fields)) {
          const { value, read } = throughTheInput(copy[k], f, variables);
          expect(read, `${spec.id}.${k}`).toEqual(value);
          written[k] = richTextWords(read);
          expect(written[k], `${spec.id}.${k}`).toBe(copy[k]);
        }
        expect(validateEmailCopy(spec, written)).toEqual({ ok: true, values: copy });
      }
    }
  });

  it.each(EMAILS.map((e) => [e.spec.name, e] as const))("%s: opening a saved edit changes nothing, and a save writes the untouched fields as they were", async (_name, email) => {
    const saved = savedEdit(email.spec);
    mount(email, saved);
    const keys = Object.keys(email.spec.fields);
    for (const k of keys) await richTextById(`copy-${k}`);
    expect(document.body.textContent).toContain("No unsaved changes");
    expect(button("Save")!.disabled).toBe(true);

    const first = await richTextById(`copy-${keys[0]}`);
    act(() => void first.commands.focus("end"));
    typeInto(first, " x");
    await click(button("Save")!);
    await until(() => h.rows.get(email.spec.id));
    const expected = validateEmailCopy(email.spec, { ...saved, [keys[0]]: `${saved[keys[0]]} x` });
    expect(expected.ok && h.rows.get(email.spec.id)!.copy).toEqual(expected.ok && expected.values);
    for (const k of keys.slice(1)) expect((h.rows.get(email.spec.id)!.copy as EmailCopy)[k], k).toBe(saved[k]);
  });
});

describe("the demo", () => {
  it("drags Order number into the subject as a chip; the preview and a test fill it with the sample order, and it saves as {order_number}", async () => {
    mount(CONFIRMED);
    expect(chips().map((b) => b.querySelector("span span")?.textContent)).toEqual(["Customer name", "Order number", "Points", "Amount"]);
    expect(chip("Order number").textContent).toContain("The order number, e.g. MP-10428");

    const subject = await richTextById("copy-subject");
    act(() => void subject.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Confirmed: " }] }] }));
    const data = dragData();
    dragStart(chip("Order number"), data);
    expect(data.types).toEqual(["text/html"]);
    dropInto(subject, data, end(subject));
    const placed = subject.view.dom.querySelector<HTMLElement>('[data-variable="order_number"]')!;
    expect(placed.textContent).toBe("Order number");
    expect(placed.title).toBe("The order number, e.g. MP-10428");
    expect(wordsOf("copy-subject")).toBe("Confirmed: Order number");

    await settle(500);
    expect(document.body.textContent).toContain("Subject: Confirmed: MP-10428");
    expect(document.querySelector("iframe")!.getAttribute("srcdoc")).toContain("MP-10428");

    await click(button("Send test")!);
    await until(() => h.sent[0]);
    expect(h.sent[0].subject).toBe("[Test] Confirmed: MP-10428");

    await click(button("Save")!);
    await until(() => h.rows.get(CONFIRMED.spec.id));
    expect((h.rows.get(CONFIRMED.spec.id)!.copy as EmailCopy).subject).toBe("Confirmed: {order_number}");
  });
});

describe("the keyboard's ways", () => {
  it("lists this email's Variables when { is typed, and puts a pressed chip in at the cursor, each said by name", async () => {
    mount(CONFIRMED);
    const intro = await richTextById("copy-intro");
    act(() => void intro.commands.focus("end"));
    typeInto(intro, " {");
    await settle();
    const list = document.getElementById(intro.view.dom.getAttribute("aria-controls")!)!;
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.querySelector("span")?.textContent)).toEqual(["Customer name", "Order number", "Points", "Amount"]);
    press("ArrowDown", {}, intro.view.dom);
    expect(said()).toContain("Order number, 2 of 4");
    press("Enter", {}, intro.view.dom);
    await settle();
    expect(intro.view.dom.querySelectorAll('[data-variable="order_number"]')).toHaveLength(2);
    expect(said()).toContain("Order number added.");

    const heading = await richTextById("copy-heading");
    act(() => void heading.commands.focus("start"));
    await settle(50);
    await click(chip("Customer name"));
    expect(wordsOf("copy-heading")).toBe("Customer nameThanks for your order!");
    expect(said()).toContain("Customer name added to Heading.");

    await settle(500);
    await click(button("Save")!);
    await until(() => h.rows.get(CONFIRMED.spec.id));
    expect(h.rows.get(CONFIRMED.spec.id)!.copy).toMatchObject({
      intro: "Hi {customer_name}, we've received order {order_number} and it's now confirmed. {order_number}",
      heading: "{customer_name}Thanks for your order!",
    });
  });

  it("opens the Variables in a sheet on a phone: a tap puts one in where the cursor was, and closes it", async () => {
    mount(CONFIRMED);
    const closing = await richTextById("copy-closing");
    act(() => void closing.commands.focus("end"));
    await click(button("Variables")!);
    const sheet = await until(() => document.querySelector<HTMLElement>('[role="dialog"]'));
    expect(sheet.textContent).toContain("Each email fills in its own value.");
    await click(chip("Order number", sheet));
    expect(wordsOf("copy-closing")).toBe("We'll email you again when it ships.Order number");
    await until(() => !document.querySelector('[role="dialog"]'));
  });
});

describe("only this email's Variables", () => {
  it("takes no chip it does not offer, and a {name} typed by hand that it does not have fails with the renamed message", async () => {
    mount(CONFIRMED);
    const subject = await richTextById("copy-subject");
    act(() => void subject.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] }));
    pasteInto(subject, '<p>Hi <span data-variable="first_name"></span><span data-variable="order_number"></span></p>');
    expect(subject.view.dom.querySelector('[data-variable="first_name"]')).toBeNull();
    expect(subject.view.dom.querySelector('[data-variable="order_number"]')).not.toBeNull();

    act(() => void subject.commands.focus("end"));
    typeInto(subject, " {fir");
    await settle();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    typeInto(subject, "st_name}");
    expect(wordsOf("copy-subject")).toBe("Hi Order number {first_name}");

    await settle(500);
    expect(subject.view.dom.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(subject.view.dom.getAttribute("aria-describedby")!)?.textContent).toBe("{first_name} is not a variable this email has.");
    await click(button("Save")!);
    expect(h.rows.size).toBe(0);
    expect(document.body.textContent).toContain("Check the highlighted fields.");
  });
});
