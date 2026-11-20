// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AiWritingForm } from "../ai-writing-section";
import { AI_WRITING_DEFAULTS, AiWritingSettingsSchema, type AiWritingSettings } from "@/lib/ai/writing-settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia ??= ((media: string) => ({
  matches: false,
  media,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

let root: Root | null = null;
const changes: AiWritingSettings[] = [];
const saved = () => JSON.parse(JSON.stringify(changes.at(-1) ?? AI_WRITING_DEFAULTS));

function Harness() {
  const [value, setValue] = useState(AI_WRITING_DEFAULTS);
  const change = (next: AiWritingSettings) => {
    changes.push(next);
    setValue(next);
  };
  return <AiWritingForm value={value} onChange={change} configured usage={null} saving={false} onSave={() => {}} />;
}

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Harness />));
}

const box = (id: string) => document.getElementById(id) as HTMLInputElement;

function key(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const backspace = (el: HTMLInputElement) => key(el, el.value.slice(0, -1));
const typeChar = (el: HTMLInputElement, c: string) => key(el, el.value + c);

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  changes.length = 0;
  document.body.innerHTML = "";
});

describe("the AI writing limits", () => {
  it("take what is typed after the box is emptied: 60 backspaced to nothing, then 30, saves 30", () => {
    mount();
    const day = box("ai-writing-limit-day");
    expect(day.value).toBe("60");
    backspace(day);
    backspace(day);
    expect(day.value).toBe("");
    typeChar(day, "3");
    typeChar(day, "0");
    expect(day.value).toBe("30");
    expect(saved().limitDay).toBe(30);
    expect(AiWritingSettingsSchema.safeParse(saved()).success).toBe(true);
  });

  it("save an empty box as no number, which Save refuses, never as the minimum", () => {
    mount();
    const tenMinutes = box("ai-writing-limit-10min");
    backspace(tenMinutes);
    backspace(tenMinutes);
    expect(tenMinutes.value).toBe("");
    const r = AiWritingSettingsSchema.safeParse(saved());
    expect(r.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([["limit10min", "Enter a number."]]);
  });
});
