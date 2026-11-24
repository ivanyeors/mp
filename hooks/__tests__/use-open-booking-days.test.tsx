// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOpenBookingDays } from "../use-open-booking-days";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let api: ReturnType<typeof useOpenBookingDays>;
const fetchMock = vi.fn<(url: string) => Promise<Response>>();

function Probe({ expose }: { expose: (hook: ReturnType<typeof useOpenBookingDays>) => void }) {
  expose(useOpenBookingDays());
  return null;
}

function reply(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const nov = new Date(2026, 10, 1);
const day = (d: number) => new Date(2026, 10, d);

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  act(() => root.render(<Probe expose={(hook) => (api = hook)} />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("useOpenBookingDays", () => {
  it("marks every day of a loaded month without an open time, and only those", async () => {
    fetchMock.mockImplementation(() =>
      reply({ ok: true, days: [{ date: "2026-11-24", count: 9 }, { date: "2026-11-26", count: 2 }] }),
    );
    await act(() => api.load(nov));
    expect(fetchMock).toHaveBeenCalledWith("/api/appointments/slots?month=2026-11");
    expect(api.noOpenTime(day(24))).toBe(false);
    expect(api.noOpenTime(day(25))).toBe(true);
    expect(api.noOpenTime(day(26))).toBe(false);
    expect(api.noOpenTime(day(27))).toBe(true);
    expect(api.noOpenTime(new Date(2026, 11, 25))).toBe(false);
  });

  it("asks once per month", async () => {
    fetchMock.mockImplementation(() => reply({ ok: true, days: [] }));
    await act(() => api.load(nov));
    await act(() => api.load(day(20)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves every day open when the calendar can't be read, and asks again next time", async () => {
    fetchMock.mockImplementationOnce(() => reply({ error: "Google down" }, 502));
    await act(() => api.load(nov));
    expect(api.noOpenTime(day(25))).toBe(false);
    fetchMock.mockImplementationOnce(() => reply({ ok: true, days: [] }));
    await act(() => api.load(nov));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.noOpenTime(day(25))).toBe(true);
  });

  it("forgets what it knew, and ignores an answer that lands after forgetting", async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const pending = api.load(nov);
    act(() => api.forget());
    await act(async () => {
      answer(new Response(JSON.stringify({ ok: true, days: [] })));
      await pending;
    });
    expect(api.noOpenTime(day(25))).toBe(false);

    fetchMock.mockImplementationOnce(() => reply({ ok: true, days: [{ date: "2026-11-25", count: 1 }] }));
    await act(() => api.load(nov));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(api.noOpenTime(day(24))).toBe(true);
    expect(api.noOpenTime(day(25))).toBe(false);
  });
});
