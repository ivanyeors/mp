import { describe, expect, it } from "vitest";
import { validateAnnotation } from "@/lib/seo-metrics/annotations";

describe("validateAnnotation", () => {
  it("accepts and trims a valid annotation", () => {
    expect(validateAnnotation({ date: "2026-09-30", label: "  Honeycombers listicle  ", category: "earned", url: " https://x.com/a " })).toEqual({
      ok: true,
      value: { date: "2026-09-30", label: "Honeycombers listicle", category: "earned", url: "https://x.com/a" },
    });
  });

  it.each([
    [{ date: "30/09/2026", label: "x", category: "seo" }, "valid date"],
    [{ date: "2026-02-31x", label: "x", category: "seo" }, "valid date"],
    [{ date: "2026-09-30", label: "   ", category: "seo" }, "label"],
    [{ date: "2026-09-30", label: "x".repeat(121), category: "seo" }, "120"],
    [{ date: "2026-09-30", label: "x", category: "launch" }, "category"],
    [{ date: "2026-09-30", label: "x", category: "seo", url: "javascript:alert(1)" }, "http"],
  ])("rejects %o", (input, message) => {
    const r = validateAnnotation(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  });
});
