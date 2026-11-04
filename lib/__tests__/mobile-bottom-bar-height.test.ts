import { afterEach, describe, expect, it } from "vitest";

import { MOBILE_BOTTOM_BAR_HEIGHT_VAR, publishMobileBottomBarHeight } from "../mobile-bottom-bar-height";

type Observer = { cb: () => void; disconnected: boolean };

describe("publishMobileBottomBarHeight", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, ResizeObserver: g.ResizeObserver };
  afterEach(() => {
    g.document = saved.document;
    g.ResizeObserver = saved.ResizeObserver;
  });

  function setup() {
    const props = new Map<string, string>();
    g.document = {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => void props.set(k, v),
          removeProperty: (k: string) => void props.delete(k),
        },
      },
    };
    const observers: Observer[] = [];
    g.ResizeObserver = class {
      o: Observer;
      constructor(cb: () => void) {
        this.o = { cb, disconnected: false };
        observers.push(this.o);
      }
      observe() {}
      disconnect() {
        this.o.disconnected = true;
      }
    };
    const bar = (height: number) => {
      const el = { height, getBoundingClientRect: () => ({ height: el.height }) };
      return el;
    };
    return { props, observers, bar };
  }

  it("publishes the bar's height and follows it, clearing it while the bar is hidden", () => {
    const { props, observers, bar } = setup();
    const el = bar(110.6);
    const stop = publishMobileBottomBarHeight(el as unknown as HTMLElement);
    expect(props.get(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe("111px");

    el.height = 0; // md:hidden on a wider screen
    observers[0].cb();
    expect(props.has(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe(false);

    el.height = 96;
    observers[0].cb();
    expect(props.get(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe("96px");

    stop();
    expect(observers[0].disconnected).toBe(true);
    expect(props.has(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe(false);
  });

  it("keeps the height while another bar is still mounted (route transition)", () => {
    const { props, bar } = setup();
    const stopOld = publishMobileBottomBarHeight(bar(80) as unknown as HTMLElement);
    const stopNew = publishMobileBottomBarHeight(bar(110) as unknown as HTMLElement);
    stopOld();
    expect(props.get(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe("110px");
    stopNew();
    expect(props.has(MOBILE_BOTTOM_BAR_HEIGHT_VAR)).toBe(false);
  });
});
