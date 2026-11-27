import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BuyFlowBarTotal,
  BuyFlowChoice,
  BuyFlowSection,
  BuyFlowSummary,
  BuyFlowSummaryRow,
} from "./buy-flow";

const heading = renderToStaticMarkup(
  createElement(BuyFlowSection, { id: "length", lead: "Length.", rest: "Sized to your height." }, "body"),
);
assert.match(heading, /<section data-buy-flow-section="length"/, "a section names itself for the order check");
assert.match(
  heading,
  /<h3[^>]*><span class="font-semibold">Length\.<\/span> <span class="text-muted-foreground">Sized to your height\.<\/span><\/h3>/,
  "the heading is a bold lead and a quiet sentence in one line",
);

const choice = renderToStaticMarkup(
  createElement(BuyFlowChoice, { title: "Medium", detail: "Recommended for 168 cm", trailing: "SGD 190.00" }),
);
assert.match(choice, /border-2 border-primary/, "the chosen option carries the selected ring");
assert.match(choice, /Medium[\s\S]*Recommended for 168 cm[\s\S]*SGD 190\.00/);
assert.doesNotMatch(
  renderToStaticMarkup(createElement(BuyFlowChoice, { title: "Medium" })),
  /tabular-nums/,
  "no price slot when there is no price",
);

const summary = renderToStaticMarkup(
  createElement(
    BuyFlowSummary,
    null,
    createElement(BuyFlowSummaryRow, { label: "Case", value: "Camel" }),
    createElement(BuyFlowSummaryRow, { tone: "saving", label: "Discount", value: "−SGD 10.00" }),
    createElement(BuyFlowSummaryRow, { tone: "total", label: "Total", value: "SGD 180.00" }),
  ),
);
assert.match(summary, /text-emerald-700[^"]*"[^>]*><span class="min-w-0">Discount/, "a saving reads green");
assert.match(summary, /border-t pt-3 text-base font-semibold[^>]*><span class="min-w-0">Total/, "the total closes the card");

const bar = renderToStaticMarkup(
  createElement(BuyFlowBarTotal, { label: "Total, before tax", amount: "SGD 190.00", className: "md:hidden" }),
);
assert.match(bar, /data-buy-flow-bar-total=""/);
assert.match(bar, /md:hidden/);
assert.match(bar, /whitespace-nowrap[^>]*>SGD 190\.00/, "the amount never wraps in the pinned bar");

const client = readFileSync(
  join(process.cwd(), "app/[lang]/mbolster-config/mbolster-config-client.tsx"),
  "utf8",
);
const preview = client.slice(client.indexOf('if (state.step === "preview") {'), client.indexOf("<RetroGrid"));

const ORDER = ["length", "filling", "case", "addons", "details", "delivery", "summary"];
const positions = ORDER.map((id) => preview.search(new RegExp(`<BuyFlowSection\\s+id="${id}"`)));
positions.forEach((at, i) => assert.ok(at > 0, `the ${ORDER[i]} section is on the Mbolster screen`));
assert.deepEqual(
  [...positions].sort((a, b) => a - b),
  positions,
  `sections run ${ORDER.join(" → ")}, closing on the summary`,
);
assert.equal(
  preview.match(/<BuyFlowSection\b/g)?.length,
  ORDER.length,
  "every section on the screen is in the order above",
);

assert.match(preview, /data-typography-scope="app"/, "the screen sets its own type sizes");
assert.match(preview, /"dark relative bg-card text-foreground /, "the bolster sits on a dark media card in both themes");
assert.match(preview, /lg:hidden">\{previewTitle\}<\/div>/, "on a phone the title leads, above the media card");
assert.match(preview, /max-lg:hidden">\{previewTitle\}<\/div>/, "on desktop the title leads the options column");

assert.match(preview, /<PreviewContactFields\s+hideTitle/, "the section heading replaces the fields' own title");
assert.match(preview, /<HoldShippingFields\s+hideTitle/, "the section heading replaces the fields' own title");
assert.match(preview, /caseOnly\s+hideNav\s+hideCaseTitle/, "the section heading replaces the case picker's own title");
assert.match(preview, /hideCaseTitle\s+caseSwatches/, "a case with a colour shows it as a swatch");

assert.match(
  preview,
  /<BuyFlowSummaryRow tone="total" label=\{totalLabel\} value=\{totalText\} \/>/,
  "the summary closes on the total",
);
const barTotals = preview.match(/<BuyFlowBarTotal[\s\S]*?\/>/g) ?? [];
assert.equal(barTotals.length, 2, "the pinned bar carries a total with and without an Mpillow");
for (const tag of barTotals) {
  assert.match(tag, /amount=\{totalText\}/, "the pinned bar shows the same total as the summary");
  assert.match(tag, /className="md:hidden"/, "the bar total is a phone element");
}
assert.equal(
  preview.match(/onClick=\{backFromPreview\} className="flex-1 max-md:hidden"/g)?.length,
  2,
  "on a phone the bar gives Back's place to the total; the header arrow goes back",
);
assert.match(preview, /onClick=\{backFromPreview\}\s+aria-label="Back"/, "the header arrow that takes Back's place");

assert.doesNotMatch(preview, /Customize finish/, "the old flat form heading is gone");

for (const [file, prop] of [
  ["components/configurator/preview-contact-fields.tsx", "hideTitle = false"],
  ["components/shop/hold-shipping-fields.tsx", "hideTitle = false"],
  ["components/shop/customization-steps.tsx", "hideCaseTitle = false"],
  ["components/shop/customization-steps.tsx", "caseSwatches = false"],
] as const) {
  assert.ok(
    readFileSync(join(process.cwd(), file), "utf8").includes(prop),
    `${file} keeps its title unless a host asks: the Mpillow screen is unchanged`,
  );
}

console.log("buy-flow.check.ts: ok");
