// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./support-chat-root", () => ({ STORAGE_KEY: "mp.supportChat" }));
const { useSupportChat } = await import("./use-support-chat");

const chat = { id: "c1", ref: "R1", status: "open", name: null, email: "", hasAccount: false, createdAt: "2026-11-01T00:00:00Z", endedAt: null };

let polls: Array<(body?: unknown) => void> = [];
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => {
  polls = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.sessionStorage.setItem("mp.supportChat", JSON.stringify({ id: "c1", token: "tok" }));
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      if (u.includes("?have=")) {
        return new Promise((r) => polls.push((body = { chat, unchanged: true }) => r(reply(body))));
      }
      if (u.endsWith("/api/support/chat/c1")) return Promise.resolve(reply({ chat, messages: [] }));
      return Promise.resolve(reply({ signedIn: false }));
    }),
  );
});

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

let container = document.createElement("div");
const shown = () => (container.textContent ? container.textContent.split(",") : []);
function Harness() {
  return <>{useSupportChat().active?.messages.map((m) => m.id).join(",")}</>;
}
const agentReply = { id: "m1", body: "Hi, how can I help?", createdAt: "2026-11-01T00:01:00Z" };
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
const answerPolls = async (body?: unknown) => {
  const waiting = polls;
  polls = [];
  for (const answer of waiting) answer(body);
  await flush();
};

describe("useSupportChat polling", () => {
  it("keeps one poll loop when the tab comes back while a poll is waiting", async () => {
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<Harness />));
    await flush();

    await advance(3_000);
    expect(polls).toHaveLength(1);

    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await answerPolls();

    await advance(3_000);
    expect(polls).toHaveLength(1);
    await answerPolls();
    await advance(3_000);
    expect(polls).toHaveLength(1);
  });

  it("polls at once when the tab comes back between polls", async () => {
    root = createRoot(document.createElement("div"));
    await act(async () => root!.render(<Harness />));
    await flush();
    await advance(3_000);
    await answerPolls();

    await advance(1_000);
    expect(polls).toHaveLength(0);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(polls).toHaveLength(1);
    await answerPolls();
    await advance(3_000);
    expect(polls).toHaveLength(1);
  });

  it("polls at once and shows the reply when the tab comes back while a poll never settles", async () => {
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(<Harness />));
    await flush();
    await advance(3_000);
    expect(polls).toHaveLength(1);
    polls = [];

    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(polls).toHaveLength(1);
    await answerPolls({ chat, messages: [agentReply] });
    expect(shown()).toEqual(["m1"]);
  });

  it("keeps one loop and the newer messages when a stuck poll settles after the tab came back", async () => {
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(<Harness />));
    await flush();
    await advance(3_000);
    const [stuck] = polls;
    polls = [];

    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await answerPolls({ chat, messages: [agentReply] });
    await act(async () => stuck({ chat, messages: [] }));
    await flush();
    expect(shown()).toEqual(["m1"]);

    for (let i = 0; i < 4; i++) {
      await advance(3_000);
      expect(polls).toHaveLength(1);
      await answerPolls();
    }
    expect(shown()).toEqual(["m1"]);
  });
});
