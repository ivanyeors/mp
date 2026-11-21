// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPOINTMENT_SETTINGS } from "@/lib/appointments/settings";
import type { ResolvedLocation } from "@/lib/locations";

vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/settings/appointments" }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: AppointmentSettingsPage } = await import("../appointments-client");

const location = { id: "loc1", name: "Sin Ming studio", address: "22 Sin Ming Lane", bookable: true } as ResolvedLocation;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      String(url).endsWith("/locations") ? { locations: [location] } : { ok: true, settings: DEFAULT_APPOINTMENT_SETTINGS },
  }));
  vi.stubGlobal("fetch", fetchMock);
});

let root: Root | null = null;
const mount = async (node: React.ReactNode) => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle();
};
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const urls = () => fetchMock.mock.calls.map((c) => String(c[0])).sort();

describe("Appointments page mount", () => {
  it("fetches nothing on mount in Strict Mode when the server sent the settings and locations", async () => {
    await mount(
      <StrictMode>
        <AppointmentSettingsPage initialData={DEFAULT_APPOINTMENT_SETTINGS} initialLocations={[location]} />
      </StrictMode>,
    );
    expect(urls()).toEqual([]);
    expect(document.body.textContent).toContain("Appointments");
  });

  it("fetches the settings and the locations when the server could not read them", async () => {
    await mount(<AppointmentSettingsPage />);
    expect(urls()).toEqual(["/api/settings/appointments", "/api/settings/appointments/locations"]);
    expect(document.body.textContent).not.toContain("Loading appointment calendar");
  });

  it("fetches only what the server could not read", async () => {
    await mount(<AppointmentSettingsPage initialData={DEFAULT_APPOINTMENT_SETTINGS} />);
    expect(urls()).toEqual(["/api/settings/appointments/locations"]);
  });
});
