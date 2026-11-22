// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/components/block-editor/__tests__/dom";

const nav = vi.hoisted(() => ({ query: "token=tok-a" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "r1", lang: "en-US" }),
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => "/en-US/results/r1",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));
vi.mock("@/components/auth/login-form", () => ({ LoginForm: () => null }));

const { default: ResultStatusPage } = await import("../[id]/page");

type Held = { url: string; answer: (body: unknown, ok?: boolean) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  nav.query = "token=tok-a";
  held = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            answer: (body, ok = true) =>
              act(async () => {
                resolve({ ok, status: ok ? 200 : 404, json: async () => body });
              }),
          });
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const render = () => act(async () => root!.render(<ResultStatusPage />));
const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render();
};
const openWith = async (query: string) => {
  nav.query = query;
  await render();
};
const read = (token: string) => held.find((h) => h.url === `/api/results/r1?token=${token}`)!;
const result = (status: string) => ({ result: { id: "r1", status, product_type: "pillow", payment_intent_id: "pi_1" } });
const title = () => host.querySelector("h1")?.textContent;

describe("Result status page: loading the Result", () => {
  it("shows the Result it loaded", async () => {
    await mount();
    await read("tok-a").answer(result("assigned"));
    expect(title()).toBe("Ready for your decision");
    expect(host.textContent).not.toContain("Loading…");
  });

  it("shows the newer link's Result when the older link's answer lands last", async () => {
    await mount();
    await openWith("token=tok-b");
    await read("tok-b").answer(result("declined"));
    await read("tok-a").answer(result("assigned"));

    expect(title()).toBe("Declined");
  });

  it("clears an earlier load's error once the next load answers", async () => {
    await mount();
    await read("tok-a").answer({ error: "Result not found" }, false);
    expect(host.textContent).toContain("Result not found");

    await openWith("token=tok-b");
    await read("tok-b").answer(result("assigned"));

    expect(host.textContent).not.toContain("Result not found");
    expect(title()).toBe("Ready for your decision");
  });
});
