// @vitest-environment jsdom
import { settle, typeField } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPOINTMENT_SETTINGS, type AppointmentSettings } from "@/lib/appointments/settings";

vi.mock("next/navigation", () => ({ usePathname: () => "/en-US/settings/appointments" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { AppointmentsSettingsSheet } = await import("../appointments-settings-sheet");

const saved: AppointmentSettings = { ...DEFAULT_APPOINTMENT_SETTINGS, venue: "Sin Ming studio" };

let root: Root | null = null;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => null })));
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const render = async (open: boolean, settings: AppointmentSettings) => {
  await act(async () =>
    root!.render(
      <AppointmentsSettingsSheet
        open={open}
        onOpenChange={() => {}}
        settings={settings}
        onSaved={() => {}}
        locations={[]}
        onToggleLocation={async () => {}}
      />,
    ),
  );
  await settle();
};

const venue = () => document.querySelector<HTMLInputElement>("#venue");

async function openBookingTab() {
  const trigger = [...document.querySelectorAll<HTMLElement>("[role='tab']")].find((t) => t.textContent === "Booking")!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  });
}

describe("Appointment settings draft", () => {
  it("keeps unsaved edits when the calendar's availability save lands while the sheet is open", async () => {
    await render(false, saved);
    await render(true, saved);
    await openBookingTab();
    typeField(venue()!, "Studio B");

    const afterCalendarSave = { ...saved, availability: saved.availability.map((d) => d.map((w) => ({ ...w }))) };
    await render(true, afterCalendarSave);

    expect(venue()!.value).toBe("Studio B");
  });

  it("starts each opening from the latest saved settings", async () => {
    await render(true, saved);
    await openBookingTab();
    typeField(venue()!, "Studio B");
    await render(false, saved);
    await render(false, { ...saved, venue: "Midview studio" });
    await render(true, { ...saved, venue: "Midview studio" });
    await openBookingTab();

    expect(venue()!.value).toBe("Midview studio");
  });
});
