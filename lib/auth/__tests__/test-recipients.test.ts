import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { outsideTestRecipients, testRecipientsOf } = await import("../test-recipients");

const member = (email: string | null, over: { is_active?: boolean; auth_user_id?: string | null } = {}) => ({
  email,
  is_active: true,
  auth_user_id: "u1",
  ...over,
});

describe("who a test email can go to", () => {
  it("is whoever is signed in first, then every other active Member by address", () => {
    expect(testRecipientsOf([member("Zoe@mpillow.com"), member("sg@mpillow.com"), member("amy@mpillow.com")], " SG@mpillow.com ")).toEqual([
      "sg@mpillow.com",
      "amy@mpillow.com",
      "zoe@mpillow.com",
    ]);
  });

  it("leaves out a Member who is deactivated, or invited and yet to sign in", () => {
    const rows = [member("left@mpillow.com", { is_active: false }), member("invited@mpillow.com", { auth_user_id: null }), member(null)];
    expect(testRecipientsOf(rows, "sg@mpillow.com")).toEqual(["sg@mpillow.com"]);
  });

  it("names every address that is not on the list, however it is typed", () => {
    const allowed = ["sg@mpillow.com", "amy@mpillow.com"];
    expect(outsideTestRecipients(["SG@mpillow.com", " amy@mpillow.com"], allowed)).toEqual([]);
    expect(outsideTestRecipients(["sg@mpillow.com", "someone@gmail.com"], allowed)).toEqual(["someone@gmail.com"]);
  });
});
