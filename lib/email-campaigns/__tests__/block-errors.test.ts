import { describe, expect, it } from "vitest";
import { errorsAfterBlockEdit, firstSaveProblem, saveRefusalText } from "../block-errors";
import type { EmailBlock } from "../content";

const title: EmailBlock = { id: "title", type: "heading", level: 1, text: "" };
const photo: EmailBlock = { id: "photo", type: "image", image: { asset: "", alt: "" }, width: "full" };
const errors = {
  subject: "Write a subject.",
  "content.blocks.0.text": "Write the heading.",
  "content.blocks.1.image.asset": "Choose an image.",
  "content.blocks.1.image.alt": "Describe the image for anyone who can't see it, or mark it decorative.",
};

describe("a save's field errors, after a block is edited", () => {
  it("drops the edited block's errors and keeps every other one", () => {
    const edited: EmailBlock = { ...photo, image: { asset: "", alt: "A cover on a bed" } };
    expect(errorsAfterBlockEdit(errors, [title, photo], [title, edited])).toEqual({ subject: "Write a subject.", "content.blocks.0.text": "Write the heading." });
  });

  it("is the same errors when no block changed", () => {
    expect(errorsAfterBlockEdit(errors, [title, photo], [{ ...title }, { ...photo }])).toBe(errors);
  });

  it("drops every block's errors when blocks move, come or go, since they are kept by position", () => {
    const onlyLines = { subject: "Write a subject." };
    expect(errorsAfterBlockEdit(errors, [title, photo], [photo, title])).toEqual(onlyLines);
    expect(errorsAfterBlockEdit(errors, [title, photo], [photo])).toEqual(onlyLines);
    expect(errorsAfterBlockEdit(errors, [title, photo], [title, photo, { id: "gap", type: "divider" }])).toEqual(onlyLines);
  });
});

describe("a refused save, said in one sentence", () => {
  const moved = { blocks: [title, { id: "words", type: "text" as const }, photo, { id: "door", type: "image" as const }] };
  const ALT = "Describe the image for anyone who can't see it, or mark it decorative.";

  it("names the block by its number and kind, and counts the rest", () => {
    const problem = firstSaveProblem({ "content.blocks.2.image.alt": ALT, "content.blocks.3.image.alt": ALT }, moved);
    expect(problem).toEqual({ text: `Block 3, Image: ${ALT}`, blockId: "photo", chinese: false, more: 1 });
    expect(saveRefusalText("Not saved", "Check the highlighted fields.", problem)).toBe(`Not saved. Block 3, Image: ${ALT} 1 more thing is highlighted.`);
  });

  it("names a block whose whole shape was refused, with nothing after its number", () => {
    expect(firstSaveProblem({ "content.blocks.1": "Unrecognized key: \"decorative\"" }, moved)?.text).toBe('Block 2, Text: Unrecognized key: "decorative"');
  });

  it("finds a Chinese version's block by its id", () => {
    expect(firstSaveProblem({ "content.translations.zh-CN.blocks.photo.alt": "Describe the image for anyone who can't see it." }, moved)).toEqual({
      text: "Chinese version, Block 3, Image: Describe the image for anyone who can't see it.",
      blockId: "photo",
      chinese: true,
      more: 0,
    });
  });

  it("names a field outside the blocks, and says the message alone when nothing names it", () => {
    expect(firstSaveProblem({ subject: "Write a subject." }, moved)?.text).toBe("Subject: Write a subject.");
    expect(firstSaveProblem({ "content.fallbacks.first_name": "Write what to say to a customer with no first name." }, moved)?.text).toBe(
      "Variables: Write what to say to a customer with no first name.",
    );
    expect(firstSaveProblem({ "content.blocks": "Add a block to the email." }, moved)?.text).toBe("Email: Add a block to the email.");
    expect(firstSaveProblem({ "content.blocks.9.text": "Write the heading." }, moved)?.text).toBe("Email: Write the heading.");
    expect(firstSaveProblem({ form: "Something else." }, null)?.text).toBe("Something else.");
  });

  it("is nothing without field errors, and the refusal is then said as the server put it", () => {
    expect(firstSaveProblem({}, moved)).toBeNull();
    expect(saveRefusalText("Not saved", "This campaign has started sending.", null)).toBe("Not saved. This campaign has started sending.");
  });
});
