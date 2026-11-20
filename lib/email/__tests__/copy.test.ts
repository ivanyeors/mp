process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it, vi } from "vitest";
import {
  copyParagraphs,
  defaultEmailCopy,
  defineEmailCopy,
  editedFields,
  fillCopy,
  placeholderLabel,
  placeholdersIn,
  resolveEmailCopy,
  validateEmailCopy,
  type EmailCopySpec,
} from "../copy";
import { clearEmailCopyCache, loadEmailCopy } from "../copy-store";
import { EMAIL_REGISTRY } from "../registry";

const SPEC = defineEmailCopy({
  id: "test.sample",
  name: "Sample",
  description: "A test.",
  placeholders: { customer_name: "The name", order_number: "The order" },
  fields: {
    subject: { label: "Subject", default: "Order {order_number}" },
    intro: { label: "Message", default: "Hi {customer_name}.", multiline: true },
    closing: { label: "Closing", default: "Bye.", optional: true, max: 20 },
  },
});

describe("the copy rules", () => {
  it("fills placeholders, empties a missing value, and leaves an unknown one", () => {
    expect(fillCopy("Hi {customer_name}, {order_number} {nope}", { customer_name: "Ann", order_number: null })).toBe("Hi Ann,  {nope}");
    expect(placeholdersIn("{a} {b} {a} {B}")).toEqual(["a", "b"]);
  });

  it("splits paragraphs on blank lines", () => {
    expect(copyParagraphs("One\nstill one\n\n\nTwo\r\n\r\nThree")).toEqual(["One still one", "Two", "Three"]);
  });

  it("validates an edit: required, length, and this email's placeholders only", () => {
    expect(validateEmailCopy(SPEC, { subject: " Order  {order_number} ", intro: "Hi\n\nthere", closing: "" })).toEqual({
      ok: true,
      values: { subject: "Order {order_number}", intro: "Hi\n\nthere", closing: "" },
    });
    const bad = validateEmailCopy(SPEC, { subject: "", intro: "Hi {first_name}", closing: "x".repeat(21) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.subject).toMatch(/empty/);
      expect(bad.errors.intro).toBe("{first_name} is not a variable this email has.");
      expect(bad.errors.closing).toMatch(/At most 20/);
    }
    expect(validateEmailCopy(SPEC, { subject: "x" }).ok).toBe(false);
    const two = validateEmailCopy(SPEC, { subject: "{a} {b}", intro: "Hi", closing: "" });
    expect(!two.ok && two.errors.subject).toBe("{a}, {b} are not variables this email has.");
  });

  it("names each placeholder as Staff see its Variable", () => {
    expect(placeholderLabel("order_number")).toBe("Order number");
    expect(placeholderLabel("minutes")).toBe("Minutes");
    expect(placeholderLabel("whatsapp_number")).toBe("WhatsApp number");
  });

  it("resolves a saved edit field by field, falling back alone", () => {
    expect(resolveEmailCopy(SPEC, null)).toEqual(defaultEmailCopy(SPEC));
    expect(resolveEmailCopy(SPEC, { subject: "New {order_number}", intro: "Hi {gone}", extra: "x" })).toEqual({
      subject: "New {order_number}",
      intro: "Hi {customer_name}.",
      closing: "Bye.",
    });
    expect(editedFields(SPEC, resolveEmailCopy(SPEC, { subject: "New" }))).toEqual(["subject"]);
  });
});

describe("loadEmailCopy", () => {
  const fakeAdmin = (row: unknown, error: unknown = null) => {
    const maybeSingle = vi.fn(async () => ({ data: row, error }));
    return { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })), maybeSingle };
  };

  it("reads the saved words over the defaults, and caches them", async () => {
    clearEmailCopyCache();
    const admin = fakeAdmin({ copy: { subject: "Saved {order_number}" } });
    const one = await loadEmailCopy(SPEC, { admin: admin as never, now: 1000 });
    expect(one.subject).toBe("Saved {order_number}");
    expect(one.intro).toBe("Hi {customer_name}.");
    await loadEmailCopy(SPEC, { admin: admin as never, now: 2000 });
    expect(admin.maybeSingle).toHaveBeenCalledTimes(1);
    await loadEmailCopy(SPEC, { admin: admin as never, now: 1000 + 31_000 });
    expect(admin.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it("never throws: a failed read, or no database, gives the defaults", async () => {
    clearEmailCopyCache();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadEmailCopy(SPEC, { admin: fakeAdmin(null, { message: "down" }) as never })).toEqual(defaultEmailCopy(SPEC));
    expect(await loadEmailCopy(SPEC, { admin: null })).toEqual(defaultEmailCopy(SPEC));
  });
});

const specs = new Map<string, EmailCopySpec>();
for (const c of EMAIL_REGISTRY) if (c.copy) specs.set(c.copy.id, c.copy);
const casesOf = (id: string) => EMAIL_REGISTRY.filter((c) => c.copy?.id === id);

describe("every editable email", () => {
  it("has editable emails", () => expect(specs.size).toBeGreaterThan(0));

  it("ids are unique to one spec", () => {
    for (const c of EMAIL_REGISTRY) if (c.copy) expect(specs.get(c.copy.id)).toBe(c.copy);
  });

  it.each([...specs.values()].map((s) => [s.id, s] as const))("%s: its defaults are valid as written", (_id, spec) => {
    expect(validateEmailCopy(spec, defaultEmailCopy(spec))).toEqual({ ok: true, values: defaultEmailCopy(spec) });
    expect(spec.name.trim()).toBeTruthy();
    expect(spec.description.trim()).toBeTruthy();
    expect(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(spec.id)).toBe(true);
  });

  it.each([...specs.values()].map((s) => [s.id, s] as const))("%s: renders the same with its defaults as with none", (id, spec) => {
    for (const c of casesOf(id)) {
      for (const f of ["happy", "hostile"] as const) expect(c.render(f, defaultEmailCopy(spec))).toEqual(c.render(f));
    }
  });

  it.each([...specs.values()].map((s) => [s.id, s] as const))("%s: every field shows in the email", (id, spec) => {
    const keys = Object.keys(spec.fields);
    const copy = Object.fromEntries(keys.map((k, i) => [k, `Zq${i}marker`]));
    const seen = new Set<string>();
    for (const c of casesOf(id)) {
      const r = c.render("happy", copy);
      const all = `${r.subject}\n${r.html}\n${r.text}`;
      keys.forEach((k, i) => all.includes(`Zq${i}marker`) && seen.add(k));
    }
    expect(keys.filter((k) => !seen.has(k))).toEqual([]);
  });

  it.each([...specs.values()].map((s) => [s.id, s] as const))("%s: escapes what Staff type", (id, spec) => {
    const copy = Object.fromEntries(Object.keys(spec.fields).map((k) => [k, `<img src=x onerror=alert(1)>`]));
    for (const c of casesOf(id)) expect(c.render("happy", copy).html).not.toContain("<img src=x");
  });
});
