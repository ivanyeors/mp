export type ToolOption = {
  value: string;
  label: string;
  hint?: string;
};

export type ToolDisplay = { label: string; isPlaceholder: boolean };

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
