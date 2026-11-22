// @vitest-environment jsdom
import { settle } from "@/components/block-editor/__tests__/dom";
import { Profiler, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SettingsBreadcrumbProvider,
  useSettingsBreadcrumbDetail,
  useSettingsBreadcrumbDetailLabel,
} from "../settings-breadcrumb-context";

function Page({ label }: { label: string | null }) {
  useSettingsBreadcrumbDetail(label);
  return null;
}

function Trail() {
  return <span>{useSettingsBreadcrumbDetailLabel() ?? "no detail"}</span>;
}

let root: Root | null = null;
let host: HTMLElement;
let commits = 0;
beforeEach(() => {
  commits = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  host.remove();
});

const render = async (page: React.ReactNode) => {
  await act(async () =>
    root!.render(
      <Profiler id="admin-panel" onRender={() => commits++}>
        <SettingsBreadcrumbProvider>
          <Trail />
          {page}
        </SettingsBreadcrumbProvider>
      </Profiler>,
    ),
  );
  await settle();
};

describe("Admin Panel breadcrumb detail", () => {
  it("shows the page's label, follows it, and clears it when the page goes away", async () => {
    await render(<Page label="#1001" />);
    expect(host.textContent).toBe("#1001");
    await render(<Page label="#1002" />);
    expect(host.textContent).toBe("#1002");
    await render(<Page label={null} />);
    expect(host.textContent).toBe("no detail");
    await render(<Page label="#1003" />);
    expect(host.textContent).toBe("#1003");
    await render(null);
    expect(host.textContent).toBe("no detail");
  });

  it("publishes a label in one render after mount, not two", async () => {
    await render(<Page label="#1001" />);
    expect(host.textContent).toBe("#1001");
    expect(commits).toBe(2);
  });
});
