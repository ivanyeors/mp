export const LANGUAGE_PREFERENCES = ["english", "mandarin", "none"] as const;

export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

const STAFF_LABELS: Record<Exclude<LanguagePreference, "none">, string> = {
  english: "English",
  mandarin: "Mandarin",
};

export function parseLanguagePreference(value: unknown): LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
    ? (value as LanguagePreference)
    : "none";
}

export function languagePreferenceNotes(pref: LanguagePreference): string[] {
  return pref === "none" ? [] : [`Language preference: ${STAFF_LABELS[pref]}`];
}
