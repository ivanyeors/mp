import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appointments/google-auth", () => ({
  getGoogleAccessToken: vi.fn(async () => "test-token"),
}));

import {
  buildCreateBody,
  diffContact,
  findMatchingPerson,
  phonesMatch,
  syncGuestContact,
  syncGuestContacts,
  type PeoplePerson,
} from "@/lib/appointments/contacts";
import { extractGuestEmail } from "@/lib/appointments/calendar";

const JANE: PeoplePerson = {
  resourceName: "people/c1",
  etag: "etag-1",
  names: [{ displayName: "Jane Tan", givenName: "Jane", familyName: "Tan" }],
  phoneNumbers: [{ value: "8780 5311", canonicalForm: "+6587805311", type: "mobile" }],
  emailAddresses: [{ value: "Jane@Example.com", type: "home" }],
};

describe("phonesMatch", () => {
  it("matches E.164 against local 8-digit forms", () => {
    expect(phonesMatch("+65 8780 5311", "87805311")).toBe(true);
    expect(phonesMatch("6587805311", "+6587805311")).toBe(true);
  });
  it("rejects different numbers and short fragments", () => {
    expect(phonesMatch("+6587805311", "+6587805312")).toBe(false);
    expect(phonesMatch("5311", "+6587805311")).toBe(false);
    expect(phonesMatch("", "+6587805311")).toBe(false);
  });
});

describe("findMatchingPerson", () => {
  it("prefers a phone match", () => {
    const other: PeoplePerson = {
      resourceName: "people/c2",
      emailAddresses: [{ value: "jane@example.com" }],
    };
    const found = findMatchingPerson([other, JANE], {
      name: "Jane",
      phone: "+6587805311",
      email: "jane@example.com",
    });
    expect(found?.resourceName).toBe("people/c1");
  });
  it("falls back to email when no phone matches", () => {
    const found = findMatchingPerson([JANE], {
      name: "Jane",
      phone: "+6591112222",
      email: "JANE@example.com",
    });
    expect(found?.resourceName).toBe("people/c1");
  });
  it("returns null when nothing matches", () => {
    expect(
      findMatchingPerson([JANE], { name: "Bob", phone: "+6591112222", email: "bob@x.com" }),
    ).toBeNull();
  });
});

describe("diffContact", () => {
  it("is identical when name, phone and email already match (case/space-insensitive)", () => {
    const d = diffContact(JANE, {
      name: "  jane   TAN ",
      phone: "+6587805311",
      email: "jane@example.com",
    });
    expect(d.same).toBe(true);
    expect(d.updateFields).toEqual([]);
  });

  it("updates only the name when the name changed", () => {
    const d = diffContact(JANE, { name: "Jane Lim", phone: "+6587805311" });
    expect(d.same).toBe(false);
    expect(d.updateFields).toEqual(["names"]);
    expect(d.body.names).toEqual([{ givenName: "Jane Lim" }]);
    expect(d.body.phoneNumbers).toBeUndefined();
    expect(d.body.etag).toBe("etag-1");
  });

  it("appends a missing email while keeping existing ones", () => {
    const d = diffContact(JANE, {
      name: "Jane Tan",
      phone: "+6587805311",
      email: "jane.work@example.com",
    });
    expect(d.updateFields).toEqual(["emailAddresses"]);
    expect(d.body.emailAddresses).toEqual([
      { value: "Jane@Example.com", type: "home" },
      { value: "jane.work@example.com", type: "home" },
    ]);
  });

  it("appends a missing phone while keeping existing ones", () => {
    const d = diffContact(JANE, { name: "Jane Tan", phone: "+6591112222" });
    expect(d.updateFields).toEqual(["phoneNumbers"]);
    expect(d.body.phoneNumbers).toEqual([
      { value: "8780 5311", type: "mobile" },
      { value: "+6591112222", type: "mobile" },
    ]);
  });

  it("does not treat a missing guest email as a difference", () => {
    const d = diffContact(JANE, { name: "Jane Tan", phone: "+6587805311", email: null });
    expect(d.same).toBe(true);
  });
});

