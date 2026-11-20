// @vitest-environment jsdom
import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Particles } from "./index";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Frames the page asked for and not yet run, so the test steps them by hand. */
let queued = new Map<number, FrameRequestCallback>();
let nextId = 1;
/** Every translate() the canvas saw, as [x, y]: a particle's pull toward the pointer. */
let translations: [number, number][] = [];

beforeEach(() => {
  queued = new Map();
  nextId = 1;
  translations = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++;
    queued.set(id, cb);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => void queued.delete(id));
  // jsdom has no canvas; a context that records what the particles draw.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () =>
      ({
        translate: (x: number, y: number) => translations.push([x, y]),
        beginPath() {},
        arc() {},
        fill() {},
        setTransform() {},
        scale() {},
        clearRect() {},
      }) as unknown as CanvasRenderingContext2D,
  );
  // A 200 x 100 container at the page's top-left corner.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100);
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.restoreAllMocks();
});

/** Runs the frames queued now (each queues its successor for the next call). */
function frame() {
  const now = [...queued.entries()];
  queued.clear();
  for (const [, cb] of now) cb(0);
  return now.length;
}

function mount(el: React.ReactElement) {
  host = document.createElement("div");
  document.body.append(host);
  act(() => {
    root = createRoot(host!);
    root.render(el);
  });
}

describe("Particles", () => {
  it("animates one loop, frame after frame", () => {
    mount(<Particles quantity={5} />);
    expect(frame()).toBe(1);
    expect(frame()).toBe(1);
    expect(frame()).toBe(1);
  });

  it("stops requesting frames once unmounted", () => {
    mount(<Particles quantity={5} />);
    frame();
    act(() => root!.unmount());
    root = null;
    // Anything already queued runs once more at most; nothing may queue after it.
    frame();
    expect(queued.size).toBe(0);
  });

  it("keeps a single loop when the colour changes", () => {
    mount(<Particles quantity={5} color="#ffffff" />);
    frame();
    act(() => root!.render(<Particles quantity={5} color="#000000" />));
    expect(frame()).toBe(1);
    expect(frame()).toBe(1);
  });

  it("pulls particles toward the pointer inside the canvas", () => {
    mount(<Particles quantity={5} />);
    frame();
    expect(translations.some(([x, y]) => x !== 0 || y !== 0)).toBe(false);
    // 150, 50 is 50px right of the canvas centre.
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 50 })));
    translations = [];
    frame();
    expect(translations.some(([x]) => x > 0)).toBe(true);
    expect(translations.every(([, y]) => y === 0)).toBe(true);
  });

  it("ignores the pointer outside the canvas", () => {
    mount(<Particles quantity={5} />);
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 400 })));
    translations = [];
    frame();
    expect(translations.every(([x, y]) => x === 0 && y === 0)).toBe(true);
  });

  it("does not re-render on mouse move", () => {
    let commits = 0;
    mount(
      <Profiler id="p" onRender={() => commits++}>
        <Particles quantity={5} />
      </Profiler>,
    );
    commits = 0;
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 50 })));
    expect(commits).toBe(0);
  });
});
