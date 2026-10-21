import { describe, expect, it } from "vitest";
import { UpdateCustomerSchema, changedCustomerFields } from "@/lib/crm/customer-patch";
import { NoteInputSchema, canDeleteNote } from "@/lib/crm/note-rules";

describe("UpdateCustomerSchema", () => {
  it("accepts null or an empty string to clear a name or phone", () => {
    const parsed = UpdateCustomerSchema.parse({ first_name: null, last_name: "  ", phone: "" });
    expect(parsed).toEqual({ first_name: null, last_name: null, phone: null });
  });

  it("trims what it keeps", () => {
    expect(UpdateCustomerSchema.parse({ first_name: "  Mei " })).toEqual({ first_name: "Mei" });
  });

  it("refuses notes, which are Customer notes now, and any other unknown field", () => {
    expect(UpdateCustomerSchema.safeParse({ notes: "x" }).success).toBe(false);
    expect(UpdateCustomerSchema.safeParse({ total_spent: 1 }).success).toBe(false);
  });

  it("refuses an empty email", () => {
    expect(UpdateCustomerSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("changedCustomerFields", () => {
  const saved = { first_name: "Mei", last_name: null, phone: "+6591234567", tags: ["vip"], email: "m@x.test" };

  it("returns only the fields whose value differs, before and after", () => {
    expect(changedCustomerFields(saved, { first_name: "Mei", last_name: "Tan", phone: "+6591234567", tags: ["vip", "b2b"] })).toEqual({
      before: { last_name: null, tags: ["vip"] },
      after: { last_name: "Tan", tags: ["vip", "b2b"] },
    });
  });

  it("treats an empty string, whitespace and null as the same", () => {
    expect(changedCustomerFields(saved, { last_name: "  ", first_name: " Mei " })).toEqual({ before: {}, after: {} });
  });

  it("clears to null, not to an empty string", () => {
    expect(changedCustomerFields(saved, { phone: "" }).after).toEqual({ phone: null });
  });

  it("leaves alone fields the edit does not name", () => {
    expect(changedCustomerFields(saved, {}).after).toEqual({});
  });
});

describe("Customer notes rules", () => {
  it("a note is 1 to 5,000 characters after trimming", () => {
    expect(NoteInputSchema.safeParse({ body: "  " }).success).toBe(false);
    expect(NoteInputSchema.parse({ body: " hi " })).toEqual({ body: "hi" });
    expect(NoteInputSchema.safeParse({ body: "x".repeat(5000) }).success).toBe(true);
    expect(NoteInputSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
  });

  it("the author's login or an Owner or Admin may delete, nobody else", () => {
    const staff = { userId: "u1", grantsAll: false };
    expect(canDeleteNote(staff, { authorUserId: "u1" })).toBe(true);
    expect(canDeleteNote(staff, { authorUserId: "u2" })).toBe(false);
    // A note moved from customers.notes has no author.
    expect(canDeleteNote(staff, { authorUserId: null })).toBe(false);
    expect(canDeleteNote({ userId: "u9", grantsAll: true }, { authorUserId: null })).toBe(true);
  });
});
