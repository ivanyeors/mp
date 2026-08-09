/**
 * The email footer mirrors the site footer. Drift between the two is exactly how
 * the email chrome went stale before, so it is asserted rather than trusted.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER_LINKS, SOCIAL_LINKS, BRAND } from "../theme";

const marketingFooter = readFileSync(
  join(process.cwd(), "components", "ui", "marketing-footer.tsx"),
  "utf8",
);

describe("email footer mirrors the site footer", () => {
  it.each(FOOTER_LINKS.map((l) => [l.label, l.href] as const))(
    "site footer still links %s",
    (_label, href) => {
      expect(marketingFooter).toContain(`"${href}"`);
    },
  );

  it.each(SOCIAL_LINKS.map((l) => [l.label, l.href] as const))(
    "site footer still links %s",
    (_label, href) => {
      expect(marketingFooter).toContain(href);
    },
  );

  it("uses logo assets that exist in public/", () => {
    const publicDir = join(process.cwd(), "public");
    for (const path of [BRAND.logoPath, BRAND.logoInvertedPath]) {
      expect(() => readFileSync(join(publicDir, path))).not.toThrow();
    }
  });
});
