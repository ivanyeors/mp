import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlacementBreakdown } from "../placement-breakdown";

const NAMES = new Map([
    [67, "6D S"],
    [68, "6D M"],
    [41, "Ear Comfort Pad"],
]);
const nameOf = (id: number) => NAMES.get(id) ?? `Item #${id}`;

function text(props: Partial<Parameters<typeof PlacementBreakdown>[0]>): string {
    const html = renderToStaticMarkup(
        createElement(PlacementBreakdown, { placements: [], bolster: false, nameOf, open: true, onToggle: () => {}, ...props }),
    );
    return html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
}

describe("PlacementBreakdown", () => {
    it("lists a pillow's nine cells with their pieces in slot order, and a dash for an empty one", () => {
        const out = text({
            placements: [
                { section: "left", sub_section: "middle", slot: 2, item_id: 68 },
                { section: "left", sub_section: "middle", slot: 1, item_id: 41 },
                { section: "center", sub_section: "back", slot: 1, item_id: 67 },
                { section: "right", sub_section: "front", slot: 1, item_id: 999 },
            ],
        });
        expect(out).toContain("|left, middle|Ear Comfort Pad, 6D M|");
        expect(out).toContain("|center, back|6D S|");
        expect(out).toContain("|right, front|Item #999|");
        expect(out).toContain("|center, front|—|");
        expect(out.match(/—/g)).toHaveLength(6);
    });

    it("lists a bolster's one compartment in the order the pieces go in", () => {
        const out = text({
            bolster: true,
            placements: [
                { slot: 3, item_id: 68 },
                { slot: 1, item_id: 67 },
                { slot: 2, item_id: 67 },
            ],
        });
        expect(out).toContain("|Compartment|6D S, 6D S, 6D M|");
        expect(out).not.toContain("left");
    });

    it("shows nothing for a build with no placements", () => {
        expect(text({})).toBe("");
        expect(text({ bolster: true })).toBe("");
    });
});
