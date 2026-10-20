import { describe, expect, it } from "vitest";
import {
  cleanCell,
  normaliseShopifyRow,
  parseShopifyCustomersCsv,
  type NormaliseResult,
  type ShopifyRawRow,
} from "@/lib/customer-migration/shopify-csv";
import { buyer, exportCsv, SHOPIFY_EXPORT_HEADER } from "./fixtures";

const ok = (r: NormaliseResult) => {
  if (!r.ok) throw new Error(`expected an importable row, got ${r.reason}`);
  return r;
};

/** A raw row with a usable email, so each case varies one thing. */
const raw = (over: ShopifyRawRow = {}): ShopifyRawRow => ({
  email: "row@example.com",
  totalOrders: "0",
  totalSpent: "0.00",
  acceptsEmailMarketing: "no",
  ...over,
});

const sgAddress: ShopifyRawRow = { address1: "1 Example Street", zip: "238801", countryCode: "SG", city: "Singapore" };

describe("parseShopifyCustomersCsv: the header", () => {
  it("accepts Shopify's export, and names the columns it never reads", () => {
    const { header, rows } = parseShopifyCustomersCsv(exportCsv([buyer(1)]));
    expect(header).toEqual({
      ok: true,
      missing: [],
      missingOptional: [],
      dropped: ["Accepts SMS Marketing", "Tax Exempt"],
    });
    expect(rows).toHaveLength(1);
  });

  it("lists every missing required column and refuses the file", () => {
    const header = SHOPIFY_EXPORT_HEADER.filter((h) => h !== "Email" && h !== "Total Spent");
    const parsed = parseShopifyCustomersCsv(exportCsv([buyer(1)], header));
    expect(parsed.header.ok).toBe(false);
    expect(parsed.header.missing).toEqual(["Email", "Total Spent"]);
  });

  it("treats an absent optional column as a note, not an error", () => {
    const header = SHOPIFY_EXPORT_HEADER.filter((h) => h !== "Customer ID" && h !== "Tags");
    const { header: check } = parseShopifyCustomersCsv(exportCsv([buyer(1)], header));
    expect(check.ok).toBe(true);
    expect(check.missingOptional).toEqual(["Customer ID", "Tags"]);
  });

  it("refuses an empty file and a file that is not a customer export", () => {
    expect(parseShopifyCustomersCsv("").header.missing).toHaveLength(6);
    expect(parseShopifyCustomersCsv("Date,Impressions\n2026-10-01,4\n").header.ok).toBe(false);
  });

  it("matches headers through a BOM, a leading ', case and spacing", () => {
    const text = "﻿'email , FIRST NAME,last name,Accepts Email Marketing,Total Orders,Total Spent\nx@example.com,A,B,yes,1,2\n";
    const { header, rows } = parseShopifyCustomersCsv(text);
    expect(header.ok).toBe(true);
    expect(rows[0]).toMatchObject({ email: "x@example.com", firstName: "A", lastName: "B" });
  });

  it("reads an older export's unprefixed address columns", () => {
    const header = ["Email", "First Name", "Last Name", "Accepts Email Marketing", "Total Orders", "Total Spent", "Address1", "Zip", "Country Code"];
    const { rows } = parseShopifyCustomersCsv(exportCsv([], header) + "\r\nold@example.com,A,B,no,0,0,1 Old Road,238801,SG");
    expect(rows[0]).toMatchObject({ address1: "1 Old Road", zip: "238801", countryCode: "SG" });
  });
});

describe("parseShopifyCustomersCsv: data minimisation", () => {
  it("keeps only the columns the import reads, so SMS consent and tax status never leave the browser", () => {
    const { rows } = parseShopifyCustomersCsv(
      exportCsv([buyer(1, { "Accepts SMS Marketing": "SMS-YES", "Tax Exempt": "TAX-YES" })]),
    );
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["acceptsEmailMarketing", "address1", "city", "countryCode", "customerId", "email", "firstName", "lastName",
        "phone", "totalOrders", "totalSpent", "zip"].sort(),
    );
    expect(JSON.stringify(rows)).not.toMatch(/SMS-YES|TAX-YES/);
  });

  it("leaves empty cells out of the raw row", () => {
    const { rows } = parseShopifyCustomersCsv(exportCsv([buyer(1, { "Default Address Address2": "" })]));
    expect(rows[0]).not.toHaveProperty("address2");
  });
});

describe("cleanCell", () => {
  it("strips a BOM, the leading ' of Shopify's CSV for Excel, and whitespace", () => {
    expect(cleanCell("﻿abc")).toBe("abc");
    expect(cleanCell("'+6591234567")).toBe("+6591234567");
    expect(cleanCell("  ' 018956 ")).toBe("018956");
    expect(cleanCell(undefined)).toBe("");
  });
});

