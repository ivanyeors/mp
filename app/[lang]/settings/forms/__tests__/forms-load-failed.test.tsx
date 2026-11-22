// @vitest-environment jsdom
import { byLabel, click, settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DISCOVERY_SOURCE_READ_FAILED,
  OTHER_DISCOVERY_SOURCE_ID,
  serializeDiscoverySourceCatalog,
  type DiscoverySourceCatalog,
} from "@/lib/discovery-source";

const db = vi.hoisted(() => ({ down: false, value: "" }));
vi.mock("@/lib/supabase/server", () => {
  const answer = () =>
    db.down
      ? { data: null, error: { message: "connection reset" } }
      : { data: { key: "forms_discovery_source", value: db.value }, error: null };
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: async () => answer(),
  };
  return { supabaseAdmin: () => ({ from: () => query }) };
});
vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/auth/admin", () => ({ requireAdminPage: vi.fn(async () => ({})) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: FormsSettingsRoute } = await import("../page");
const { default: FormsSettingsPage } = await import("../forms-client");

const saved: DiscoverySourceCatalog = {
  options: [
    { id: "podcast", labels: { "en-US": "A podcast", "zh-CN": "播客" }, active: true },
    { id: OTHER_DISCOVERY_SOURCE_ID, labels: { "en-US": "Other", "zh-CN": "其他" }, active: true, system: true },
  ],
};

const server = { getUp: false, putUp: false };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.down = false;
  db.value = serializeDiscoverySourceCatalog(saved);
  server.getUp = false;
  server.putUp = false;
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const up = init?.method === "PUT" ? server.putUp : server.getUp;
    const body = init?.method === "PUT" ? JSON.parse(String(init.body)) : saved;
    return up
      ? { ok: true, status: 200, json: async () => ({ ok: true, catalog: body }) }
      : { ok: false, status: 500, json: async () => ({ error: DISCOVERY_SOURCE_READ_FAILED }) };
  });
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<StrictMode>{node}</StrictMode>));
  await settle();
};
const mountPage = async () => mount(await FormsSettingsRoute({ params: Promise.resolve({ lang: "en-US" }) }));
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const puts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
const button = (label: string) => byLabel(label) as HTMLButtonElement | null;
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? null;

async function tryEverySave() {
  for (const label of ["Save labels", "Add", "Move up", "Move down", "Archive", "Restore", "Delete"]) {
    const b = button(label);
    if (b) await click(b);
  }
  await settle();
}

describe("Forms page when the Discovery source options can't be read", () => {
  it("says so with Retry, shows no default options, and sends no save", async () => {
    db.down = true;
    await mountPage();

    await tryEverySave();
    expect(puts()).toEqual([]);
    expect(alertText()).toBe(DISCOVERY_SOURCE_READ_FAILED);
    expect(button("Retry")).not.toBeNull();
    expect(host.textContent).not.toContain("Instagram");
    expect(button("Save labels")?.disabled).toBe(true);
    expect(button("Add")?.disabled).toBe(true);
  });

  it("blocks every save after a failed save whose reload also fails", async () => {
    await mountPage();
    expect(host.textContent).toContain("A podcast");

    await click(button("Save labels")!);
    await settle();
    expect(puts()).toHaveLength(1);
    expect(alertText()).toBe(DISCOVERY_SOURCE_READ_FAILED);
    expect(button("Save labels")?.disabled).toBe(true);

    await tryEverySave();
    expect(puts()).toHaveLength(1);
  });

  it("shows the saved options once Retry reaches the server, and saves them", async () => {
    await mount(<FormsSettingsPage initialData={{ error: DISCOVERY_SOURCE_READ_FAILED }} />);
    server.getUp = true;
    server.putUp = true;
    await click(button("Retry")!);
    await settle();

    expect(alertText()).toBeNull();
    expect(host.textContent).toContain("A podcast");
    expect(button("Save labels")?.disabled).toBe(false);

    await click(button("Save labels")!);
    await settle();
    expect(puts()).toHaveLength(1);
    expect(JSON.parse(String(puts()[0]![1].body))).toEqual({ options: saved.options });
  });
});
