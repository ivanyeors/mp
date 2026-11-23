import { describe, expect, it } from "vitest";
import { errorsAfterBlockEdit } from "../block-errors";
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
