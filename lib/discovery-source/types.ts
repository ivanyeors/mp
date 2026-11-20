import type { Locale } from "@/lib/i18n/locales";

export const DISCOVERY_SOURCE_SETTING_KEY = "forms_discovery_source";

export const OTHER_DISCOVERY_SOURCE_ID = "other";

export type DiscoverySourceLabels = Record<Locale, string>;

export type DiscoverySourceOption = {
  id: string;
  labels: DiscoverySourceLabels;
  active: boolean;
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
