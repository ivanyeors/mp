import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { OwnFittingsCard } from "../fittings-card";
import type { FittingAnswersView } from "@/lib/fitting-import/view";

/** The markup's text, without the markers React puts between text nodes. */
const render = (el: React.ReactElement) => renderToString(el).replaceAll("<!-- -->", "");

/**
 * Profile → Fitting history (ADR 0042 h): the customer's own answers in the
 * Staff card's layout, with no photo, preview or Drive link. Made-up data.
 */

const fitting = (over: Partial<FittingAnswersView> = {}): FittingAnswersView => ({
  id: "0e000000-0000-4000-8000-0000000000c2",
  fittedAt: "2025-11-03T06:15:00.000Z",
  shoulderLengthIn: 18,
  neckToBackIn: 2.5,
  headToBackIn: 0,
  neckLengthIn: null,
  recommendedSize: "M",
  configurationType: "T12",
  profileSide: "M-LN",
  sleeperType: "Side & Back sleeper",
  sleepSymptoms: ["Neck pain", "Snoring"],
  bloodPressure: "Normal",
  acidReflux: false,
  earDiscomfortSideSleep: null,
  bedFirmness: "Medium Firm",
  usesBolster: true,
  ageGroup: "35-39",
  gender: "Female",
  discoverySource: "Instagram",
  referredBy: null,
  servicedBy: "Sophie",
  notes: "Prefers the neck a little lower.",
  otherAnswers: [["Pillow height today", "Two fingers"]],
  ...over,
});

describe("OwnFittingsCard", () => {
  it("shows the newest fitting open with its measurements, answers, notes and other answers", () => {
    const html = render(
      <OwnFittingsCard fittings={[fitting(), fitting({ id: "0e000000-0000-4000-8000-0000000000c1", fittedAt: "2024-05-01T03:00:00.000Z", recommendedSize: "S" })]} />,
    );
    expect(html).toContain("Fitting history");
    expect(html).toContain("each of your 2 in-store fittings");
    expect(html).toContain("Mpillow M · T12 · M-LN");
    expect(html).toContain("3 November 2025 · Serviced by Sophie");
    expect(html).toContain("1 May 2024");
    for (const shown of ["18 in", "2.5 in", "0 in", "Neck pain, Snoring", "Normal", "Medium Firm", "35-39", "Instagram", "Prefers the neck a little lower.", "Pillow height today", "Two fingers"]) {
      expect(html).toContain(shown);
    }
  });

  it("marks the newest of several visits Latest and shows each changed measurement's value at the visit before", () => {
    const html = render(
      <OwnFittingsCard
        fittings={[
          fitting({ shoulderLengthIn: 18.5, neckToBackIn: 2.5, headToBackIn: 0.5 }),
          fitting({ id: "0e000000-0000-4000-8000-0000000000c1", fittedAt: "2024-05-01T03:00:00.000Z", shoulderLengthIn: 18, headToBackIn: null }),
        ]}
      />,
    );
    expect(html.match(/>Latest</g)).toHaveLength(1);
    expect(html).toContain("18.5 in");
    expect(html).toContain("was 18 in");
    // Unchanged (2.5 both times), or nothing to compare with (C was not taken before): no "was".
    expect(html).not.toContain("was 2.5 in");
    expect(html.match(/was \d/g)).toHaveLength(1);
    expect(html).toContain("where one changed, you can see what it was the visit before");
  });

  it("shows no Latest tag or earlier values for a single visit", () => {
    const html = render(<OwnFittingsCard fittings={[fitting()]} />);
    expect(html).not.toContain(">Latest<");
    expect(html).not.toMatch(/was \d/);
  });

  it("has no photo, preview or Drive link, and nothing about the import", () => {
    const html = render(<OwnFittingsCard fittings={[fitting()]} />);
    expect(html).toContain("What we recorded at your in-store fitting. Measurements are in inches.");
    expect(html).not.toMatch(/<img|drive|Photos and forms|\/api\/settings|Matched by|On the form:/i);
  });
});
