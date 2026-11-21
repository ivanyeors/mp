// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyTransitionNode } from "../actions";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/analytics",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

const node = (path: string): JourneyTransitionNode => ({
  path,
  views: 10,
  prospects: 10,
  dropOffs: 0,
  dropOffPct: 0,
  medianDwellMs: null,
  topDropOffSection: null,
  returnHits: 0,
  medianReturnGapMs: null,
});

vi.mock("../actions", () => ({
  getProspectJourneyTransitions: vi.fn(async () => ({
    ok: true,
    nodes: [node("/"), node("/shop")],
    edges: [{ from: "/", to: "/shop", count: 5 }],
    entrySources: [],
    countries: [],
    countryLegend: [],
    sections: [],
    expandablePaths: [],
  })),
  getProspectJourneyNodeDetails: vi.fn(async () => ({ ok: true, details: [] })),
}));

const { ProspectJourneyCard } = await import("../ProspectJourneyCard");

const LAYOUT_KEY = "prospect-journey-layout-v1";
const FAR = { x: 1400, y: 900 };

let panes: { report: (w: number, h: number) => void }[];
class FakeResizeObserver {
  constructor(private callback: ResizeObserverCallback) {
    panes.push({
      report: (width, height) =>
        act(() => this.callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver)),
    });
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

let root: Root | null = null;
let host: HTMLElement;
beforeEach(() => {
  panes = [];
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root!.render(<ProspectJourneyCard from="2026-11-01" to="2026-11-21" />));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
}

const numbers = (s: string | null | undefined) => (s?.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
function camera() {
  const g = host.querySelector<SVGGElement>('svg g[transform*="scale("]')!;
  const [x, y, k] = numbers(g.getAttribute("transform"));
  return { x, y, k };
}
function onScreen(path: string) {
  const g = [...host.querySelectorAll<SVGGElement>('g[role="button"]')].find((el) => el.textContent?.includes(path === "/" ? "Home" : path))!;
  const [nx, ny] = numbers(g.getAttribute("transform"));
  const cam = camera();
  return { x: cam.x + nx * cam.k, y: cam.y + ny * cam.k, world: { x: nx, y: ny } };
}
const inView = (p: { x: number; y: number }, w: number, h: number) => p.x > 0 && p.x < w && p.y > 0 && p.y < h;

describe("Prospect journey camera", () => {
  it("opens with a node the visitor moved before in view, before the pane is measured", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ "/shop": FAR }));
    await mount();
    expect(onScreen("/shop").world).toEqual(FAR);
    expect(inView(onScreen("/shop"), 800, 500)).toBe(true);
    expect(inView(onScreen("/"), 800, 500)).toBe(true);
  });

  it("refits to the moved node once the pane is measured", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ "/shop": FAR }));
    await mount();
    panes.at(-1)!.report(1000, 600);
    expect(inView(onScreen("/shop"), 1000, 600)).toBe(true);
    expect(inView(onScreen("/"), 1000, 600)).toBe(true);
  });

  it("keeps the camera when the pane reports the size it already has", async () => {
    await mount();
    panes.at(-1)!.report(1000, 600);
    const fitted = camera();
    panes.at(-1)!.report(1000, 600);
    expect(camera()).toEqual(fitted);
  });

  it("puts moved nodes back, forgets them and refits when Arrange is pressed", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ "/shop": FAR }));
    await mount();
    panes.at(-1)!.report(1000, 600);
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Arrange nodes"]')!.click());
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
    expect(onScreen("/shop").world).not.toEqual(FAR);
    expect(inView(onScreen("/shop"), 1000, 600)).toBe(true);
  });
});
