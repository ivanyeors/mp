import {
  activeDiscoverySourceOptions,
  findDiscoverySourceOption,
} from "./catalog";
import {
  OTHER_DISCOVERY_SOURCE_ID,
  type DiscoverySourceCatalog,
  type DiscoverySourceInput,
  type DiscoverySourceValidationError,
} from "./types";

export const OTHER_TEXT_MIN_LENGTH = 2;

export function validateDiscoverySource(
  input: DiscoverySourceInput,
  catalog: DiscoverySourceCatalog,
  opts?: { otherMinLength?: number },
): DiscoverySourceValidationError | null {
  const minLen = opts?.otherMinLength ?? OTHER_TEXT_MIN_LENGTH;
  const id =
    typeof input.discoverySource === "string"
      ? input.discoverySource.trim()
      : "";

  if (!id) {
    return { field: "discoverySource", message: "Select how you heard about us" };
  }

  const active = activeDiscoverySourceOptions(catalog);
  const allowed = active.find((o) => o.id === id);
  if (!allowed) {
    const known = findDiscoverySourceOption(catalog, id);
    return {
      field: "discoverySource",
      message: known
        ? "This option is no longer available"
        : "Invalid discovery source",
    };
  }

  if (id === OTHER_DISCOVERY_SOURCE_ID) {
    const text =
      typeof input.discoverySourceOther === "string"
        ? input.discoverySourceOther.trim()
        : "";
    if (text.length < minLen) {
      return {
        field: "discoverySourceOther",
        message: "Please tell us how you found us",
      };
    }
  }

  return null;
}

export function normalizeDiscoverySourceOther(
  discoverySource: string,
  discoverySourceOther: string | null | undefined,
): string | null {
  if (discoverySource !== OTHER_DISCOVERY_SOURCE_ID) return null;
  const text =
    typeof discoverySourceOther === "string" ? discoverySourceOther.trim() : "";
  return text || null;
}
