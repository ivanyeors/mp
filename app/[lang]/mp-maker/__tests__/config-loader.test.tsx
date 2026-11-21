// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const { BuilderProvider, useBuilder } = await import("../components/BuilderProvider");
const { ConfigLoader } = await import("../components/ConfigLoader");

const cap = 20;
let fetchMock: ReturnType<typeof vi.fn>;
const answerWith = (body: unknown, status = 200) => {
  fetchMock = vi.fn(() =>
    fetchMock.mock.calls.length > cap
      ? new Promise(() => {})
      : Promise.resolve({ ok: status < 400, status, json: async () => body }),
  );
  vi.stubGlobal("fetch", fetchMock);
};

function BuilderState() {
  const builder = useBuilder();
  return <output data-step={builder.step} data-loaded={String(builder.configLoaded)} />;
}

let root: Root | null = null;
let host: HTMLElement;
const builderState = () => {
  const out = host.querySelector("output")!;
  return { step: out.dataset.step, configLoaded: out.dataset.loaded === "true" };
};
const mount = async (strict = false) => {
  host = document.createElement("div");
  root = createRoot(host);
  const tree = (
    <BuilderProvider initialProductType="bolster" initialConfigId={null}>
      <ConfigLoader />
      <BuilderState />
    </BuilderProvider>
  );
  await act(async () => root!.render(strict ? <StrictMode>{tree}</StrictMode> : tree));
  for (let i = 0; i < 10; i++) await act(async () => {});
};

beforeEach(() => toastError.mockReset());
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("?height&position", () => {
  it("asks once when the recommendation fails, and toasts once", async () => {
    search = "height=170&position=side";
    answerWith({ ok: false, error: "No stock" });
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(builderState()).toEqual({ step: "preferences", configLoaded: false });
  });

  it("asks once in Strict Mode", async () => {
    search = "height=170&position=side";
    answerWith({ ok: false, error: "No stock" });
    await mount(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks once when the recommendation loads", async () => {
    search = "height=170&position=side";
    answerWith({ ok: true, components: { covers: [], cases: [] } });
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
    expect(builderState()).toEqual({ step: "recommendation", configLoaded: true });
  });

  it("does not ask for a height out of range", async () => {
    search = "height=20&position=side";
    answerWith({ ok: false });
    await mount();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("?config=<id>", () => {
  it("asks once when the saved response is not found, and toasts once", async () => {
    search = "config=abc";
    answerWith({ ok: false, error: "Not found" }, 404);
    await mount();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/mp-config/responses/abc"]);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(builderState()).toEqual({ step: "preferences", configLoaded: false });
  });

  it("asks once in Strict Mode", async () => {
    search = "config=abc";
    answerWith({ ok: false }, 404);
    await mount(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
