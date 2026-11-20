import assert from "node:assert/strict";
import { toolDisplay, type ToolOption } from "./staff-toolbox-display";

const sizes: ToolOption[] = [
  { value: "S", label: "S" },
  { value: "M", label: "M" },
];

assert.deepEqual(toolDisplay("M", sizes), { label: "M", isPlaceholder: false });

assert.deepEqual(toolDisplay("", sizes, "Size…"), { label: "Size…", isPlaceholder: true });

assert.deepEqual(toolDisplay("42", sizes, "Size…"), { label: "Size…", isPlaceholder: true });

assert.deepEqual(toolDisplay("7", [], "No templates for this size"), {
  label: "No templates for this size",
  isPlaceholder: true,
});

console.log("staff-toolbox-display.check.ts ok");
