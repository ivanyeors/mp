import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers/c1",
}));

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

const { JourneyComposer } = await import("../[id]/journey-composer");
const { CustomerShortcutsProvider } = await import("../[id]/customer-shortcuts");

const composer = (mode: "email" | "whatsapp", phone: string | null = "81234567") =>
  renderToString(
    <CustomerShortcutsProvider customerId="c1" email="mei@example.test" phone={phone} canLog onLogged={() => {}}>
      <JourneyComposer
        customerId="c1"
        mode={mode}
        onModeChange={() => {}}
        focusSignal={0}
        followUps={null}
        onNoteAdded={() => {}}
        onFollowUpAdded={() => {}}
      />
    </CustomerShortcutsProvider>,
  ).replace(/<!-- -->/g, "");

describe("the composer's message modes", () => {
  it("offers Generate suggestion, the four subjects, and a blank message to open", () => {
    const html = composer("email");
    expect(html).toContain("Generate suggestion");
    expect(html).toContain("Nothing is drafted until you press Generate suggestion.");
    for (const subject of ["Check in", "About their review", "After a re-adjustment", "Invite to a re-adjustment"]) {
      expect(html, subject).toContain(subject);
    }
    expect(html).toContain('aria-label="Subject"');
    expect(html).toContain("Open in Gmail");
    expect(html).not.toContain("Generate again");
    expect(html).not.toContain("Drafted by Claude");
  });

  it("calls nothing by being opened", () => {
    composer("email");
    composer("whatsapp");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("has no subject line on WhatsApp, and no WhatsApp mode without a valid mobile", () => {
    const html = composer("whatsapp");
    expect(html).not.toContain('aria-label="Subject"');
    expect(html).toContain("Open WhatsApp");
    expect(composer("email", null)).not.toContain(">WhatsApp<");
    expect(composer("email", "12")).not.toContain(">WhatsApp<");
  });
});
