import { describe, expect, it } from "vitest";
import {
  MAX_UNSUBSCRIBED_LIST,
  readDefaultConsentCounts,
  readEmailList,
  readUnsubscribedList,
} from "@/lib/customer-migration/default-consent";

/**
 * Subscribing the imported customers (ADR 0039): Shopify's unsubscribed list
 * read in the browser, read again on the server, and the SQL function's
 * answer. supabase/tests/campaign-audiences/assert-consent-by-default.sql
 * asserts the function itself.
 */

const HEADER =
  "Customer ID,First Name,Last Name,Email,Accepts Email Marketing,Default Address Company,Phone,Total Spent,Total Orders,Note,Tags";

describe("readUnsubscribedList", () => {
  it("reads every distinct email from Shopify's export, lower-cased", () => {
    const csv = [
      `﻿${HEADER}`,
      "'1001,Ann,Tan,Ann@Example.com,no,,,0.00,0,,",
      "'1002,Ben,Lim, ben@example.com ,no,,,12.00,1,,",
      "'1003,Ann,Tan,ann@example.com,no,,,0.00,0,,",
      "'1004,No,Email,,no,,,0.00,0,,",
      "",
    ].join("\r\n");
    expect(readUnsubscribedList(csv)).toEqual({
      ok: true,
      emails: ["ann@example.com", "ben@example.com"],
      rows: 4,
      skipped: 1,
    });
  });

  it("reads any CSV with an Email column", () => {
    expect(readUnsubscribedList("email\nx@example.com\n")).toMatchObject({ ok: true, emails: ["x@example.com"] });
  });

  it("refuses a file with no Email column", () => {
    expect(readUnsubscribedList("Name,Phone\nAnn,123\n")).toMatchObject({ ok: false });
  });

  it("refuses a file past the limit", () => {
    const rows = Array.from({ length: MAX_UNSUBSCRIBED_LIST + 1 }, (_, i) => `p${i}@example.com`);
    expect(readUnsubscribedList(["Email", ...rows].join("\n"))).toMatchObject({ ok: false });
  });
});

describe("readEmailList", () => {
  it("re-reads the browser's list: trimmed, lower-cased, distinct", () => {
    expect(readEmailList([" A@example.com", "a@example.com", "b@example.com"])).toEqual({
      ok: true,
      emails: ["a@example.com", "b@example.com"],
    });
  });

  it("takes an empty list: nobody unsubscribed in Shopify", () => {
    expect(readEmailList([])).toEqual({ ok: true, emails: [] });
  });

  it("refuses anything that is not a list of emails", () => {
    expect(readEmailList("a@example.com")).toMatchObject({ ok: false });
    expect(readEmailList(["not an email"])).toMatchObject({ ok: false });
    expect(readEmailList([42])).toMatchObject({ ok: false });
    expect(readEmailList(null)).toMatchObject({ ok: false });
  });
});

describe("readDefaultConsentCounts", () => {
  const preview = {
    imported: 6,
    already_subscribed: 1,
    to_subscribe: 2,
    stay_unsubscribed: 1,
    listed: 3,
    listed_customers: 2,
    to_unsubscribe: 1,
  };

  it("reads the preview", () => {
    expect(readDefaultConsentCounts(preview)).toEqual({
      imported: 6,
      alreadySubscribed: 1,
      toSubscribe: 2,
      stayUnsubscribed: 1,
      listed: 3,
      listedCustomers: 2,
      toUnsubscribe: 1,
    });
  });

  it("reads a run's changes beside it", () => {
    expect(readDefaultConsentCounts({ ...preview, subscribed: 2, unsubscribed: 1 })).toMatchObject({
      subscribed: 2,
      unsubscribed: 1,
    });
  });

  it("is null for anything malformed", () => {
    expect(readDefaultConsentCounts(null)).toBeNull();
    expect(readDefaultConsentCounts({ ...preview, to_subscribe: -1 })).toBeNull();
    expect(readDefaultConsentCounts({ ...preview, imported: "6" })).toBeNull();
  });
});
