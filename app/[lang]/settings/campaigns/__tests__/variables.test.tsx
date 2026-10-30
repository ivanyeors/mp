// @vitest-environment jsdom
import {
  choose,
  click,
  dragData,
  dragStart,
  dropInto,
  press,
  richTextById,
  richTextIn,
  settle,
  typeField,
  typeInto,
  wordsOf,
} from "@/components/block-editor/__tests__/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import type { CampaignDraftInput } from "@/lib/email-campaigns/rules";

/**
 * Variables in the campaign editor (PRD-campaign-email-editor slice 13), as
 * the owner's demo goes: drag *First name* from the palette's Variables tab
 * into the subject and *Points balance* into a paragraph, set the fallback
 * words once under the chips, and preview as *A customer* or *No details*.
 * Every drag has a keyboard way: `{` in the words, or a chip pressed where
 * the cursor is, each said by name. *Points balance* is greyed while points
 * are not live.
 *
 * jsdom has no drag and drop of its own: a chip's `dragstart` fills a
 * DataTransfer, and the drop is handed to ProseMirror's own drop handling at
 * a chosen spot (`dropInto`).
 */

type SaveResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const actions = vi.hoisted(() => ({
  archiveCampaignAction: vi.fn(),
  checkCampaignReadiness: vi.fn(() => new Promise(() => undefined)),
  duplicateCampaign: vi.fn(),
  planCampaignWave: vi.fn(),
  previewCampaign: vi.fn<
    (input: CampaignDraftInput, opts?: { forceDark?: boolean; previewAs?: string }) => Promise<{ ok: true; subject: string; html: string; text: string; from: string }>
  >(async (input) => ({ ok: true, subject: input.subject, html: "<p>preview</p>", text: "", from: "Mpillow <hello@hello.mpillow.com>" })),
  saveCampaign: vi.fn<(id: string | null, input: CampaignDraftInput) => Promise<SaveResult>>(async (id) => ({ ok: true, id: id ?? "new" })),
  sendCampaignBatchAction: vi.fn(),
  sendCampaignTestAction: vi.fn(),
}));
vi.mock("../actions", () => actions);
vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/settings/campaigns/new",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { CampaignEditor } = await import("../campaign-editor");
const { newCampaignDraft } = await import("@/lib/email-campaigns/rules");

let root: Root | null = null;
function mount({ pointsLive = true }: { pointsLive?: boolean } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <>
        <CampaignEditor campaign={null} draft={newCampaignDraft(undefined, [])} stats={null} segments={[]} staffEmail="owner@mpillow.com" pointsLive={pointsLive} />
        <Toaster />
      </>,
    ),
  );
}

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label) ?? null;
const cards = () => [...document.querySelectorAll<HTMLElement>("[data-block-id]")];
const lastPreview = () => actions.previewCampaign.mock.calls.at(-1);
const radio = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === label)!;
const addBlock = (label: string) => choose(button("Add block")!, label);

/** The palette's Variables tab, opened as a pointer opens it. */
async function openVariables() {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === "Variables")!;
  await act(async () => void tab.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
}
const chip = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("ul[aria-label='Variables'] button")].find((b) => b.textContent?.startsWith(label))!;
/** What the page said last, in its live lines. */
const said = () => [...document.querySelectorAll('[role="status"]')].map((s) => s.textContent ?? "").filter(Boolean);

/** Drags a chip from the palette and drops it into `editor` at `pos`. */
function dragChip(label: string, editor: Editor, pos: number) {
  const data = dragData();
  dragStart(chip(label), data);
  dropInto(editor, data, pos);
  return data;
}
const end = (editor: Editor) => editor.state.doc.content.size - 1;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  await settle(50);
  document.body.innerHTML = "";
});

