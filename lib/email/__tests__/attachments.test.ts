import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendTransport, buildRawMessage, checkedAttachments } from "../transport";
import type { OutgoingEmail } from "../types";

const sample: OutgoingEmail = {
  to: "accounts@example.com",
  from: "mpillow <ops@mpillow.com>",
  subject: "Customer purchases · October 2026",
  html: "<p>Report attached.</p>",
  text: "Report attached.",
};

const CSV = "﻿Date (SGT),Customer,Amount\r\n2026-10-05,Tan Wei Ling 陈,207.10\r\n";
const withCsv: OutgoingEmail = {
  ...sample,
  attachments: [{ filename: "customer-purchases-2026-10.csv", contentType: "text/csv", content: CSV }],
};

function decode(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf8");
}

afterEach(() => vi.unstubAllGlobals());

describe("email attachments", () => {
  it("Gmail keeps a plain multipart/alternative message when there are none", () => {
    const mime = decode(buildRawMessage(sample));
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary="b_/);
    expect(mime).not.toContain("multipart/mixed");
  });

  it("Gmail wraps the body in multipart/mixed and adds each file as a base64 part", () => {
    const mime = decode(buildRawMessage(withCsv));
    const [head, body] = [mime.split("\r\n\r\n")[0], mime.split("\r\n\r\n").slice(1).join("\r\n\r\n")];
    const mixed = head.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/)?.[1];
    expect(mixed).toBeTruthy();
    expect(body).toContain(`--${mixed}\r\nContent-Type: multipart/alternative; boundary="`);
    expect(body).toContain('Content-Disposition: attachment; filename="customer-purchases-2026-10.csv"');
    expect(body.trimEnd().endsWith(`--${mixed}--`)).toBe(true);

    const part = body.split(`--${mixed}`)[2];
    const encoded = part.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(CSV);
    for (const line of part.split("\r\n\r\n")[1].trim().split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
  });

  it("Resend sends files as base64 content, and no attachments field when there are none", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const resend = new ResendTransport("re_test");
    await resend.send(withCsv);
    await resend.send(sample);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0].attachments).toEqual([
      {
        filename: "customer-purchases-2026-10.csv",
        content: Buffer.from(CSV, "utf8").toString("base64"),
        content_type: "text/csv",
      },
    ]);
    expect(bodies[1]).not.toHaveProperty("attachments");
  });

  it("refuses a filename or content type that could rewrite a MIME header", () => {
    const bad = (filename: string, contentType = "text/csv") =>
      () => checkedAttachments([{ filename, contentType, content: "" }]);
    expect(bad('x.csv"\r\nBcc: victim@x.test')).toThrow(/filename/);
    expect(bad("report 2026.csv")).toThrow(/filename/);
    expect(bad("../x.csv")).toThrow(/filename/);
    expect(bad("x.csv", "text/csv\r\nX-Evil: 1")).toThrow(/content type/);
    expect(bad("x.csv", 'text/csv; name="y"')).toThrow(/content type/);
    expect(bad("customer-purchases-2026-10.csv")).not.toThrow();
    expect(() => buildRawMessage({ ...sample, attachments: [{ filename: "a b", contentType: "text/csv", content: "" }] })).toThrow();
  });
});
