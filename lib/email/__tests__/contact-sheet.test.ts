/**
 * The review sheet is a committed artefact (docs/email-templates-preview.html),
 * so it is worth asserting the builder keeps covering everything and keeps the
 * embedded documents inert.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATE_LABELS, renderContactSheet } from "../contact-sheet";

const AUTH_COUNT = Object.keys(AUTH_TEMPLATE_LABELS).length;
import { EMAIL_REGISTRY } from "../registry";

const sheet = renderContactSheet({ root: process.cwd() });

describe("contact sheet", () => {
  it("embeds one frame per registry entry, plus the Supabase auth templates", () => {
    const frames = (sheet.match(/<iframe/g) ?? []).length;
    expect(frames).toBe(EMAIL_REGISTRY.length + AUTH_COUNT);
  });

  it("lists every registry entry by id and subject", () => {
    for (const entry of EMAIL_REGISTRY) {
      expect(sheet).toContain(entry.id);
      expect(sheet).toContain(entry.label);
    }
  });

  it("escapes the embedded documents into srcdoc", () => {
    // Exactly one unescaped doctype — the sheet's own. All 28 emails must be
    // escaped, or they would tear the host document apart.
    expect((sheet.match(/<!doctype html>/gi) ?? []).length).toBe(1);
    expect((sheet.match(/&lt;!doctype html&gt;/g) ?? []).length).toBe(
      EMAIL_REGISTRY.length + AUTH_COUNT,
    );
  });

  it("points every jump-nav link at a section that exists", () => {
    const targets = [...sheet.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1]);
    const ids = [...sheet.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set(ids));
  });

  it("renders the hostile fixture without breaking out of the frames", () => {
    const hostile = renderContactSheet({ root: process.cwd(), fixture: "hostile" });
    expect((hostile.match(/<!doctype html>/gi) ?? []).length).toBe(1);
    expect(hostile).not.toContain("<img src=x onerror");
  });
});
