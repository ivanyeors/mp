import { afterEach, describe, expect, it } from "vitest";

import {
  SCREEN_PIN_OFFSET_VAR,
  opensKeyboard,
  pinToScreenBottom,
  screenBottomPinClassName,
  screenPinOffset,
} from "../use-screen-bottom-pin";

describe("screenPinOffset", () => {
  it("is 0 with no visual viewport, or one sitting on the layout viewport", () => {
    expect(screenPinOffset(null)).toBe(0);
    expect(screenPinOffset(undefined)).toBe(0);
    expect(screenPinOffset({ offsetTop: 0, scale: 1 })).toBe(0);
  });

  it("moves the bar down by the stuck offset (iOS after the keyboard), rounded", () => {
    expect(screenPinOffset({ offsetTop: 345.4, scale: 1 })).toBe(345);
  });

  it("never moves the bar up (rubber-band overscroll)", () => {
    expect(screenPinOffset({ offsetTop: -12, scale: 1 })).toBe(0);
  });

  it("leaves a pinch-zoomed page alone", () => {
    expect(screenPinOffset({ offsetTop: 200, scale: 1.5 })).toBe(0);
  });
});

describe("screenBottomPinClassName", () => {
  it("is bottom: 0 less the published offset", () => {
    expect(screenBottomPinClassName).toContain(SCREEN_PIN_OFFSET_VAR);
    expect(screenBottomPinClassName.startsWith("bottom-[")).toBe(true);
  });
});

describe("opensKeyboard", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}, editable = false) =>
    ({
      tagName,
      isContentEditable: editable,
      getAttribute: (name: string) => attrs[name] ?? null,
    }) as unknown as Element;

  it("is true for fields that type or pick", () => {
    expect(opensKeyboard(el("INPUT"))).toBe(true);
    expect(opensKeyboard(el("INPUT", { type: "email" }))).toBe(true);
    expect(opensKeyboard(el("INPUT", { type: "TEL" }))).toBe(true);
    expect(opensKeyboard(el("TEXTAREA"))).toBe(true);
    expect(opensKeyboard(el("SELECT"))).toBe(true);
    expect(opensKeyboard(el("DIV", {}, true))).toBe(true);
  });

  it("is false for nothing focused, buttons and toggles", () => {
    expect(opensKeyboard(null)).toBe(false);
    expect(opensKeyboard(el("BODY"))).toBe(false);
    expect(opensKeyboard(el("BUTTON"))).toBe(false);
    expect(opensKeyboard(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(opensKeyboard(el("INPUT", { type: "radio" }))).toBe(false);
    expect(opensKeyboard(el("INPUT", { type: "submit" }))).toBe(false);
  });
});

describe("pinToScreenBottom", () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  function setup() {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 0, scale: 1 });
    const win = Object.assign(new EventTarget(), { visualViewport: viewport });
    (globalThis as { window?: unknown }).window = win;
    const props = new Map<string, string>();
    const el = {
      style: {
        setProperty: (k: string, v: string) => void props.set(k, v),
        removeProperty: (k: string) => void props.delete(k),
      },
    } as unknown as HTMLElement;
    return { viewport, win, props, el };
  }

  it("publishes the offset as it changes and clears it at 0", () => {
    const { viewport, win, props, el } = setup();
    const unpin = pinToScreenBottom(el);
    expect(props.has(SCREEN_PIN_OFFSET_VAR)).toBe(false);

    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event("scroll"));
    expect(props.get(SCREEN_PIN_OFFSET_VAR)).toBe("120px");

    viewport.offsetTop = 345;
    win.dispatchEvent(new Event("scroll"));
    expect(props.get(SCREEN_PIN_OFFSET_VAR)).toBe("345px");

    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    expect(props.has(SCREEN_PIN_OFFSET_VAR)).toBe(false);
    unpin();
  });

  it("stops listening and clears the offset when unpinned", () => {
    const { viewport, props, el } = setup();
    viewport.offsetTop = 200;
    const unpin = pinToScreenBottom(el);
    expect(props.get(SCREEN_PIN_OFFSET_VAR)).toBe("200px");
    unpin();
    expect(props.has(SCREEN_PIN_OFFSET_VAR)).toBe(false);
    viewport.offsetTop = 300;
    viewport.dispatchEvent(new Event("scroll"));
    expect(props.has(SCREEN_PIN_OFFSET_VAR)).toBe(false);
  });

  it("does nothing without a visual viewport", () => {
    (globalThis as { window?: unknown }).window = new EventTarget();
    const props = new Map<string, string>();
    const el = { style: { setProperty: () => {}, removeProperty: () => {} } } as unknown as HTMLElement;
    expect(() => pinToScreenBottom(el)()).not.toThrow();
    expect(props.size).toBe(0);
  });
});
