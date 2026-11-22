// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/customers/c1",
}));

const { JourneyComposer } = await import("../[id]/journey-composer");
type ComposerMode = import("../[id]/journey-composer").ComposerMode;
const { CustomerShortcutsProvider } = await import("../[id]/customer-shortcuts");

const JESS = { id: "p-jess", name: "Jess" };

function Page() {
  const [mode, setMode] = useState<ComposerMode>("note");
  const [focus, setFocus] = useState(0);
  const compose = (next: ComposerMode) => {
    setMode(next);
    setFocus((n) => n + 1);
  };
  return (
    <CustomerShortcutsProvider customerId="c1" email="mei@example.test" phone={null} canLog onLogged={() => {}}>
      <button type="button" onClick={() => compose("note")}>
        Header note
      </button>
      <button type="button" onClick={() => compose("followup")}>
        Header follow-up
      </button>
      <JourneyComposer
        customerId="c1"
        mode={mode}
        onModeChange={setMode}
        focusSignal={focus}
        followUps={{ rows: [], today: "2026-10-21", me: JESS, assignees: [JESS] }}
        onNoteAdded={() => {}}
        onFollowUpAdded={() => {}}
      />
    </CustomerShortcutsProvider>
  );
}

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Page />));
};
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const tab = (label: string) =>
  [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.trim() === label)!;
const press = async (el: HTMLElement) => {
  el.focus();
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const focused = () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim();

describe("the composer's focus", () => {
  it("moves to the field a header button opens", async () => {
    await mount();
    await press(button("Header note"));
    expect(focused()).toBe("New note");
    await press(button("Header follow-up"));
    expect(focused()).toBe("New follow-up");
  });

  it("stays on a composer tab clicked after a header button was used", async () => {
    await mount();
    await press(button("Header note"));
    expect(focused()).toBe("New note");

    await press(tab("Follow-up"));
    expect(focused()).toBe("Follow-up");
    await press(tab("Note"));
    expect(focused()).toBe("Note");
  });

  it("does not move focus on a tab click before any header button", async () => {
    await mount();
    await press(tab("Follow-up"));
    expect(focused()).toBe("Follow-up");
  });
});
