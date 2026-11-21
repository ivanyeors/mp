import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { WhoIsMeasuring } from "../who-is-measuring";

const profiles = [
  { id: "p-jess", name: "Jess" },
  { id: "p-sam", name: "Sam" },
];
const render = (chosen: string | null) =>
  renderToStaticMarkup(<WhoIsMeasuring profiles={profiles} chosen={chosen} onChosen={() => {}} />);

describe("WhoIsMeasuring", () => {
  it("asks who is measuring, one button per profile", () => {
    const html = render(null);
    expect(html).toContain("Who&#x27;s measuring?");
    expect(html).toContain(">Jess</button>");
    expect(html).toContain(">Sam</button>");
    expect(html).toContain("Pick your name to start.");
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });

  it("marks the one chosen and says the Measurement service is added", () => {
    const html = render("p-sam");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Sam is measuring on this device. The price includes the Measurement service.");
  });
});

describe("the Mpillow start screen on a Staff login", () => {
  const page = readFileSync("app/[lang]/mp-config/page.tsx", "utf8");
  const client = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");

  it("asks only a shared login nobody at the device has chosen on, in its own session", () => {
    expect(page).toMatch(/staffCtx && !liveResultId && !measuring && !partner && !assistStaff/);
    expect(page).toMatch(/const pickMeasurer = measurerProfiles\.length > 1 \? measurerProfiles : null;/);
    expect(page).toMatch(/pickMeasurer=\{pickMeasurer\}/);
  });

  it("holds Get Started, and so the Draft, until someone is named", () => {
    expect(client).toMatch(/disabled=\{askMeasurer && measurer == null\}/);
    expect(client).toMatch(/const handleStart = \(\) => \{\s*if \(askMeasurer && measurer == null\) return;\s*ensureResponseId\(\);/);
    expect(client).toMatch(/const measuredByStaff = measuredByStaffProp \|\| measurer != null;/);
  });

  it("saves the choice as the device's Working as, which the Draft create reads", () => {
    const picker = readFileSync("components/configurator/who-is-measuring.tsx", "utf8");
    expect(picker).toMatch(/fetch\("\/api\/admin\/working-as"/);
    const route = readFileSync("app/api/mp-config/responses/route.ts", "utf8");
    expect(route).toMatch(/const measuring = staff \? await actingProfile\(staff\.memberId\) : null;/);
  });
});
