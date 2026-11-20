import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setEmailTransport } from "@/lib/email";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";
import { renderRmaEmail, dispatchRmaEmail, type RmaEmailData } from "@/lib/email/rma";
import { escapeHtml } from "@/lib/email/html";

const DATA: RmaEmailData = {
  orderNumber: "MP-1001",
  customerName: "Ada Lovelace",
  resolution: "refund",
  status: "requested",
  items: [
    { title: "Memory Pillow", quantity: 1 },
    { title: "Bolster", quantity: 2 },
  ],
};

function fakeTransport() {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    name: "fake",
    async send(email) {
      sent.push(email);
      return { id: `fake_${sent.length}` };
    },
  };
  return { transport, sent };
}

function fakeAdmin() {
  const rows = new Map<string, { id: string; status: string }>();
  let seq = 0;

  const client = {
    from(table: string) {
      if (table !== "rma_emails") throw new Error(`unexpected table ${table}`);
      return {
        upsert(
          row: { rma_request_id: string; template: string },
          opts: { ignoreDuplicates?: boolean },
        ) {
          const key = `${row.rma_request_id}::${row.template}`;
          return {
            select() {
              if (rows.has(key)) {
                return Promise.resolve({
                  data: opts.ignoreDuplicates ? [] : [{ id: rows.get(key)!.id }],
                  error: null,
                });
              }
              const id = `row_${++seq}`;
              rows.set(key, { id, status: "pending" });
              return Promise.resolve({ data: [{ id }], error: null });
            },
          };
        },
        update(patch: { status: string }) {
          return {
            eq(_col: string, id: string) {
              for (const r of rows.values()) {
                if (r.id === id) r.status = patch.status;
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, rows };
}

describe("renderRmaEmail", () => {
  it("renders the requested template with order number and items", () => {
    const r = renderRmaEmail("rma_requested", DATA);
    expect(r.subject).toContain("MP-1001");
    expect(r.text).toContain("Ada Lovelace");
    expect(r.text).toContain("Memory Pillow");
    expect(r.text).toContain("Bolster x2");
    expect(r.html).toContain("Memory Pillow");
    expect(r.text.toLowerCase()).toContain("refund");
  });

  it("has a renderer for every template name (stubs included)", () => {
    for (const t of [
      "rma_requested",
      "rma_approved",
      "rma_rejected",
      "rma_instructions",
      "rma_completed",
      "rma_refunded",
    ] as const) {
      const r = renderRmaEmail(t, DATA);
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.html.length).toBeGreaterThan(0);
      expect(r.text.length).toBeGreaterThan(0);
    }
  });

  const LIFECYCLE = [
    "rma_requested",
    "rma_approved",
    "rma_rejected",
    "rma_instructions",
    "rma_completed",
    "rma_refunded",
  ] as const;

  it("gives every template a distinct subject naming the order", () => {
    const subjects = LIFECYCLE.map((t) => renderRmaEmail(t, DATA).subject);
    expect(new Set(subjects).size).toBe(LIFECYCLE.length);
    for (const s of subjects) expect(s).toContain("MP-1001");
  });

  it("never says 'your return' twice in one sentence", () => {
    for (const t of LIFECYCLE) {
      const sentence = renderRmaEmail(t, DATA).text.split("\n").filter(Boolean)[0];
      expect(sentence).toMatch(/^Hi Ada Lovelace, /);
      expect(sentence.toLowerCase().match(/your return/g)?.length ?? 0).toBeLessThan(2);
    }
  });

  it("keeps the HTML sentence and the plain-text sentence in step", () => {
    for (const t of LIFECYCLE.slice(1)) {
      const r = renderRmaEmail(t, DATA);
      const sentence = r.text.split("\n").filter(Boolean)[0];
      expect(sentence).toMatch(/^Hi Ada Lovelace, .*MP-1001/);
      expect(r.html).toContain(`>${escapeHtml(sentence)}</p>`);
    }
  });
});

describe("dispatchRmaEmail idempotency", () => {
  let sent: OutgoingEmail[];

  beforeEach(() => {
    const t = fakeTransport();
    sent = t.sent;
    setEmailTransport(t.transport);
  });

  afterEach(() => setEmailTransport(null));

  it("sends exactly one email per (rma_request_id, template)", async () => {
    const { client } = fakeAdmin();

    const first = await dispatchRmaEmail({
      rmaRequestId: "rma-1",
      template: "rma_requested",
      to: "ada@example.com",
      data: DATA,
      admin: client,
    });
    const second = await dispatchRmaEmail({
      rmaRequestId: "rma-1",
      template: "rma_requested",
      to: "ada@example.com",
      data: DATA,
      admin: client,
    });

    expect(first.sent).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.sent).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("sends independently for different RMAs on the same template", async () => {
    const { client } = fakeAdmin();
    await dispatchRmaEmail({
      rmaRequestId: "rma-1",
      template: "rma_requested",
      to: "a@example.com",
      data: DATA,
      admin: client,
    });
    await dispatchRmaEmail({
      rmaRequestId: "rma-2",
      template: "rma_requested",
      to: "b@example.com",
      data: DATA,
      admin: client,
    });
    expect(sent).toHaveLength(2);
  });

  it("marks the ledger row sent after a successful send", async () => {
    const { client, rows } = fakeAdmin();
    await dispatchRmaEmail({
      rmaRequestId: "rma-9",
      template: "rma_requested",
      to: "z@example.com",
      data: DATA,
      admin: client,
    });
    expect([...rows.values()][0].status).toBe("sent");
  });
});
