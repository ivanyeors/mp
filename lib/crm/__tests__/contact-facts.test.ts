import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { phonesMatch } from "@/lib/appointments/contacts";
import {
  latestFailedSendAt,
  latestInboundAt,
  matchTail,
  otherNumbersSeen,
  readContactFacts,
  whatsAppFacts,
  type InboundRow,
  type ReminderSendRow,
} from "@/lib/crm/contact-facts";

const ON_FILE = "8780 5311";

describe("matchTail", () => {
  it("is the last eight digits, which every phonesMatch match ends with", () => {
    expect(matchTail("+65 8780 5311")).toBe("87805311");
    expect(matchTail("87805311")).toBe("87805311");
    expect(matchTail("5311")).toBe("5311");
    expect(matchTail("call me")).toBeNull();
    expect(matchTail(null)).toBeNull();
    for (const stored of ["+6587805311", "6587805311", "87805311"]) {
      expect(stored.endsWith(matchTail(ON_FILE)!)).toBe(true);
      expect(phonesMatch(stored, ON_FILE)).toBe(true);
    }
  });
});

describe("the WhatsApp row: messaged us", () => {
  const inbound: InboundRow[] = [
    { phone: "+6587805311", received_at: "2026-10-21T02:00:00Z" },
    { phone: "+6587805311", received_at: "2026-10-23T09:30:00Z" },
    { phone: "+4487805311", received_at: "2026-10-25T00:00:00Z" },
    { phone: "+6587805312", received_at: "2026-10-26T00:00:00Z" },
  ];

  it("shows the latest message from the number on file, whatever its kind", () => {
    expect(latestInboundAt(ON_FILE, inbound)).toBe("2026-10-23T09:30:00Z");
  });

  it("does not count a different number that only matches loosely", () => {
    expect(phonesMatch("+6587805312", ON_FILE)).toBe(false);
    expect(phonesMatch("+4487805311", ON_FILE)).toBe(true);
    expect(phonesMatch("+4487805311", "+6587805311")).toBe(false);
    expect(latestInboundAt("+4487805311", inbound)).toBe("2026-10-25T00:00:00Z");
    expect(latestInboundAt("+6591234567", inbound)).toBeNull();
    expect(latestInboundAt("5311", inbound)).toBeNull();
  });

  it("is null with no message yet", () => {
    expect(latestInboundAt(ON_FILE, [])).toBeNull();
  });
});

describe("the WhatsApp row: our last WhatsApp failed", () => {
  const failed: ReminderSendRow = {
    phone: "+6587805311",
    last_outbound_at: null,
    last_error: "(#131026) Message undeliverable",
    last_error_at: "2026-10-22T01:00:00Z",
  };

  it("shows the failure date while the latest reminder send to the number failed", () => {
    expect(latestFailedSendAt(ON_FILE, [failed])).toBe("2026-10-22T01:00:00Z");
  });

  it("clears once a later send succeeds and clears last_error, on that row or another", () => {
    const sameRow: ReminderSendRow = {
      ...failed,
      last_outbound_at: "2026-10-23T01:00:00Z",
      last_error: null,
      last_error_at: null,
    };
    expect(latestFailedSendAt(ON_FILE, [sameRow])).toBeNull();
    const later: ReminderSendRow = {
      phone: "+6587805311",
      last_outbound_at: "2026-10-24T01:00:00Z",
      last_error: null,
      last_error_at: null,
    };
    expect(latestFailedSendAt(ON_FILE, [failed, later])).toBeNull();
  });

  it("counts a delivery failure recorded after a send Meta accepted", () => {
    const late: ReminderSendRow = {
      phone: "+6587805311",
      last_outbound_at: "2026-10-22T01:00:00Z",
      last_error: "(#131049) not delivered",
      last_error_at: "2026-10-22T01:05:00Z",
    };
    expect(latestFailedSendAt(ON_FILE, [late])).toBe("2026-10-22T01:05:00Z");
  });

  it("ignores another number's failure", () => {
    expect(latestFailedSendAt(ON_FILE, [{ ...failed, phone: "+4487805311" }])).toBeNull();
  });

  it("shows the failure only while it is the latest fact: a message from them since says the number works", () => {
    expect(whatsAppFacts(ON_FILE, [], [failed])).toEqual({ messagedAt: null, failedAt: "2026-10-22T01:00:00Z" });
    expect(whatsAppFacts(ON_FILE, [{ phone: "+6587805311", received_at: "2026-10-21T00:00:00Z" }], [failed])).toEqual({
      messagedAt: "2026-10-21T00:00:00Z",
      failedAt: "2026-10-22T01:00:00Z",
    });
    expect(whatsAppFacts(ON_FILE, [{ phone: "+6587805311", received_at: "2026-10-23T00:00:00Z" }], [failed])).toEqual({
      messagedAt: "2026-10-23T00:00:00Z",
      failedAt: null,
    });
  });
});

