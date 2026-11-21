// @vitest-environment jsdom
import { click, settle } from "@/components/block-editor/__tests__/dom";
import { act, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The dock outlives navigation (it sits in the root layout), so a learn-more
 * sheet opened from its menu closes when the page changes: booking from a
 * sheet must not leave the drawer stacked over the next page.
 */

const nav = vi.hoisted(() => ({ pathname: "/en-US/shop" }));
/** Each render of a learn-more sheet: the page it rendered on and whether it was open. */
const sheetRenders = vi.hoisted(() => [] as { pathname: string; name: string; open: boolean }[]);

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));
// next/dynamic loads lazily; each stub is named from the module its loader imports.
vi.mock("next/dynamic", () => {
  const names: [RegExp, string][] = [
    [/bubble-menu/, "BubbleMenu"],
    [/basic-mpillow-learn-more/, "Basic"],
    [/premium-learn-more/, "Premium"],
    [/mbolster-learn-more/, "Mbolster"],
  ];
  return {
    default: (loader: () => unknown) => {
      const name = names.find(([re]) => re.test(String(loader)))?.[1] ?? "Other";
      if (name === "BubbleMenu") {
        const BubbleMenu = ({ items }: { items: { label: string; onClick?: () => void }[] }) => (
          <div>
            {items.map((i) => (
              <button key={i.label} type="button" data-menu-item onClick={i.onClick}>
                {i.label}
              </button>
            ))}
          </div>
        );
        return BubbleMenu;
      }
      const Sheet = ({ open }: { open?: boolean }) => {
        if (open !== undefined) sheetRenders.push({ pathname: nav.pathname, name, open });
        return <div data-sheet={name} data-open={String(Boolean(open))} />;
      };
      return Sheet as ComponentType;
    },
  };
});

const { AppDock } = await import("../app-dock");

let root: Root | null = null;
beforeEach(() => {
  nav.pathname = "/en-US/shop";
  sheetRenders.length = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({}) })));
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<AppDock />));
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const sheetOpen = (name: string) => document.querySelector(`[data-sheet="${name}"]`)?.getAttribute("data-open");
async function openFromMenu(label: string) {
  const item = [...document.querySelectorAll<HTMLButtonElement>("[data-menu-item]")].find((b) => b.textContent === label);
  await click(item!);
  await settle(50); // the dock opens a sheet on the next animation frame
}
async function navigate(pathname: string) {
  nav.pathname = pathname;
  await act(async () => root!.render(<AppDock />));
}

describe("AppDock learn-more sheets", () => {
  it("closes an open sheet when the page changes", async () => {
    await openFromMenu("Basic");
    expect(sheetOpen("Basic")).toBe("true");
    await navigate("/en-US/appointments");
    expect(sheetOpen("Basic")).toBe("false");
  });

  it("keeps a sheet open while the page stays the same", async () => {
    await openFromMenu("Premium");
    await navigate("/en-US/shop");
    expect(sheetOpen("Premium")).toBe("true");
  });

  it("never renders the new page with the sheet still open", async () => {
    await openFromMenu("Mbolster");
    await navigate("/en-US/appointments");
    expect(sheetRenders.filter((r) => r.pathname === "/en-US/appointments" && r.open)).toEqual([]);
  });
});
