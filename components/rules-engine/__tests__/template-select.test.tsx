// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SizeOrLength } from "@/lib/rules-engine/types";

import "@/components/block-editor/__tests__/dom";

const { TemplateSelect } = await import("../workbench");

type Held = { url: string; answer: (names: string[]) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          held.push({
            url: String(url),
            answer: (names) =>
              act(async () => {
                resolve({ ok: true, json: async () => ({ templates: names.map((name, i) => ({ id: i + 1, name })) }) });
              }),
          });
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const select = (size: SizeOrLength) => (
  <TemplateSelect flow="premium-mpillow" locale="en-US" size={size} templateId="" disabled={false} onTemplate={() => {}} />
);
const optionNames = () => [...host.querySelectorAll("option")].map((o) => o.textContent);
const heldFor = (size: string) => held.find((h) => h.url.includes(`key=${size}&`))!;

describe("TemplateSelect: size M then L, answered out of order", () => {
  it("lists L's templates when M's slower response lands last", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(select("M")));
    await act(async () => root!.render(select("L")));

    await heldFor("L").answer(["L foam"]);
    await heldFor("M").answer(["M foam"]);

    expect(optionNames()).toEqual(["Select…", "L foam"]);
  });

  it("asks for the active filling templates of the flow and size", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(select("XL")));
    await heldFor("XL").answer(["XL latex"]);

    expect(held.map((h) => h.url)).toEqual([
      "/en-US/settings/inventory/configure/templates?kind=pillow&key=XL&role=filling&activeOnly=true&pillowKind=premium",
    ]);
    expect(optionNames()).toEqual(["Select…", "XL latex"]);
  });
});
