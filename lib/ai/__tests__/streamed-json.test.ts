import { describe, expect, it } from "vitest";
import { streamedJson, type JsonPiece } from "@/lib/ai/streamed-json";

const ANSWER = JSON.stringify(
  {
    subjects: ["Sleep cooler", 'A "quoted" line, with } and ] in it'],
    preheaders: ["Our coolest covers are back"],
    blocks: [
      { type: "heading", level: 1, text: "Sleep cooler {first_name}" },
      { type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Line one\nline two \\ done" }] }] },
      { type: "divider" },
    ],
    count: 3,
    done: true,
    reviewerNotes: [],
  },
  null,
  1,
);

function feed(text: string, size: number): JsonPiece[] {
  const reader = streamedJson();
  const out: JsonPiece[] = [];
  for (let i = 0; i < text.length; i += size) out.push(...reader.push(text.slice(i, i + size)));
  expect(reader.text()).toBe(text);
  return out;
}

describe("streamedJson", () => {
  it.each([1, 3, 17, 1000])("hands over each array element as it closes, then the whole value (chunks of %i)", (size) => {
    const pieces = feed(ANSWER, size);
    const parsed = JSON.parse(ANSWER) as { blocks: unknown[]; subjects: string[] };
    expect(pieces.filter((p) => p.kind === "item" && p.key === "blocks").map((p) => p.value)).toEqual(parsed.blocks);
    expect(pieces.filter((p) => p.kind === "item" && p.key === "blocks").map((p) => (p as { index: number }).index)).toEqual([0, 1, 2]);
    expect(pieces.find((p) => p.kind === "value" && p.key === "subjects")?.value).toEqual(parsed.subjects);
    expect(pieces.find((p) => p.kind === "value" && p.key === "count")?.value).toBe(3);
    expect(pieces.find((p) => p.kind === "value" && p.key === "done")?.value).toBe(true);
    expect(pieces.find((p) => p.kind === "value" && p.key === "reviewerNotes")?.value).toEqual([]);
    const third = pieces.findIndex((p) => p.kind === "item" && p.key === "blocks" && p.index === 2);
    const all = pieces.findIndex((p) => p.kind === "value" && p.key === "blocks");
    expect(third).toBeLessThan(all);
  });

  it("gives nothing for an element still being written", () => {
    const reader = streamedJson();
    const half = '{"blocks":[{"type":"heading","text":"Sleep coo';
    expect(reader.push(half)).toEqual([]);
    expect(reader.push('ler"},')).toEqual([{ kind: "item", key: "blocks", index: 0, value: { type: "heading", text: "Sleep cooler" } }]);
  });

  it("reads numbers and literals inside an array, ended by a comma or the bracket", () => {
    const pieces = feed('{"n":[1, 22,true ,null]}', 2);
    expect(pieces.filter((p) => p.kind === "item").map((p) => p.value)).toEqual([1, 22, true, null]);
  });
});
