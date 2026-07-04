/** Naming helpers for legacy filling → template migration (slice 03). Pure — no I/O. */

export function pillowLegacyFillingTemplateName(size: string, tier: string): string {
  return `${size} - ${tier} - default`;
}

export function bolsterLegacyFillingTemplateName(length: string): string {
  return `${length} - default`;
}