describe("normaliseShopifyRow: email", () => {
  it("lowercases and trims", () => {
    expect(ok(normaliseShopifyRow(raw({ email: "  Mixed.Case@Example.COM " }))).row.email).toBe("mixed.case@example.com");
  });

  it("skips a row with no email: a phone-only customer cannot sign in", () => {
    expect(normaliseShopifyRow(raw({ email: undefined, phone: "+6591234567" }))).toEqual({ ok: false, reason: "no_email" });
    expect(normaliseShopifyRow(raw({ email: "  '  " }))).toEqual({ ok: false, reason: "no_email" });
  });

  it("skips a malformed email", () => {
    for (const email of ["ana", "ana@example", "ana @example.com", "@example.com", `${"a".repeat(250)}@example.com`]) {
      expect(normaliseShopifyRow(raw({ email })), email).toEqual({ ok: false, reason: "invalid_email" });
    }
  });
});

describe("normaliseShopifyRow: Customer ID", () => {
  it("reads a bigint as digits, through a leading ' and leading zeros", () => {
    expect(ok(normaliseShopifyRow(raw({ customerId: "'7012345678901" }))).row.shopify_customer_id).toBe("7012345678901");
    expect(ok(normaliseShopifyRow(raw({ customerId: "0042" }))).row.shopify_customer_id).toBe("42");
    expect(ok(normaliseShopifyRow(raw({ customerId: "9223372036854775807" }))).row.shopify_customer_id).toBe(
      "9223372036854775807",
    );
  });

  it("is null when absent, blank or not a bigint, so email is the key", () => {
    for (const customerId of [undefined, "", "abc", "12.5", "0", "9223372036854775808", "1".repeat(20)]) {
      expect(ok(normaliseShopifyRow(raw({ customerId }))).row.shopify_customer_id, String(customerId)).toBeNull();
    }
  });
});

describe("normaliseShopifyRow: names", () => {
  it("trims, and an empty name is null", () => {
    const { row } = ok(normaliseShopifyRow(raw({ firstName: "  Ana ", lastName: "  " })));
    expect(row.first_name).toBe("Ana");
    expect(row.last_name).toBeNull();
  });
});

describe("normaliseShopifyRow: phone", () => {
  it("keeps E.164, and gives an 8-digit Singapore number starting 6, 8 or 9 a +65", () => {
    expect(ok(normaliseShopifyRow(raw({ phone: "'+6591234567" }))).row.phone).toBe("+6591234567");
    expect(ok(normaliseShopifyRow(raw({ phone: "+60 12 345 6789" }))).row.phone).toBe("+60123456789");
    for (const [phone, e164] of [["91234567", "+6591234567"], ["8123 4567", "+6581234567"], ["61234567", "+6561234567"]]) {
      const r = ok(normaliseShopifyRow(raw({ phone })));
      expect(r.row.phone, phone).toBe(e164);
      expect(r.repairs).not.toContain("phone_dropped");
    }
  });

  it("drops anything else and counts it", () => {
    for (const phone of ["12345678", "1234", "call me", "+65 1234 5678"]) {
      const r = ok(normaliseShopifyRow(raw({ phone })));
      expect(r.row.phone, phone).toBeNull();
      expect(r.repairs, phone).toContain("phone_dropped");
    }
  });

  it("is never required", () => {
    const r = ok(normaliseShopifyRow(raw()));
    expect(r.row.phone).toBeNull();
    expect(r.repairs).toEqual([]);
  });
});

