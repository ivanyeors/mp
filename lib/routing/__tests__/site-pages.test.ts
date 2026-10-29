import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSitePage, NOT_FOR_CUSTOMERS, SITE_PAGES } from "../site-pages";

/**
 * The site's pages, as an email's links to our own site are checked
 * (PRD-campaign-email-editor slice 11): the list in code is the app's folders,
 * so a link checked against it is checked against what the site serves.
 */

const APP = path.join(process.cwd(), "app", "[lang]");

/** Every page under app/[lang], as its route: `shop/[slug]/page.tsx` is `/shop/[slug]`. */
function pagesOnDisk(dir = APP): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pagesOnDisk(p);
    if (e.name !== "page.tsx") return [];
    const route = path.relative(APP, path.dirname(p)).split(path.sep).filter((s) => s && !/^\(.*\)$/.test(s));
    return [`/${route.join("/")}`];
  });
}

describe("the site's pages", () => {
  const onDisk = pagesOnDisk();
  const forCustomers = onDisk.filter((r) => !NOT_FOR_CUSTOMERS.some((n) => r === n || r.startsWith(`${n}/`)));

  it("are every page under app/[lang] that is not the Admin Panel's", () => {
    expect([...SITE_PAGES].sort()).toEqual(forCustomers.sort());
  });

  it("match a path with or without its locale, a dynamic segment by any one segment", () => {
    for (const p of ["/", "/en-US", "/zh-CN/shop", "/shop/", "/en-US/shop/fibrecool-cover", "/blog/sleep-tips", "/faq", "/account/orders/MP1042"]) {
      expect(isSitePage(p), p).toBe(true);
    }
    for (const p of ["/nope", "/shop/a/b", "/en-US/settings/campaigns", "/settings", "/page-builder-preview", "/r/review", "/api/email/unsubscribe", "/favicon.ico"]) {
      expect(isSitePage(p), p).toBe(false);
    }
  });
});
