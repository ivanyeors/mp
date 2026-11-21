// @vitest-environment jsdom
import { byLabel, click, settle } from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { SelectFromDriveDialog } = await import("../select-from-drive-dialog");

const file = (id: string, name: string, isFolder = false) => ({
  id,
  name,
  mimeType: isFolder ? "application/vnd.google-apps.folder" : "image/png",
  thumbnailLink: null,
  size: null,
  webViewLink: null,
  isFolder,
});

const listing: Record<string, { items: ReturnType<typeof file>[]; nextPageToken?: string }> = {
  "folderId=d1": { items: [file("photos", "Photos", true), file("a", "a.png")], nextPageToken: "p2" },
  "folderId=d1&pageToken=p2": { items: [file("b", "b.png")] },
  "folderId=photos": { items: [file("c", "c.png")] },
};

let held: { url: string; release: () => void }[];
let hold: (url: string) => boolean;

beforeEach(() => {
  held = [];
  hold = () => false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (hold(url)) await new Promise<void>((release) => held.push({ url, release }));
      const qs = url.split("?")[1];
      const body = !qs
        ? { ok: true, drives: [{ id: "d1", name: "Team drive" }, { id: "d2", name: "Archive" }] }
        : { ok: true, ...listing[qs.replace("driveId=d1&", "")] };
      return { ok: true, json: async () => body };
    }),
  );
});

let root: Root | null = null;
const render = async (open: boolean) => {
  await act(async () =>
    root!.render(<SelectFromDriveDialog open={open} onOpenChange={() => {}} onImported={() => {}} />),
  );
  await settle();
};
beforeEach(() => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const names = () => [...document.querySelectorAll("[title]")].map((el) => el.getAttribute("title"));
const release = async (part: string) => {
  await act(async () => held.find((h) => h.url.includes(part))!.release());
  await settle();
};

describe("Select from Drive", () => {
  it("keeps a folder's next page out of the subfolder opened while it loads", async () => {
    await render(true);
    await click(byLabel("Team drive")!);
    expect(names()).toEqual(["Photos", "a.png"]);

    hold = (url) => url.includes("pageToken=p2");
    await click(byLabel("Load more")!);
    await click(document.querySelector<HTMLElement>("[role='button'][tabindex='0']")!);
    expect(names()).toEqual(["c.png"]);

    await release("pageToken=p2");
    expect(names()).toEqual(["c.png"]);
    expect(byLabel("Load more")).toBeNull();
  });

  it("lists the Shared Drives after a reopen while a folder was still loading", async () => {
    await render(true);
    hold = (url) => url.includes("folderId=d1");
    await click(byLabel("Team drive")!);
    await render(false);
    hold = () => false;
    await render(true);
    expect(byLabel("Archive")).not.toBeNull();

    await release("folderId=d1");
    expect(byLabel("Team drive")).not.toBeNull();
    expect(byLabel("Archive")).not.toBeNull();
    expect(document.body.textContent).not.toContain("No Shared Drives visible");
  });
});
