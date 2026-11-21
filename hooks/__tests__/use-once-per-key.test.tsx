// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useOncePerKey } from "../use-once-per-key";

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

function Probe({ k, label, ran }: { k: string | null; label: string; ran: string[] }) {
  useOncePerKey(k, (key) => ran.push(`${label}:${key}`));
  return null;
}

describe("useOncePerKey", () => {
  it("runs once for a key, however often the component renders", () => {
    const ran: string[] = [];
    act(() => root.render(<Probe k="a" label="first" ran={ran} />));
    act(() => root.render(<Probe k="a" label="second" ran={ran} />));
    act(() => root.render(<Probe k="a" label="third" ran={ran} />));
    expect(ran).toEqual(["first:a"]);
  });

  it("runs once in Strict Mode", () => {
    const ran: string[] = [];
    act(() =>
      root.render(
        <StrictMode>
          <Probe k="a" label="only" ran={ran} />
        </StrictMode>,
      ),
    );
    expect(ran).toEqual(["only:a"]);
  });

  it("does not run for null, and does not run again when the same key comes back after null", () => {
    const ran: string[] = [];
    act(() => root.render(<Probe k={null} label="none" ran={ran} />));
    expect(ran).toEqual([]);
    act(() => root.render(<Probe k="a" label="first" ran={ran} />));
    act(() => root.render(<Probe k={null} label="gone" ran={ran} />));
    act(() => root.render(<Probe k="a" label="back" ran={ran} />));
    expect(ran).toEqual(["first:a"]);
  });

  it("runs for a new key, with the callback of the render that brought it", () => {
    const ran: string[] = [];
    act(() => root.render(<Probe k="a" label="first" ran={ran} />));
    act(() => root.render(<Probe k="b" label="second" ran={ran} />));
    expect(ran).toEqual(["first:a", "second:b"]);
  });

  it("does not run again for an earlier key that comes back after another", () => {
    const ran: string[] = [];
    act(() => root.render(<Probe k="a" label="first" ran={ran} />));
    act(() => root.render(<Probe k="b" label="second" ran={ran} />));
    act(() => root.render(<Probe k="a" label="third" ran={ran} />));
    expect(ran).toEqual(["first:a", "second:b"]);
  });
});
