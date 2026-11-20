// @vitest-environment jsdom
import { click, settle } from "./dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AiButton } from "../ai-button";

let root: Root | null = null;
function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
});
const buttons = () => [...document.querySelectorAll("button")];

describe("AiButton", () => {
  it("does its job when pressed, idle", async () => {
    const onClick = vi.fn();
    mount(<AiButton onClick={onClick}>Generate</AiButton>);
    expect(buttons()[0].textContent).toBe("Generate");
    await click(buttons()[0]);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("says what it is doing while it works, can't be pressed again, and offers Stop", async () => {
    const onClick = vi.fn();
    const onStop = vi.fn();
    mount(
      <AiButton onClick={onClick} working="Writing the email…" onStop={onStop}>
        Generate
      </AiButton>,
    );
    const [busy, stop] = buttons();
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.getAttribute("aria-disabled")).toBe("true");
    expect(busy.querySelector('[role="status"]')?.textContent).toBe("Writing the email…");
    await click(busy);
    expect(onClick).not.toHaveBeenCalled();
    await click(stop);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("opens a popover under it as its trigger, and says so", async () => {
    mount(
      <Popover>
        <PopoverTrigger asChild>
          <AiButton>Generate</AiButton>
        </PopoverTrigger>
        <PopoverContent>What&apos;s it about?</PopoverContent>
      </Popover>,
    );
    const b = buttons()[0];
    expect(b.getAttribute("aria-expanded")).toBe("false");
    await click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("What's it about?");
  });

  it("stays in the tab order while off, with its reason, and does nothing when pressed", async () => {
    const onClick = vi.fn();
    mount(
      <AiButton onClick={onClick} disabledReason="Write a subject of at least 3 words first.">
        Generate
      </AiButton>,
    );
    const b = buttons()[0];
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-describedby")!)?.textContent).toBe("Write a subject of at least 3 words first.");
    await click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});
