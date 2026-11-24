// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settle, until } from "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/appointments",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { BookingFlow } = await import("@/components/slide-in-pages/booking-flow");

let host: HTMLDivElement;
let root: Root;
let openDays: Record<string, string[] | "down">;
const fetchMock = vi.fn(async (url: string) => {
  const month = /month=(\d{4}-\d{2})/.exec(url)?.[1] ?? "";
  const days = openDays[month] ?? [];
  if (days === "down") return { ok: false, json: async () => ({ error: "Google down" }) };
  return { ok: true, json: async () => ({ ok: true, days: days.map((date) => ({ date, count: 3 })) }) };
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T04:00:00Z"));
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openCalendar() {
  await act(async () => root.render(<BookingFlow type="customisation" locations={[]} />));
  await act(async () => document.getElementById("booking-date")!.click());
  await settle(20);
  await until(() => document.querySelector('[role="grid"]'), 20);
}

function greyed(ymd: string): boolean {
  const cell = document.querySelector(`td[data-day="${ymd}"]`);
  if (!cell) throw new Error(`${ymd} is not on the calendar`);
  return cell.getAttribute("data-disabled") === "true";
}

describe("BookingFlow date picker", () => {
  it("greys out the days with no open time, so the first open one is the earliest bookable day", async () => {
    openDays = { "2026-11": ["2026-11-26", "2026-11-28"] };
    await openCalendar();
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/slots?month=2026-11");
    expect(greyed("2026-11-23")).toBe(true);
    expect(greyed("2026-11-24")).toBe(true);
    expect(greyed("2026-11-25")).toBe(true);
    expect(greyed("2026-11-26")).toBe(false);
    expect(greyed("2026-11-27")).toBe(true);
    expect(greyed("2026-11-28")).toBe(false);
  });

  it("leaves every future day pickable when the calendar can't be read", async () => {
    openDays = { "2026-11": "down" };
    await openCalendar();
    expect(greyed("2026-11-23")).toBe(true);
    expect(greyed("2026-11-25")).toBe(false);
    expect(greyed("2026-11-27")).toBe(false);
  });

  it("opens on next month when nothing is left this month", async () => {
    openDays = { "2026-11": [], "2026-12": ["2026-12-03"] };
    await openCalendar();
    await settle(20);
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/slots?month=2026-12");
    expect(document.querySelector('td[data-day="2026-11-15"]')).toBeNull();
    expect(greyed("2026-12-02")).toBe(true);
    expect(greyed("2026-12-03")).toBe(false);
  });
});
