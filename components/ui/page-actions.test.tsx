import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
import {
  PageActions,
  pageActionClassName,
  pageActionDockedClassName,
  pageActionWideClassName,
} from "./page-actions";

describe("PageActions", () => {
  const html = renderToStaticMarkup(<PageActions>child</PageActions>);

  it("is a two-column grid on mobile and the old inline row from md up", () => {
    expect(html).toMatch(/grid-cols-2/);
    expect(html).toMatch(/md:flex/);
    expect(html).toMatch(/md:flex-wrap/);
    expect(html).toMatch(/child/);
  });

  // Phones show these in the bottom dock instead, so the cluster hides — in
  // CSS, so the server render is right before `useIsMobile` has an answer.
  it("hides on mobile when the whole cluster is docked, and only then", () => {
    const docked = renderToStaticMarkup(<PageActions docked>child</PageActions>);
    expect(docked).toMatch(/max-md:hidden/);
    expect(docked).toMatch(/md:flex/);
    expect(html).not.toMatch(/max-md:hidden/);
  });

  it("hides a single docked tile without hiding its neighbours", () => {
    expect(pageActionDockedClassName).toBe("max-md:hidden");
    expect(pageActionClassName).not.toContain("hidden");
  });

  it("keeps a caller's classes", () => {
    expect(renderToStaticMarkup(<PageActions className="mt-2">child</PageActions>))
      .toMatch(/mt-2/);
  });
});

describe("pageActionClassName", () => {
  // The tiles are the reason for the redesign: the Admin Panel mobile menu's
  // 56px targets, not the 44px Button baseline that made five stacked rows.
  it("lifts the mobile tile past the Button touch baseline", () => {
    const merged = cn(buttonVariants({ variant: "secondary" }), pageActionClassName);
    expect(merged).toMatch(/max-md:min-h-14/);
    expect(merged).not.toMatch(/max-md:min-h-11/);
    expect(merged).toMatch(/max-md:w-full/);
  });

  it("leaves desktop density alone — every override is mobile-scoped", () => {
    for (const token of pageActionWideClassName.split(" ")) {
      expect(token.startsWith("max-md:")).toBe(true);
    }
    const merged = cn(buttonVariants({ variant: "secondary" }), pageActionClassName);
    expect(merged).toMatch(/\bh-9\b/);
  });

  it("wraps a two-line label instead of clipping it", () => {
    expect(pageActionClassName).toMatch(/max-md:h-auto/);
    expect(pageActionClassName).toMatch(/max-md:whitespace-normal/);
  });

  it("spans both columns only on mobile, where the columns exist", () => {
    expect(pageActionWideClassName).toMatch(/max-md:col-span-2/);
    expect(pageActionWideClassName).toContain("max-md:min-h-14");
  });
});
