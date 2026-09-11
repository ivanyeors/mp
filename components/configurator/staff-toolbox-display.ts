/**
 * Pure display logic for the Staff toolbox rail, split out so it can be
 * checked without React (same split as sunburst-menu-layout.ts).
 */

export type ToolOption = {
  value: string;
  /** Shown in the chip when selected, and on the option pill. */
  label: string;
  /** Optional second line in list layout (e.g. a template's size scope). */
  hint?: string;
};

export type ToolDisplay = { label: string; isPlaceholder: boolean };

/**
 * What a tool chip reads when collapsed: the selected option's label, or the
 * placeholder when nothing is selected, the value is stale, or there is
 * nothing to pick.
 */
export function toolDisplay(
  value: string,
  options: readonly ToolOption[],
  placeholder = "Select…",
): ToolDisplay {
  const hit = options.find((o) => o.value === value);
  return hit
    ? { label: hit.label, isPlaceholder: false }
    : { label: placeholder, isPlaceholder: true };
}
