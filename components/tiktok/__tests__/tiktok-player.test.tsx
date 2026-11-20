// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TIKTOK_PLAYER_ORIGIN, TIKTOK_STATE_ENDED } from "@/lib/tiktok/embed";
import { TikTokPlayer } from "../tiktok-player";

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

/** A message as the player posts it, from `source` (the player's own window, or another). */
const post = (source: Window | null, type: string, value?: unknown) =>
  window.dispatchEvent(new MessageEvent("message", { origin: TIKTOK_PLAYER_ORIGIN, source, data: { "x-tiktok-player": true, type, value } }));

describe("TikTokPlayer", () => {
  it("calls the callbacks of the latest render, listening once", () => {
    const add = vi.spyOn(window, "addEventListener");
    const first = { onEnded: vi.fn(), onError: vi.fn(), onEvent: vi.fn() };
    const latest = { onEnded: vi.fn(), onError: vi.fn(), onEvent: vi.fn() };
    act(() => root.render(<TikTokPlayer postId="7300000000000000001" title="Clip" {...first} />));
    act(() => root.render(<TikTokPlayer postId="7300000000000000001" title="Clip" {...latest} />));
    const frame = host.querySelector("iframe")!.contentWindow;

    post(frame, "onStateChange", TIKTOK_STATE_ENDED);
    post(frame, "onPlayerError", { errorCode: 7 });

    expect(first.onEnded).not.toHaveBeenCalled();
    expect(first.onEvent).not.toHaveBeenCalled();
    expect(latest.onEnded).toHaveBeenCalledTimes(1);
    expect(latest.onError).toHaveBeenCalledWith({ errorCode: 7 });
    expect(latest.onEvent).toHaveBeenCalledTimes(2);
    expect(add.mock.calls.filter(([type]) => type === "message")).toHaveLength(1);
    add.mockRestore();
  });

  it("ignores a message from another window", () => {
    const onEvent = vi.fn();
    act(() => root.render(<TikTokPlayer postId="7300000000000000001" title="Clip" onEvent={onEvent} />));
    post(window, "onStateChange", TIKTOK_STATE_ENDED);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