describe("buildCreateBody", () => {
  it("includes email only when provided", () => {
    expect(buildCreateBody({ name: " Bob  Lee ", phone: "+6591112222" })).toEqual({
      names: [{ givenName: "Bob Lee" }],
      phoneNumbers: [{ value: "+6591112222", type: "mobile" }],
    });
    expect(
      buildCreateBody({ name: "Bob", phone: "+6591112222", email: "bob@x.com" }).emailAddresses,
    ).toEqual([{ value: "bob@x.com", type: "home" }]);
  });
});

describe("extractGuestEmail", () => {
  it("prefers the non-self attendee", () => {
    expect(
      extractGuestEmail({
        attendees: [
          { email: "admin@mpillow.com", self: true },
          { email: "Guest@Example.com" },
        ],
        description: "Email: other@x.com",
      }),
    ).toBe("guest@example.com");
  });
  it("falls back to an Email: line in the description", () => {
    expect(
      extractGuestEmail({ description: "Name: Bob<br>Phone: +65 9111 2222<br>Email: Bob@X.com" }),
    ).toBe("bob@x.com");
    expect(extractGuestEmail({ description: "Name: Bob" })).toBeNull();
  });
});

type Call = { url: string; method: string; body: unknown };

function mockPeople(searchResults: PeoplePerson[]) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("searchContacts")) {
      const q = new URL(url).searchParams.get("query") ?? "";
      const results = q ? searchResults.map((person) => ({ person })) : [];
      return new Response(JSON.stringify({ results }), { status: 200 });
    }
    if (url.includes(":updateContact")) {
      return new Response(JSON.stringify({ resourceName: "people/c1" }), { status: 200 });
    }
    if (url.includes("createContact")) {
      return new Response(JSON.stringify({ resourceName: "people/new" }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("syncGuestContact", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("creates when no contact matches", async () => {
    const calls = mockPeople([]);
    const r = await syncGuestContact({ name: "Bob Lee", phone: "+6591112222", email: "bob@x.com" });
    expect(r).toBe("created");
    const create = calls.find((c) => c.url.includes("createContact"));
    expect(create?.method).toBe("POST");
    expect(create?.body).toEqual(buildCreateBody({ name: "Bob Lee", phone: "+6591112222", email: "bob@x.com" }));
    // warm-up (empty query) precedes the phone search
    const searches = calls.filter((c) => c.url.includes("searchContacts"));
    expect(new URL(searches[0]!.url).searchParams.get("query")).toBe("");
    expect(new URL(searches[1]!.url).searchParams.get("query")).toBe("91112222");
  });

  it("skips when the existing contact is identical", async () => {
    const calls = mockPeople([JANE]);
    const r = await syncGuestContact({ name: "Jane Tan", phone: "+6587805311", email: "jane@example.com" });
    expect(r).toBe("skipped");
    expect(calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("patches only the changed fields when the contact differs", async () => {
    const calls = mockPeople([JANE]);
    const r = await syncGuestContact({ name: "Jane Lim", phone: "+6587805311" });
    expect(r).toBe("updated");
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toContain("people/c1:updateContact?updatePersonFields=names");
    expect(patch?.body).toEqual({ etag: "etag-1", names: [{ givenName: "Jane Lim" }] });
  });

  it("surfaces People API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );
    await expect(syncGuestContact({ name: "X", phone: "+6591112222" })).rejects.toThrow(
      /searchContacts failed \(429\)/,
    );
  });
});

describe("syncGuestContacts", () => {
  it("dedupes by phone, tallies results and collects per-guest errors", async () => {
    const sync = vi.fn(async (g: { name: string }) => {
      if (g.name === "Err") throw new Error("boom");
      return g.name === "New" ? ("created" as const) : ("skipped" as const);
    });
    const s = await syncGuestContacts(
      [
        { id: "e1", name: "New", phone: "+6591112222" },
        { id: "e2", name: "New", phone: "8780 5311" },
        { id: "e3", name: "Dup", phone: "+6587805311" },
        { id: "e4", name: "Err", phone: "+6593334444" },
        { id: "e5", name: "", phone: "+6595556666" },
      ],
      sync,
    );
    expect(sync).toHaveBeenCalledTimes(3);
    expect(s).toEqual({
      scanned: 5,
      created: 2,
      updated: 0,
      skipped: 0,
      errors: ["e4: contacts boom"],
    });
  });
});
