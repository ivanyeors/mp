// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../actions", () => ({ previewStarters: vi.fn(async () => ({ ok: true, previews: {} })) }));

const { ThumbnailFrame } = await import("../thumbnail-frame");
const { EmailPreview } = await import("../email-preview");

type Watcher = { box: Element | null; report: (width: number) => void; disconnected: boolean };
let watchers: Watcher[];

class FakeResizeObserver {
  private watcher: Watcher;
  constructor(callback: ResizeObserverCallback) {
    this.watcher = {
      box: null,
      disconnected: false,
      report: (width) =>
        act(() => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)),
    };
    watchers.push(this.watcher);
  }
  observe(el: Element) {
    this.watcher.box = el;
  }
  unobserve() {}
  disconnect() {
    this.watcher.disconnected = true;
  }
}

let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => {
  watchers = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const measuredAt = (width: number) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);

const frame = () => host.querySelector("iframe")!;
const watching = (selector: string) => watchers.filter((w) => w.box === host.querySelector(selector) && !w.disconnected);

describe("ThumbnailFrame", () => {
  it("draws at a quarter size until the card is measured, then scales the email to the card", () => {
    act(() => root!.render(<ThumbnailFrame id="welcome" html="<p>Hello</p>" />));
    expect(frame().style.transform).toBe("scale(0.25)");

    const [card] = watching("[data-thumbnail]");
    card.report(320);
    expect(frame().style.transform).toBe("scale(0.5)");
    card.report(160);
    expect(frame().style.transform).toBe("scale(0.25)");
  });

  it("scales the email to the card from the first frame, before the observer reports", () => {
    measuredAt(320);
    act(() => root!.render(<ThumbnailFrame id="welcome" html="<p>Hello</p>" />));
    expect(frame().style.transform).toBe("scale(0.5)");
  });

  it("stops watching the card once it is gone", () => {
    act(() => root!.render(<ThumbnailFrame id="welcome" html="<p>Hello</p>" />));
    expect(watching("[data-thumbnail]")).toHaveLength(1);
    act(() => root!.unmount());
    root = null;
    expect(watchers.every((w) => w.disconnected)).toBe(true);
  });
});

describe("EmailPreview", () => {
  const preview = (device: "desktop" | "mobile") => (
    <EmailPreview
      html="<p>Hello</p>"
      subject="Hi"
      from={null}
      error={null}
      device={device}
      onDevice={() => {}}
      scheme="light"
      onScheme={() => {}}
      selected={null}
      onSelectBlock={() => {}}
    />
  );
  const box = () => frame().parentElement!;
  const boxWatcher = () => watchers.find((w) => w.box === box() && !w.disconnected)!;

  it("shows the desktop email at full size until the box is measured", () => {
    act(() => root!.render(preview("desktop")));
    expect(frame().style.transform).toBe("scale(1)");
    expect(frame().style.width).toBe("640px");
  });

  it("scales the email to the box from the first frame, before the observer reports", () => {
    measuredAt(320);
    act(() => root!.render(preview("desktop")));
    expect(frame().style.transform).toBe("scale(0.5)");
    expect(frame().style.height).toBe("1360px");
  });

  it("shrinks the email to fit the box and centres a phone-width email in a wide box", () => {
    act(() => root!.render(preview("desktop")));
    boxWatcher().report(320);
    expect(frame().style.transform).toBe("scale(0.5)");
    expect(frame().style.height).toBe("1360px");

    act(() => root!.render(preview("mobile")));
    expect(frame().style.transform).toBe("scale(0.853333)");
    boxWatcher().report(575);
    expect(frame().style.transform).toBe("scale(1)");
    expect(frame().style.marginLeft).toBe("100px");
  });

  it("falls back to the desktop width when the box measures zero", () => {
    act(() => root!.render(preview("desktop")));
    boxWatcher().report(320);
    boxWatcher().report(0);
    expect(frame().style.transform).toBe("scale(1)");
  });

  it("stops watching the box once it is gone", () => {
    act(() => root!.render(preview("desktop")));
    expect(boxWatcher()).toBeDefined();
    act(() => root!.unmount());
    root = null;
    expect(watchers.every((w) => w.disconnected)).toBe(true);
  });
});
