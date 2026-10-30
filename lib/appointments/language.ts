/**
 * The language a guest would like their in-store visit in. Staff read it on the
 * calendar event and try to assign someone comfortable with it — a preference,
 * never a promise. Nothing is stored apart from the event: a Customisation
 * appointment has no row, and a paid Re-adjustment carries it to the webhook in
 * its Checkout metadata.
 */

export const LANGUAGE_PREFERENCES = ["english", "mandarin", "none"] as const;

export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

const STAFF_LABELS: Record<Exclude<LanguagePreference, "none">, string> = {
  english: "English",
  mandarin: "Mandarin",
};

/** Anything outside the list (absent, stale metadata) reads as no preference. */
export function parseLanguagePreference(value: unknown): LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
    ? (value as LanguagePreference)
    : "none";
}

/** The calendar description line Staff assign from; nothing when there is no preference. */
export function languagePreferenceNotes(pref: LanguagePreference): string[] {
  return pref === "none" ? [] : [`Language preference: ${STAFF_LABELS[pref]}`];
}