describe("otherNumbersSeen", () => {
  it("lists the numbers given on bookings and Results that are not the one on file, once each, latest first", () => {
    const seen = otherNumbersSeen(ON_FILE, [
      { phone: "+65 8780 5311", at: "2026-10-01T00:00:00Z", source: "booking" },
      { phone: "6587805311", at: "2026-10-02T00:00:00Z", source: "result" },
      { phone: "91234567", at: "2026-09-01T00:00:00Z", source: "result" },
      { phone: "+65 9123 4567", at: "2026-10-05T00:00:00Z", source: "booking" },
      { phone: "+447700900123", at: "2026-08-01T00:00:00Z", source: "result" },
      { phone: "  ", at: "2026-10-09T00:00:00Z", source: "result" },
      { phone: null, at: "2026-10-09T00:00:00Z", source: "result" },
      { phone: "n/a", at: "2026-10-09T00:00:00Z", source: "booking" },
    ]);
    expect(seen).toEqual([
      { phone: "+65 9123 4567", sources: ["booking", "result"], lastSeenAt: "2026-10-05T00:00:00Z" },
      { phone: "+447700900123", sources: ["result"], lastSeenAt: "2026-08-01T00:00:00Z" },
    ]);
  });

  it("lists every number seen when none is on file", () => {
    expect(otherNumbersSeen(null, [{ phone: "91234567", at: "2026-10-05T00:00:00Z", source: "booking" }])).toEqual([
      { phone: "+65 9123 4567", sources: ["booking"], lastSeenAt: "2026-10-05T00:00:00Z" },
    ]);
  });
});

type Call = { table: string; ops: [string, ...unknown[]][] };

function fakeAdmin(rows: Record<string, Record<string, unknown>[]>, fail?: string) {
  const calls: Call[] = [];
  const admin = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "like", "ilike", "eq", "not", "order", "limit"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: unknown) => unknown) =>
        resolve(table === fail ? { data: null, error: { message: "down" } } : { data: rows[table] ?? [], error: null });
      return builder;
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

const customer = { id: "c1", email: "Ana_T@x.test", phone: "+65 8780 5311" };

describe("readContactFacts", () => {
  it("reads WhatsApp by the number's last digits and resolves it with phonesMatch", async () => {
    const { admin, calls } = fakeAdmin({
      whatsapp_inbound: [
        { phone: "+4487805311", received_at: "2026-10-25T00:00:00Z" },
        { phone: "+6587805311", received_at: "2026-10-23T00:00:00Z" },
      ],
      appointment_reminders: [
        { phone: "+6587805311", last_outbound_at: null, last_error: "x", last_error_at: "2026-10-24T00:00:00Z" },
      ],
    });
    const facts = await readContactFacts(admin, customer, { bookings: false, results: false });
    expect(facts).toEqual({
      phone: "+65 8780 5311",
      whatsapp: { messagedAt: "2026-10-23T00:00:00Z", failedAt: "2026-10-24T00:00:00Z" },
      otherNumbers: null,
    });
    const inbound = calls.find((c) => c.table === "whatsapp_inbound")!;
    expect(inbound.ops).toContainEqual(["like", "phone", "%87805311"]);
    expect(calls.map((c) => c.table).sort()).toEqual(["appointment_reminders", "whatsapp_inbound"]);
  });

  it("reads bookings only with appointments, and Results only with results, by id and by escaped email", async () => {
    const { admin, calls } = fakeAdmin({
      readjustment_bookings: [{ phone: "91234567", created_at: "2026-10-05T00:00:00Z" }],
      mp_config_responses: [{ customer_phone: "+447700900123", created_at: "2026-08-01T00:00:00Z" }],
    });

    const bookingsOnly = await readContactFacts(admin, customer, { bookings: true, results: false });
    expect(bookingsOnly.otherNumbers).toEqual([
      { phone: "+65 9123 4567", sources: ["booking"], lastSeenAt: "2026-10-05T00:00:00Z" },
    ]);
    expect(calls.some((c) => c.table === "mp_config_responses")).toBe(false);

    calls.length = 0;
    const both = await readContactFacts(admin, customer, { bookings: true, results: true });
    expect(both.otherNumbers?.map((n) => n.phone)).toEqual(["+65 9123 4567", "+447700900123"]);
    const results = calls.filter((c) => c.table === "mp_config_responses");
    expect(results.map((c) => c.ops.find(([op]) => op === "eq" || op === "ilike"))).toEqual([
      ["eq", "customer_id", "c1"],
      ["ilike", "customer_email", "ana\\_t@x.test"],
    ]);
  });

  it("reads nothing by phone when none is on file", async () => {
    const { admin, calls } = fakeAdmin({});
    const facts = await readContactFacts(admin, { ...customer, phone: "  " }, { bookings: false, results: false });
    expect(facts).toEqual({ phone: null, whatsapp: { messagedAt: null, failedAt: null }, otherNumbers: null });
    expect(calls).toEqual([]);
  });

  it("throws when a read fails, so the page says it could not check", async () => {
    const { admin } = fakeAdmin({}, "whatsapp_inbound");
    await expect(readContactFacts(admin, customer, { bookings: false, results: false })).rejects.toThrow("down");
  });
});
