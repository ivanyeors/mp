import { describe, expect, it } from "vitest";
import { blogCategory, blogLabelsInUse, matchesBlogLabel } from "./blog-categories";

const post = (labels: string[] | null) => ({ labels });

describe("matchesBlogLabel", () => {
    it("puts a post with no labels under Sleep Health", () => {
        expect(matchesBlogLabel(post([]), "Sleep Health")).toBe(true);
        expect(matchesBlogLabel(post(null), "Sleep Health")).toBe(true);
    });

    it("puts a post whose labels are all outside the predefined list under Sleep Health", () => {
        expect(matchesBlogLabel(post(["Travel", "Kids"]), "Sleep Health")).toBe(true);
        expect(matchesBlogLabel(post(["Travel"]), "Ergonomics")).toBe(false);
    });

    it("keeps a Neck Pain post out of Sleep Health", () => {
        expect(matchesBlogLabel(post(["Neck Pain"]), "Sleep Health")).toBe(false);
        expect(matchesBlogLabel(post(["Neck Pain", "Travel"]), "Sleep Health")).toBe(false);
    });

    it("matches a two-label post under both of its labels", () => {
        const p = post(["Mpillow Journey", "Ergonomics"]);
        expect(matchesBlogLabel(p, "Mpillow Journey")).toBe(true);
        expect(matchesBlogLabel(p, "Ergonomics")).toBe(true);
        expect(matchesBlogLabel(p, "Pillow Guide")).toBe(false);
    });

    it("matches a post literally labelled Sleep Health even beside another category", () => {
        expect(matchesBlogLabel(post(["Neck Pain", "Sleep Health"]), "Sleep Health")).toBe(true);
    });
});

describe("blogCategory", () => {
    it("files a post under its first predefined label, else Sleep Health", () => {
        expect(blogCategory(post(["Travel", "Ergonomics", "Neck Pain"]))).toBe("Ergonomics");
        expect(blogCategory(post(["Travel"]))).toBe("Sleep Health");
        expect(blogCategory(post([]))).toBe("Sleep Health");
    });

    it("agrees with the filter: every post matches the section it is filed under", () => {
        for (const labels of [[], ["Travel"], ["Neck Pain"], ["Kids", "Pillow Guide"]]) {
            expect(matchesBlogLabel(post(labels), blogCategory(post(labels)))).toBe(true);
        }
    });
});

describe("blogLabelsInUse", () => {
    it("drops a category no post matches and keeps the predefined order", () => {
        expect(blogLabelsInUse([post(["Neck Pain"]), post(["Travel"])])).toEqual(["Sleep Health", "Neck Pain"]);
        expect(blogLabelsInUse([post(["Ergonomics"])])).toEqual(["Ergonomics"]);
        expect(blogLabelsInUse([])).toEqual([]);
    });
});
