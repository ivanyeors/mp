import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RETRO_GRID_BRAND_STOPS, RETRO_GRID_ROWS, RetroGrid, retroGridBrandAt } from "./index";

const PERSPECTIVE = 200;

describe("RetroGrid rows", () => {
  it("hands each row over to the next one without a jump when the loop restarts", () => {
    for (let i = 1; i < RETRO_GRID_ROWS.length; i++) {
      expect(RETRO_GRID_ROWS[i].near).toEqual(RETRO_GRID_ROWS[i - 1].far);
    }
  });

  it("ends the nearest row on the screen edge at natural size", () => {
    expect(RETRO_GRID_ROWS[0].near).toMatchObject({ depth: 0, scale: 1, fromHorizon: 1 });
  });

  it("starts the farthest row invisible, so a new line fades in instead of popping", () => {
    expect(RETRO_GRID_ROWS[RETRO_GRID_ROWS.length - 1].far.alpha).toBe(0);
  });

  it("keeps every line one pixel thick on screen at any depth", () => {
    for (const row of RETRO_GRID_ROWS) {
      for (const end of [row.far, row.near]) {
        expect((end.scale * PERSPECTIVE) / (PERSPECTIVE + end.depth)).toBeCloseTo(1, 10);
      }
    }
  });
});

describe("RetroGrid brand gradient", () => {
  it("runs from the dock's navy at the horizon to the chat's bright blue at the screen edge", () => {
    expect(retroGridBrandAt(0).rgb).toEqual([0, 23, 54]);
    expect(retroGridBrandAt(1).rgb).toEqual([18, 152, 255]);
    expect(RETRO_GRID_BRAND_STOPS.map((stop) => stop.rgb)).toContainEqual([43, 105, 188]);
  });

  it("gets steadily fainter toward the horizon", () => {
    const alphas = [1, 0.8, 0.6, 0.4, 0.2].map((fromHorizon) => retroGridBrandAt(fromHorizon).alpha);
    expect(alphas).toEqual([...alphas].sort((a, b) => b - a));
    expect(alphas[alphas.length - 1]).toBe(0);
  });
});

describe("RetroGrid markup", () => {
  const html = renderToStaticMarkup(<RetroGrid />);

  it("draws lines only: no canvas for particles or a script-driven loop", () => {
    expect(html).not.toContain("<canvas");
    expect(html.match(/retro-grid-row/g)).toHaveLength(RETRO_GRID_ROWS.length * 2);
  });

  it("strokes the converging lines with the brand gradient", () => {
    expect(html).toContain('stroke="url(#retro-grid-brand)"');
    expect(html).toContain('stop-color="rgb(18 152 255)"');
  });

  it("speeds the rows up and reverses them for step transitions", () => {
    expect(html).not.toContain("--retro-grid-duration");
    expect(renderToStaticMarkup(<RetroGrid speed="fast" />)).toContain("--retro-grid-duration:0.4s");
    expect(renderToStaticMarkup(<RetroGrid speed="reverse" />)).toContain("--retro-grid-direction:reverse");
  });
});
