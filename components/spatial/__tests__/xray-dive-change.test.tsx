// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act, useCallback, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FillingMixWorkbench } from "@/app/[lang]/settings/results/[id]/filling-mix-workbench";
import type { Section } from "@/lib/spatial-fillings/core";
import { XrayEditor } from "../xray-editor";

let root: Root | null = null;
function mount(onDiveChange: (s: string | null) => void) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(<XrayEditor placements={[]} items={[]} onPlacementsChange={() => undefined} onDiveChange={onDiveChange} />),
  );
}
const section = (name: string) => document.querySelector<SVGElement>(`[aria-label="Dive into ${name} section"]`)!;
const click = (el: Element) => act(() => void el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const escape = () => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("XrayPillow dive → host", () => {
  it("tells the host each Section dived into, and null when the dive ends", () => {
    const onDiveChange = vi.fn();
    mount(onDiveChange);
    expect(onDiveChange.mock.calls).toEqual([[null]]);
    onDiveChange.mockClear();

    click(section("left"));
    expect(onDiveChange).toHaveBeenLastCalledWith("left");
    click(section("right"));
    expect(onDiveChange).toHaveBeenLastCalledWith("right");
    escape();
    expect(onDiveChange).toHaveBeenLastCalledWith(null);
    expect(onDiveChange.mock.calls.map(([s]) => s)).toEqual(["left", "right", null]);
  });

  it("a host's dived Section clears when the workbench crosses its wide breakpoint and remounts the x-ray", () => {
    function ResultsHost({ wide }: { wide: boolean }) {
      const [divedSection, setDivedSection] = useState<Section | null>(null);
      const onXrayDive = useCallback((s: Section | null) => setDivedSection(s), []);
      return (
        <>
          <output data-host-dived>{divedSection ?? "none"}</output>
          <FillingMixWorkbench
            measureRef={() => undefined}
            wide={wide}
            xray={<XrayEditor placements={[]} items={[]} onPlacementsChange={() => undefined} onDiveChange={onXrayDive} />}
            packList={null}
          />
        </>
      );
    }
    const hostDived = () => document.querySelector("[data-host-dived]")!.textContent;
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<ResultsHost wide={false} />));

    click(section("left"));
    expect(hostDived()).toBe("left");

    act(() => root!.render(<ResultsHost wide />));
    expect(document.querySelector('[aria-label="Dive into left section"]')).not.toBeNull();
    expect(hostDived()).toBe("none");
  });

  it("a host's dived Section clears when the x-ray leaves and comes back, as the configurator's preview step does", () => {
    function StageHost({ showStage }: { showStage: boolean }) {
      const [divedSection, setDivedSection] = useState<Section | null>(null);
      const onStageDive = useCallback((s: Section | null) => setDivedSection(s), []);
      return (
        <>
          <output data-host-dived>{divedSection ?? "none"}</output>
          {showStage && (
            <XrayEditor placements={[]} items={[]} onPlacementsChange={() => undefined} onDiveChange={onStageDive} />
          )}
        </>
      );
    }
    const hostDived = () => document.querySelector("[data-host-dived]")!.textContent;
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(<StageHost showStage />));
    click(section("left"));
    expect(hostDived()).toBe("left");

    act(() => root!.render(<StageHost showStage={false} />));
    act(() => root!.render(<StageHost showStage />));
    expect(hostDived()).toBe("none");
  });

  it("a host that re-renders while dived keeps its dive", () => {
    const onDiveChange = vi.fn();
    mount(onDiveChange);
    click(section("left"));
    onDiveChange.mockClear();
    act(() =>
      root!.render(<XrayEditor placements={[]} items={[]} onPlacementsChange={() => undefined} onDiveChange={(s) => onDiveChange(s)} />),
    );
    expect(onDiveChange).not.toHaveBeenCalled();
  });
});
