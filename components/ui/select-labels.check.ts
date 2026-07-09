/**
 * Run: npx tsx components/ui/select-labels.check.ts
 */
import assert from "node:assert/strict";
import * as React from "react";
import {
  collectSelectItemLabels,
  flattenChildrenToLabel,
  resolveSelectDisplay,
  selectItemLabel,
} from "./select-labels";

assert.equal(flattenChildrenToLabel(["Basic", " (inactive)"]), "Basic (inactive)");
assert.equal(
  selectItemLabel({
    value: "21",
    children: React.createElement(React.Fragment, null, "Foo", " (inactive)"),
  }),
  "Foo (inactive)",
);

function SelectItemStub(props: { value: string; textValue?: string; children?: React.ReactNode }) {
  return React.createElement("option", props);
}
SelectItemStub.displayName = "SelectItem";

const labels = collectSelectItemLabels(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(SelectItemStub, { value: "" }, "No default configured"),
    React.createElement(SelectItemStub, { value: "21" }, "Premium M Template"),
    React.createElement(
      SelectItemStub,
      { value: "11", textValue: "Basic M Template" },
      React.createElement("div", null, React.createElement("div", null, "Basic M Template")),
    ),
  ),
);

assert.equal(labels[""], "No default configured");
assert.equal(labels["21"], "Premium M Template");
assert.equal(labels["11"], "Basic M Template");
assert.equal(labels["99"], undefined);

assert.equal(resolveSelectDisplay("21", labels, "No default configured"), "Premium M Template");
assert.equal(resolveSelectDisplay("99", labels, "No default configured"), "No default configured");
assert.equal(resolveSelectDisplay("", labels, "Pick one"), "No default configured");
assert.equal(resolveSelectDisplay(undefined, labels, "Pick one"), "Pick one");

// Default Filling Template shape: value set before dropdown opens
const configureLabels = collectSelectItemLabels(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(SelectItemStub, { value: "" }, "No default configured"),
    React.createElement(SelectItemStub, { value: "21" }, "Premium M Default"),
  ),
);
assert.equal(
  resolveSelectDisplay("21", configureLabels, "No default configured"),
  "Premium M Default",
);

// Shopify queue row: chosen_template_id pre-filled
const queueLabels = collectSelectItemLabels(
  React.createElement(
    React.Fragment,
    null,
    React.createElement(SelectItemStub, { value: "" }, "Select template…"),
    React.createElement(SelectItemStub, { value: "11" }, "Basic Pillow M"),
  ),
);
assert.equal(resolveSelectDisplay("11", queueLabels, "Select template…"), "Basic Pillow M");

console.log("select-labels.check.ts ok");
