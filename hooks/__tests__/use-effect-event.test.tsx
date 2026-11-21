// @vitest-environment jsdom
import { act, useEffect, useEffectEvent, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    act(() => root.render(<Settle k={1} ease={50} />));
    act(() => root.render(<Settle k={2} ease={5} />));
    expect(seen).toEqual([
      [1, 100],
      [2, 5],
    ]);
  });
});
