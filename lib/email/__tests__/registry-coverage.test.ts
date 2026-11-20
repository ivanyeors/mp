process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_REGISTRY } from "../registry";
import { ORDER_EMAIL_TEMPLATES } from "../templates";
import { RMA_EMAIL_TEMPLATES } from "../rma";

const EMAIL_DIR = join(process.cwd(), "lib", "email");

const EXEMPT = new Set<string>([
  "renderEmail",
  "renderEmailShell",
  "renderOrderEmail",
  "renderRmaEmail",
]);

describe("registry coverage", () => {
  it("covers every order template key", () => {
    const ids = new Set(EMAIL_REGISTRY.map((c) => c.id));
    for (const key of Object.keys(ORDER_EMAIL_TEMPLATES)) {
      expect(ids.has(`order.${key}`), `order.${key} is not registered`).toBe(true);
    }
  });

  it("covers every RMA template key", () => {
    const ids = new Set(EMAIL_REGISTRY.map((c) => c.id));
    for (const key of Object.keys(RMA_EMAIL_TEMPLATES)) {
      expect(ids.has(`rma.${key}`), `rma.${key} is not registered`).toBe(true);
    }
  });

  it("covers every exported render*Email function in lib/email", () => {
    const exported: string[] = [];
    for (const file of readdirSync(EMAIL_DIR).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(EMAIL_DIR, file), "utf8");
      for (const m of src.matchAll(/export function (render\w*Email)\b/g)) {
        exported.push(m[1]);
      }
    }
    expect(exported.length).toBeGreaterThan(5);

    const registrySrc = readFileSync(join(EMAIL_DIR, "registry.ts"), "utf8");
    const missing = exported
      .filter((name) => !EXEMPT.has(name))
      .filter((name) => !registrySrc.includes(name));

    expect(missing, `unregistered renderers: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every entry a unique, slug-shaped id", () => {
    for (const entry of EMAIL_REGISTRY) {
      expect(entry.id).toMatch(/^[a-z]+\.[a-z0-9_]+$/);
      expect(entry.label.trim()).not.toBe("");
    }
  });
});
