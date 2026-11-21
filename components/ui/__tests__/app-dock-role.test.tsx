// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  listeners: new Set<(event: string) => void>(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/shop" }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user } }),
      onAuthStateChange: (callback: (event: string) => void) => {
        auth.listeners.add(callback);
        void Promise.resolve().then(() => {
          if (auth.listeners.has(callback)) callback("INITIAL_SESSION");
        });
        return { data: { subscription: { unsubscribe: () => auth.listeners.delete(callback) } } };
      },
    },
  }),
}));
vi.mock("next/dynamic", () => ({
  default: (loader: () => unknown) => {
    if (!/bubble-menu/.test(String(loader))) return () => null;
    return function BubbleMenu({ items }: { items: { label: string }[] }) {
      return (
        <ul>
          {items.map((i) => (
            <li key={i.label} data-menu-item>
              {i.label}
            </li>
          ))}
        </ul>
      );
    };
  },
}));

const { AppDock } = await import("../app-dock");

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
let root: Root | null = null;
beforeEach(() => {
  held = [];
  auth.user = null;
  auth.listeners.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            answer: (body) =>
              act(async () => {
                resolve({ json: async () => body });
              }),
          });
        }),
    ),
  );
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function mountDock() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<AppDock />));
  await settle();
}

const authPill = () =>
  [...document.querySelectorAll("[data-menu-item]")].map((li) => li.textContent).at(-1);
const answer = async (requests: Held[], staff: boolean) => {
  for (const r of requests) {
    await r.answer(r.url.includes("/api/admin/") ? { signedIn: staff } : { isPartner: false });
  }
};

describe("AppDock's sign-in pill", () => {
  it("shows Admin Panel to signed-in Staff", async () => {
    auth.user = { id: "u1" };
    await mountDock();
    await answer([...held], true);

    expect(authPill()).toBe("Admin Panel");
  });

  it("asks for the admin and partner context once on mount", async () => {
    await mountDock();

    expect(held.map((h) => h.url).sort()).toEqual(["/api/admin/context", "/api/partner/context"]);
  });

  it("shows Sign in after signing out, though the signed-in check answers last", async () => {
    auth.user = { id: "u1" };
    await mountDock();
    const signedIn = [...held];

    auth.user = null;
    await act(async () => auth.listeners.forEach((l) => l("SIGNED_OUT")));
    await settle();
    const signedOut = held.filter((h) => !signedIn.includes(h));

    await answer(signedOut, false);
    await answer(signedIn, true);

    expect(authPill()).toBe("Sign in");
  });
});
