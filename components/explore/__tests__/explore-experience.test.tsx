// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { skyAt } from "@/lib/explore/sky";
import type { ExploreSceneOptions } from "../explore-scene";

const actions = vi.hoisted(() => ({ claimExplorePoints: vi.fn(), pickExploreFlower: vi.fn() }));
const scene = vi.hoisted(() => ({ options: null as ExploreSceneOptions | null }));
vi.mock("@/app/[lang]/explore/actions", () => actions);
vi.mock("@/lib/auth/sign-in-actions", () => ({ resubscribeMe: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../explore-claim-dialog", () => ({ ExploreClaimDialog: ({ open, stage }: { open: boolean; stage: string }) => (open ? <div data-claim={stage} /> : null) }));
vi.mock("../explore-flower-dialog", () => ({ ExploreFlowerDialog: ({ popup }: { popup: { kind: string } | null }) => (popup ? <div data-flower={popup.kind} /> : null) }));
vi.mock("../explore-scene", () => ({
  createExploreScene: (_host: HTMLElement, options: ExploreSceneOptions) => {
    scene.options = options;
    return { setSky: () => undefined, setFlowers: () => undefined, popFlower: () => 0, dispose: () => undefined };
  },
}));

import { ExploreExperience } from "../explore-experience";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = ComponentProps<typeof ExploreExperience>;
const NOW = Date.parse("2026-11-20T10:00:00+08:00");
const props = (over: Partial<Props> = {}): Props => ({
  locale: "en-US",
  serverNow: NOW,
  launchAt: NOW + 86_400_000,
  initialSky: skyAt(new Date(NOW), { lat: 1.35, lon: 103.8 }),
  offer: null,
  pointsOn: true,
  pointsLive: false,
  rules: { minRedeem: 100, maxShare: 0.5 },
  signedIn: false,
  viewer: null,
  flowers: { count: 3, picked: [], givesPoints: true },
  finishClaim: false,
  finishFlower: null,
  look: { hour: null, rain: null },
  ...over,
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal("fetch", () => new Promise(() => undefined));
  window.matchMedia = ((media: string) => ({ matches: false, media })) as unknown as typeof window.matchMedia;
  actions.claimExplorePoints.mockReset().mockResolvedValue({ state: "error" });
  actions.pickExploreFlower.mockReset().mockResolvedValue({ state: "picked", points: 2, balance: 2 });
  scene.options = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const settle = () => act(async () => void (await vi.runOnlyPendingTimersAsync()));

describe("ExploreExperience", () => {
  it("back from signing in, finishes the claim once, without agreeing again", async () => {
    window.history.replaceState(null, "", "/en/explore?claim=1");
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: true, finishClaim: true })} />));
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: true, finishClaim: true })} />));
    expect(actions.claimExplorePoints).toHaveBeenCalledTimes(1);
    expect(actions.claimExplorePoints).toHaveBeenCalledWith({ agree: false, lang: "en-US" });
    expect(window.location.search).toBe("");
    expect(host.querySelector("[data-claim]")?.getAttribute("data-claim")).toBe("error");
  });

  it("a flower tapped in the scene does what the latest render says", async () => {
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: false, pointsLive: false })} />));
    await act(async () => void (await import("../explore-scene")));
    expect(scene.options).not.toBeNull();
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: false, pointsLive: true })} />));
    await act(async () => scene.options!.onFlower(1, { x: 10, y: 10 }));
    await settle();
    expect(host.querySelector("[data-flower]")?.getAttribute("data-flower")).toBe("sign_up");
    expect(host.textContent).not.toContain("A flower for you");
  });

  it("back from signing up for a flower, picks it with the latest render's handler", async () => {
    window.history.replaceState(null, "", "/en/explore?flower=1");
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: false, pointsLive: true, finishFlower: 1 })} />));
    await act(async () => root.render(<ExploreExperience {...props({ signedIn: true, pointsLive: true, finishFlower: 1 })} />));
    await settle();
    await settle();
    await settle();
    expect(actions.pickExploreFlower).toHaveBeenCalledTimes(1);
    expect(actions.pickExploreFlower).toHaveBeenCalledWith(1);
    expect(host.querySelector("[data-flower]")?.getAttribute("data-flower")).toBe("won");
    expect(window.location.search).toBe("");
  });
});
