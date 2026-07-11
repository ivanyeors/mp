import type { Locale } from "@/lib/i18n/locales";

/** site_settings key for the Discovery source option catalog JSON. */
export const DISCOVERY_SOURCE_SETTING_KEY = "forms_discovery_source";

/** Fixed system option id — always present, always last for visitors. */
export const OTHER_DISCOVERY_SOURCE_ID = "other";

export type DiscoverySourceLabels = Record<Locale, string>;

export type DiscoverySourceOption = {
  id: string;
  labels: DiscoverySourceLabels;
  active: boolean;
  /** System options cannot be deleted or archived. */
  system?: boolean;
};

export type DiscoverySourceCatalog = {
  options: DiscoverySourceOption[];
};

export type DiscoverySourceInput = {
  discoverySource: string | null | undefined;
  discoverySourceOther?: string | null | undefined;
};

export type DiscoverySourceField = "discoverySource" | "discoverySourceOther";

export type DiscoverySourceValidationError = {
  field: DiscoverySourceField;
  message: string;
};
