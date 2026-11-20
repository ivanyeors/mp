// `preview map` is only worth having if it is complete and finds pages by the
// names people use. These run against the app as it is on disk.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildMap, filterMap, FIXTURE_PATHS, format, navEntries, NAV_SOURCES, repo } from "./lib/map.mjs";

type Page = Awaited<ReturnType<typeof buildMap>>[number];
const pages: Page[] = await buildMap();
const routes = (words: string[]) => filterMap(pages, words).map((p: Page) => p.route);

describe("preview map", () => {
  it("lists every app/**/page.tsx exactly once", () => {
    // Listed independently of the map's own walk, so a walk that skips a
    // route group or a nested folder fails here.
    const onDisk = (readdirSync(join(repo, "app"), { recursive: true }) as string[])
      .filter((f) => f === "page.tsx" || f.endsWith("/page.tsx"))
      .map((f) => join("app", f))
      .sort();
    expect(onDisk.length).toBeGreaterThan(90);
    expect(pages.map((p) => p.file).sort()).toEqual(onDisk);
    expect(new Set(pages.map((p) => p.route)).size).toBe(pages.length);
  });

  it("drops the locale segment and route groups from the route", () => {
    const shop = pages.find((p) => p.file === "app/[lang]/shop/(index)/page.tsx");
    expect(shop?.route).toBe("/shop");
    expect(pages.find((p) => p.file === "app/[lang]/page.tsx")?.route).toBe("/");
  });

  it("finds the Admin Panel pages by their sidebar names", () => {
    expect(routes(["orders"])).toContain("/settings/orders");
    expect(routes(["orders"])).toContain("/account/orders");
    expect(routes(["inventory"])).toContain("/settings/inventory");
    expect(routes(["costings"])).toContain("/settings/costings");
    // By label alone, not the route: "Service fees" is /settings/costings/services.
    expect(routes(["service", "fees"])).toEqual(["/settings/costings/services"]);
    expect(routes(["returns", "rma"])).toContain("/settings/rma");
    // Words match at word starts: "id" is the [id] segment, not "sidebar".
    expect(routes(["orders", "id"])).toEqual(["/settings/orders/[id]"]);
    const orders = pages.find((p) => p.route === "/settings/orders");
    expect(orders?.name).toBe("Orders");
    expect(orders?.place).toBe("Admin sidebar › CRM");
  });

  it("finds a storefront page by the name in the footer", () => {
    expect(routes(["returns", "warranty"])).toEqual(["/shipping-refund-policies"]);
    expect(pages.find((p) => p.route === "/faq")?.name).toBe("FAQ");
  });

  it("names a page with no nav label by its title, else its route", () => {
    expect(pages.find((p) => p.route === "/mp-care")?.name).toBe("Mpillow Care");
    const unnamed = pages.find((p) => p.route === "/settings/customers/import");
    expect(unnamed?.name).toBe("/settings/customers/import");
    expect(unnamed?.place).toBe("no label");
  });

  it("every nav source still yields names", () => {
    for (const [file] of NAV_SOURCES) {
      expect(navEntries(readFileSync(join(repo, file), "utf8")).length, file).toBeGreaterThan(1);
    }
  });

  it("gives every fixture-backed dynamic route a path from the sample data", () => {
    for (const route of Object.keys(FIXTURE_PATHS)) {
      const page = pages.find((p) => p.route === route);
      expect(page, `${route} is no longer a page`).toBeDefined();
      expect(page?.example, route).toMatch(new RegExp(`^${route.replace(/\[[^\]]+\]/, "[^/\\[\\]]+")}$`));
    }
    // The first sample order has no shipping address, which crashes the order
    // page; MP2001's address has no recipient, which leaves it on a spinner.
    const order = pages.find((p) => p.route === "/settings/orders/[id]")?.example;
    expect(order).toMatch(/^\/settings\/orders\/./);
    expect(order).not.toBe("/settings/orders/ord_0001");
    expect(order).not.toBe("/settings/orders/0f0f0f0f-0000-4000-8000-000000002001");
    // A page only the customer who owns the record may open gets no path: the Owner would be refused.
    expect(pages.find((p) => p.route === "/results/[id]")?.example).toBeUndefined();
  });

  it("does not offer a static sibling as a dynamic route's path", () => {
    // /settings/campaigns/funnel is its own page, not campaign "funnel".
    const campaign = pages.find((p) => p.route === "/settings/campaigns/[id]");
    expect(campaign?.example).toBeUndefined();
    expect(format([campaign!])).toContain("'/settings/campaigns/<id>'");
  });

  it("lists plainly stated tabs with the click that opens each, and skips partial lists", () => {
    expect(pages.find((p) => p.route === "/settings/users")?.tabs).toEqual(["Members", "Staff profiles", "Roles", "Telegram"]);
    expect(format(filterMap(pages, ["users", "permissions"]))).toContain(
      ".claude/skills/preview/preview shoot /settings/users --click 'Staff profiles'",
    );
    // Its Addresses and Boxes tabs carry a count, so no list rather than half of one.
    expect(pages.find((p) => p.route === "/settings/shipping/couriers")?.tabs).toEqual([]);
  });
});
