import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeAftercareDb, type AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";
import { setMarketingEmailRpc } from "@/lib/marketing-consent/__tests__/fake-consent";
import {
  customerForCustomisation,
  newCustomerFields,
  type NewCustomerFields,
} from "@/lib/crm/customisation-customer";

/**
 * Every email given in a customisation is a Customer (ADR 0051): found by its
 * email, or created with the name and mobile given; a found one is never
 * changed; the box decides consent and nothing else.
 */

let db: AftercareFakeDb;
const client = () => fakeAftercareDb(db, { set_marketing_email: setMarketingEmailRpc }) as unknown as SupabaseClient;
const customer = (email: string) => db.customers.find((c) => c.email === email);

/** findOrCreateCustomer's part, over the fake: never touches a Customer it finds. */
const findOrCreate = vi.fn(async (email: string, fields: NewCustomerFields) => {
  const found = db.customers.find((c) => c.email === email);
  if (found) return found.id as string;
  const id = `c-${db.customers.length + 1}`;
  db.customers.push({ id, email, marketing_email: "not_subscribed", marketing_email_source: null, ...fields });
  return id;
});

beforeEach(() => {
  findOrCreate.mockClear();
  db = {
    customers: [
      {
        id: "c-bought",
        email: "bought@x.test",
        first_name: "Jorge",
        phone: null,
        marketing_email: "not_subscribed",
        marketing_email_source: null,
      },
      { id: "c-left", email: "left@x.test", marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" },
    ],
    customer_consent_events: [],
  };
});

describe("customerForCustomisation", () => {
  it("creates a Lead for a new email, ticked or not, with the name and mobile given", async () => {
    const id = await customerForCustomisation(
      client(),
      { email: " Ada@X.test ", name: "  Ada   Lim ", phone: "+6591234567" },
      false,
      findOrCreate,
    );
    expect(id).toBe("c-3");
    expect(customer("ada@x.test")).toMatchObject({ first_name: "Ada Lim", phone: "+6591234567", marketing_email: "not_subscribed" });
    expect(db.customer_consent_events).toEqual([]);
  });

  it("an email that matches a Customer creates nobody, and changes nothing on them", async () => {
    const id = await customerForCustomisation(
      client(),
      { email: "BOUGHT@x.test", name: "Anna (his mother)", phone: "+6598765432" },
      false,
      findOrCreate,
    );
    expect(id).toBe("c-bought");
    expect(db.customers).toHaveLength(2);
    expect(customer("bought@x.test")).toMatchObject({ first_name: "Jorge", phone: null });
  });

  it("ticked: subscribes someone nobody has asked, as customisation", async () => {
    await customerForCustomisation(client(), { email: "bought@x.test" }, true, findOrCreate);
    expect(customer("bought@x.test")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "customisation" });
  });

  it("ticked: never re-subscribes someone who unsubscribed", async () => {
    await customerForCustomisation(client(), { email: "left@x.test" }, true, findOrCreate);
    expect(customer("left@x.test")).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
    expect(db.customer_consent_events).toEqual([]);
  });

  it("no usable email: records nobody", async () => {
    expect(await customerForCustomisation(client(), { email: "  " }, true, findOrCreate)).toBeNull();
    expect(await customerForCustomisation(client(), { email: null }, true, findOrCreate)).toBeNull();
    expect(findOrCreate).not.toHaveBeenCalled();
  });

  it("never fails the caller: a failure is logged, and no consent is recorded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn().mockRejectedValue(new Error("connection reset"));
    expect(await customerForCustomisation(client(), { email: "ada@x.test" }, true, failing)).toBeNull();
    expect(db.customer_consent_events).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("newCustomerFields", () => {
  it("keeps only what was given, the whole name in first_name", () => {
    expect(newCustomerFields({ name: "Ada Lim", phone: "+6591234567" })).toEqual({ first_name: "Ada Lim", phone: "+6591234567" });
    expect(newCustomerFields({ name: "  ", phone: null })).toEqual({});
    expect(newCustomerFields({})).toEqual({});
  });

  it("caps a long name", () => {
    expect(newCustomerFields({ name: "x".repeat(300) }).first_name).toHaveLength(120);
  });
});