describe("normaliseShopifyRow: address", () => {
  it("builds the default address in customer_addresses columns, country written explicitly", () => {
    const { row, repairs } = ok(
      normaliseShopifyRow(
        raw({
          firstName: "Ana",
          lastName: "Example",
          ...sgAddress,
          address2: "#05-01",
          provinceCode: "",
          addressPhone: "91234567",
        }),
      ),
    );
    expect(row.address).toEqual({
      recipient: "Ana Example",
      line1: "1 Example Street",
      line2: "#05-01",
      city: "Singapore",
      state: null,
      postal_code: "238801",
      country: "SG",
      phone: "+6591234567",
    });
    expect(repairs).toEqual([]);
  });

  it("needs Address1, Zip and Country Code, otherwise no address, counted", () => {
    for (const drop of ["address1", "zip", "countryCode"] as const) {
      const r = ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, [drop]: "" })));
      expect(r.row.address, drop).toBeNull();
      expect(r.repairs, drop).toEqual(["address_incomplete"]);
    }
  });

  it("no address at all is not a repair", () => {
    const r = ok(normaliseShopifyRow(raw({ firstName: "Ana" })));
    expect(r.row.address).toBeNull();
    expect(r.repairs).toEqual([]);
  });

  it("falls back to Company for the recipient, and needs one or the other", () => {
    expect(ok(normaliseShopifyRow(raw({ company: "Example Pte Ltd", ...sgAddress }))).row.address?.recipient).toBe(
      "Example Pte Ltd",
    );
    const none = ok(normaliseShopifyRow(raw({ ...sgAddress })));
    expect(none.row.address).toBeNull();
    expect(none.repairs).toContain("address_incomplete");
  });

  it("falls back to Singapore for the city in SG only", () => {
    expect(ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, city: "" }))).row.address?.city).toBe("Singapore");
    const my = ok(
      normaliseShopifyRow(raw({ firstName: "Ana", address1: "1 Jalan Contoh", zip: "50450", countryCode: "MY" })),
    );
    expect(my.row.address).toBeNull();
    expect(my.repairs).toContain("address_incomplete");
  });

  it("left-pads an SG postcode a spreadsheet read as a number (018956 → 18956) and counts it", () => {
    const r = ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, zip: "18956" })));
    expect(r.row.address?.postal_code).toBe("018956");
    expect(r.repairs).toEqual(["zip_repaired"]);
  });

  it("leaves a 6-digit SG postcode and other countries' postcodes alone", () => {
    expect(ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, zip: "'018956" }))).row.address?.postal_code).toBe(
      "018956",
    );
    const my = ok(
      normaliseShopifyRow(
        raw({ firstName: "Ana", address1: "1 Jalan Contoh", city: "Kuala Lumpur", zip: "50450", countryCode: "my" }),
      ),
    );
    expect(my.row.address).toMatchObject({ postal_code: "50450", country: "MY" });
    expect(my.repairs).toEqual([]);
  });

  it("needs an ISO-2 country code", () => {
    const r = ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, countryCode: "Singapore" })));
    expect(r.row.address).toBeNull();
    expect(r.repairs).toContain("address_incomplete");
  });

  it("drops an unusable address phone and counts it, keeping the address", () => {
    const r = ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, addressPhone: "n/a" })));
    expect(r.row.address?.phone).toBeNull();
    expect(r.repairs).toEqual(["phone_dropped"]);
  });

  it("counts a row with both phones dropped once", () => {
    const r = ok(normaliseShopifyRow(raw({ firstName: "Ana", ...sgAddress, phone: "x", addressPhone: "y" })));
    expect(r.repairs).toEqual(["phone_dropped"]);
  });
});

describe("normaliseShopifyRow: totals, consent, tags and note", () => {
  it("reads Total Orders as an int and Total Spent as money", () => {
    const { row, repairs } = ok(normaliseShopifyRow(raw({ totalOrders: "3", totalSpent: "1,830.50" })));
    expect(row.shopify_orders_count).toBe(3);
    expect(row.shopify_amount_spent).toBe(1830.5);
    expect(repairs).toEqual([]);
    expect(ok(normaliseShopifyRow(raw({ totalSpent: "10.999" }))).row.shopify_amount_spent).toBe(11);
  });

  it("makes an unparseable total 0 and counts it", () => {
    const r = ok(normaliseShopifyRow(raw({ totalOrders: "two", totalSpent: "-5" })));
    expect(r.row.shopify_orders_count).toBe(0);
    expect(r.row.shopify_amount_spent).toBe(0);
    expect(r.repairs.sort()).toEqual(["total_orders_invalid", "total_spent_invalid"]);
  });

  it("takes only an explicit yes as consent at export", () => {
    expect(ok(normaliseShopifyRow(raw({ acceptsEmailMarketing: " YES " }))).row.email_marketing_at_export).toBe("yes");
    for (const v of ["no", "", "true", undefined]) {
      expect(ok(normaliseShopifyRow(raw({ acceptsEmailMarketing: v }))).row.email_marketing_at_export, String(v)).toBe("no");
    }
  });

  it("splits Tags on commas into shopify_tags only", () => {
    const { row } = ok(normaliseShopifyRow(raw({ tags: " neck pain, vip,, vip ,CPAP" })));
    expect(row.shopify_tags).toEqual(["neck pain", "vip", "CPAP"]);
  });

  it("copies Note as it is into shopify_note only", () => {
    const note = "Prefers firm fill, \"no\" latex\nCalls after 6pm";
    expect(ok(normaliseShopifyRow(raw({ note }))).row.shopify_note).toBe(note);
    expect(ok(normaliseShopifyRow(raw())).row.shopify_note).toBeNull();
  });
});
