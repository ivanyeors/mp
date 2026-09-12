/**
 * Run: npx tsx components/configurator/staff-toolbox-display.check.ts
 */
import assert from "node:assert/strict";
import { toolDisplay, type ToolOption } from "./staff-toolbox-display";

const sizes: ToolOption[] = [
  { value: "S", label: "S" },
  { value: "M", label: "M" },
];

assert.deepEqual(toolDisplay("M", sizes), { label: "M", isPlaceholder: false });

// Nothing selected yet → placeholder, styled as such.
assert.deepEqual(toolDisplay("", sizes, "Size…"), { label: "Size…", isPlaceholder: true });

// Stale value (template deleted, or size changed under the picker) → placeholder,
// never a blank chip.
assert.deepEqual(toolDisplay("42", sizes, "Size…"), { label: "Size…", isPlaceholder: true });

// Empty catalog: the caller passes the "none for this size" copy as placeholder.
assert.deepEqual(toolDisplay("7", [], "No templates for this size"), {
  label: "No templates for this size",
  isPlaceholder: true,
});

console.log("staff-toolbox-display.check.ts ok");