describe("the demo", () => {
  it("drags First name into the subject and Points balance into a paragraph, sets the fallback words once, and previews as a customer or with no details", async () => {
    mount();
    await openVariables();
    expect([...document.querySelectorAll("ul[aria-label='Variables'] button")].map((b) => b.querySelector("span span")?.textContent)).toEqual([
      "First name",
      "Last name",
      "Points balance",
    ]);

    // First name, dragged to the start of the subject.
    const subject = await richTextById("c-subject");
    const data = dragChip("First name", subject, 1);
    // Only the input's own chip travels: a plain field (a button's label) takes nothing from it.
    expect(data.types).toEqual(["text/html"]);
    expect(data.getData("text/plain")).toBe("");
    act(() => void subject.commands.focus("end"));
    typeInto(subject, ", sleep cooler this December");
    expect(subject.view.dom.querySelector('[data-variable="first_name"]')?.textContent).toBe("First name");
    expect(wordsOf("c-subject")).toBe("First name, sleep cooler this December");

    // Points balance, dragged into a paragraph.
    await addBlock("Text");
    const text = await richTextIn(cards()[0]);
    typeInto(text, "You have ");
    dragChip("Points balance", text, end(text));
    act(() => void text.commands.focus("end"));
    typeInto(text, " points waiting.");
    expect(cards()[0].querySelector('[data-variable="points_balance"]')?.textContent).toBe("Points balance");

    // Under the chips, a fallback for every Variable the email uses: the first name prefilled, the points to write.
    expect(field("c-fallback-first_name").value).toBe("there");
    expect(field("c-fallback-points_balance").value).toBe("");
    expect(field("c-fallback-points_balance").placeholder).toBe("e.g. some");
    expect(document.getElementById("c-fallback-last_name")).toBeNull();
    typeField(field("c-fallback-points_balance"), "some");

    await settle(500);
    const [input, opts] = lastPreview()!;
    expect(input.subject).toBe("{first_name}, sleep cooler this December");
    expect(input.content).toMatchObject({
      blocks: [{ type: "text", paragraphs: [{ kind: "p", runs: [{ text: "You have " }, { var: "points_balance" }, { text: " points waiting." }] }] }],
      fallbacks: { points_balance: "some" },
    });
    expect(opts).toMatchObject({ previewAs: "customer" });
    await click(radio("No details"));
    await settle(500);
    expect(lastPreview()![1]).toMatchObject({ previewAs: "no_details" });

    await click(button("Save draft")!);
    expect(actions.saveCampaign.mock.calls[0][1]).toMatchObject({ subject: "{first_name}, sleep cooler this December", content: { fallbacks: { points_balance: "some" } } });
  });

  it("opens the Variables tab on Save's fallback error, and shows it under the field", async () => {
    actions.saveCampaign.mockResolvedValueOnce({
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { "content.fallbacks.last_name": "Write what to say to a customer with no last name." },
    });
    mount();
    const subject = await richTextById("c-subject");
    typeInto(subject, "Hello {last_name}");
    expect(document.querySelector("ul[aria-label='Variables']")).toBeNull(); // Blocks is open
    await click(button("Save draft")!);
    expect(document.querySelector("ul[aria-label='Variables']")).not.toBeNull();
    expect(field("c-fallback-last_name").getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Write what to say to a customer with no last name.");
  });
});

describe("the keyboard's ways", () => {
  it("lists the Variables when { is typed: the arrow keys choose, Enter puts it in, each said by name", async () => {
    mount();
    const subject = await richTextById("c-subject");
    act(() => void subject.commands.focus());
    typeInto(subject, "Hello {");
    await settle();
    const list = document.getElementById(subject.view.dom.getAttribute("aria-controls")!)!;
    expect(list.getAttribute("role")).toBe("listbox");
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.querySelector("span")?.textContent)).toEqual(["First name", "Last name", "Points balance"]);
    expect(subject.view.dom.getAttribute("aria-activedescendant")).toBe(`${list.id}-0`);

    press("ArrowDown", {}, subject.view.dom);
    expect(subject.view.dom.getAttribute("aria-activedescendant")).toBe(`${list.id}-1`);
    expect(said()).toContain("Last name, 2 of 3");
    press("Enter", {}, subject.view.dom);
    await settle();
    expect(wordsOf("c-subject")).toBe("Hello Last name");
    expect(subject.view.dom.querySelector('[data-variable="last_name"]')).not.toBeNull();
    expect(said()).toContain("Last name added.");
    expect(subject.view.dom.getAttribute("aria-controls")).toBeNull(); // the list is closed

    // What is typed after { narrows the list; Escape closes it and keeps the words.
    typeInto(subject, " {poi");
    await settle();
    expect([...document.querySelectorAll('[role="option"]')].map((o) => o.querySelector("span")?.textContent)).toEqual(["Points balance"]);
    press("Escape", {}, subject.view.dom);
    await settle();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(wordsOf("c-subject")).toBe("Hello Last name {poi");
    // And it closes when the words lose focus.
    typeInto(subject, " {");
    await settle();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => void subject.commands.blur());
    await settle(50);
    expect(document.querySelector('[role="listbox"]')).toBeNull();

    await settle(500);
    expect(lastPreview()![0].subject).toBe("Hello {last_name} {poi {");
  });

  it("puts a chip pressed in the palette in where the cursor was, in the words last written in, and says where", async () => {
    mount();
    await openVariables();
    await addBlock("Heading");
    const heading = await richTextIn(cards()[0]);
    typeInto(heading, ", sleep cooler");
    act(() => void heading.commands.setTextSelection(1)); // the cursor at the start
    await act(async () => chip("First name").focus());
    await click(chip("First name")); // Enter on the chip presses it, as a click does
    expect(wordsOf(heading.view.dom.id)).toBe("First name, sleep cooler");
    expect(said()).toContain("First name added to Heading.");
    await settle(50);
    expect(document.activeElement).toBe(heading.view.dom); // back in the words, to carry on

    await settle(500);
    expect(lastPreview()![0].content?.blocks).toMatchObject([{ type: "heading", text: "{first_name}, sleep cooler" }]);
  });

  it("asks for the cursor first when no words have been written in yet", async () => {
    mount();
    await openVariables();
    await click(chip("Last name"));
    expect(said()).toContain("Click into the words where Last name goes, then choose it again.");
    expect(wordsOf("c-subject")).toBe("");
  });
});

describe("Points balance while points are not live", () => {
  it("is greyed, with why, and goes in neither from the palette nor from the { list", async () => {
    mount({ pointsLive: false });
    await openVariables();
    const points = chip("Points balance");
    expect(points.getAttribute("aria-disabled")).toBe("true");
    expect(points.getAttribute("draggable")).toBe("false");
    expect(points.textContent).toContain("Points aren't live yet");

    const subject = await richTextById("c-subject");
    act(() => void subject.commands.focus());
    await click(points);
    expect(said()).toContain("Points balance: Points aren't live yet.");
    expect(wordsOf("c-subject")).toBe("");

    typeInto(subject, "{po");
    await settle();
    const option = document.querySelector<HTMLElement>('[role="option"]')!;
    expect(option.getAttribute("aria-disabled")).toBe("true");
    expect(option.textContent).toContain("Points aren't live yet");
    press("Enter", {}, subject.view.dom);
    await settle();
    expect(subject.view.dom.querySelector('[data-variable="points_balance"]')).toBeNull();
    expect(wordsOf("c-subject")).toBe("{po");
    // The others still go in.
    expect(chip("First name").getAttribute("aria-disabled")).toBeNull();
  });
});
