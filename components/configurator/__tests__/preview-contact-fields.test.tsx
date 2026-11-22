// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { settle, until } from "@/components/block-editor/__tests__/dom";
import { PreviewContactFields } from "@/components/configurator/preview-contact-fields";

const SOURCES = [
  { id: "google", label: "Google search" },
  { id: "friend", label: "A friend" },
  { id: "other", label: "Other" },
];

let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).startsWith("/api/discovery-source") ? { ok: true, options: SOURCES } : {}),
  }));
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  act(() => root.unmount());
  host.remove();
  await settle();
  vi.unstubAllGlobals();
});

const render = (discoverySourceOptions: { id: string; label: string }[]) =>
  act(async () =>
    root.render(
      <PreviewContactFields
        values={{ email: "", phone: "", discoverySource: "", discoverySourceOther: "", notes: "", code: "", marketingEmail: true }}
        onChange={() => undefined}
        fieldErrors={{}}
        discoverySourceOptions={discoverySourceOptions}
        codeContext={null}
        onCodeStatus={() => undefined}
        formatAmount={(n) => `SGD ${n.toFixed(2)}`}
      />,
    ),
  );

async function openSources() {
  const trigger = document.getElementById("hold-discovery")!;
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await until(() => document.querySelector('[role="menu"]'), 20);
  return [...document.querySelectorAll('[role="menuitem"]')].map((o) => o.textContent);
}

describe("PreviewContactFields discovery sources", () => {
  it("lists the sources in the How did you hear about us picker", async () => {
    await render(SOURCES);
    await settle(20);
    expect(await openSources()).toEqual(["Google search", "A friend", "Other"]);
  });

  it("asks the server for nothing on mount: the page hands the sources in", async () => {
    await render(SOURCES);
    await settle(20);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith("/api/discovery-source"))).toEqual([]);
  });
});
