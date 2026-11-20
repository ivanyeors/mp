// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settle, until } from "@/components/block-editor/__tests__/dom";

/**
 * The booking form's location picker lists the bookable Locations the server
 * read (`selectBookableLocations`, as `GET /api/locations` answers), and the
 * picker opens with them on the first open, with no request of its own.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/appointments",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { BookingFlow } = await import("@/components/slide-in-pages/booking-flow");

const LOCATIONS = [
  { id: "loc-1", name: "Mpillow Studio Tanjong Pagar", type: "own", address: "1 Example Road" },
  { id: "loc-2", name: "Partner Clinic Bishan", type: "partner", address: "2 Sample Street" },
];

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Answers as the route does; slots are not under test.
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).startsWith("/api/locations") ? { ok: true, locations: LOCATIONS } : { ok: true, slots: [] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

/** Opens the picker as a keyboard user does; resolves once its menu is open, with its items. */
async function openPicker() {
  const trigger = document.getElementById("booking-location")!;
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await until(() => document.querySelector('[role="menu"]'), 20);
  return document.querySelectorAll('[role="menuitem"]');
}

describe("BookingFlow location picker", () => {
  it("lists the bookable locations with their addresses", async () => {
    await act(async () => root.render(<BookingFlow type="customisation" locations={LOCATIONS} />));
    await settle(20);
    const options = [...(await openPicker())].map((o) => o.textContent);
    expect(options).toEqual(["Mpillow Studio Tanjong Pagar1 Example Road", "Partner Clinic Bishan2 Sample Street"]);
  });

  it("asks the server for nothing on mount: the page hands the locations in", async () => {
    await act(async () => root.render(<BookingFlow type="customisation" locations={LOCATIONS} />));
    await settle(20);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/locations"))).toEqual([]);
  });

  it("lists nothing when there are no bookable locations", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ ok: true, locations: [], slots: [] }) }));
    await act(async () => root.render(<BookingFlow type="customisation" locations={[]} />));
    await settle(20);
    expect((await openPicker()).length).toBe(0);
  });
});
