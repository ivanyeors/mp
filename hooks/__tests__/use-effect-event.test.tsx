// @vitest-environment jsdom
import { act, useEffect, useEffectEvent, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * What this repo relies on from React's `useEffectEvent` (stable since 19.2)
 * when it replaces a "latest value" ref (`ref.current = value` in an effect):
 * a listener set up once reads the props of the latest render, a layout
 * effect in the same commit already sees them, and it can never be called
 * while rendering.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useEffectEvent", () => {
  it("reads the latest props from a listener registered once, in a [] effect", () => {
    const seen: string[] = [];
    let subscriptions = 0;
    function Listener({ label }: { label: string }) {
      const onPing = useEffectEvent(() => seen.push(label));
      useEffect(() => {
        subscriptions++;
        const handler = () => onPing();
        window.addEventListener("ping", handler);
        return () => window.removeEventListener("ping", handler);
      }, []);
      return null;
    }
    act(() => root.render(<Listener label="first" />));
    window.dispatchEvent(new Event("ping"));
    act(() => root.render(<Listener label="second" />));
    window.dispatchEvent(new Event("ping"));
    expect(seen).toEqual(["first", "second"]);
    expect(subscriptions).toBe(1);
  });

  it("can be called from a useLayoutEffect, and sees that same commit's props there", () => {
    const seen: Array<[number, number]> = [];
    function Settle({ k, ease }: { k: number; ease: number }) {
      const readEase = useEffectEvent(() => ease);
      useLayoutEffect(() => {
        seen.push([k, readEase()]);
      }, [k]);
      return null;
    }
    act(() => root.render(<Settle k={1} ease={100} />));
    act(() => root.render(<Settle k={1} ease={50} />)); // no new settle: the effect does not run
    act(() => root.render(<Settle k={2} ease={5} />)); // a new settle and a new ease in one commit
    expect(seen).toEqual([
      [1, 100],
      [2, 5],
    ]);
  });

  it("throws when called during render", () => {
    function Bad() {
      const read = useEffectEvent(() => 1);
      // eslint-plugin-react-hooks 7.1 reports this line as an error (rules-of-hooks); here it is the point.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      read();
      return null;
    }
    expect(() => act(() => root.render(<Bad />))).toThrow(/can't be called during rendering/);
  });
});
