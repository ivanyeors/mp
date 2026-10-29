import { describe, expect, it } from "vitest";

import { languagePreferenceNotes, parseLanguagePreference } from "@/lib/appointments/language";

describe("language preference", () => {
  it("names the language on the event Staff assign from", () => {
    expect(languagePreferenceNotes("english")).toEqual(["Language preference: English"]);
    expect(languagePreferenceNotes("mandarin")).toEqual(["Language preference: Mandarin"]);
  });

  it("adds nothing when the guest has no preference", () => {
    expect(languagePreferenceNotes("none")).toEqual([]);
  });

  it("reads absent or unknown metadata as no preference", () => {
    expect(parseLanguagePreference("mandarin")).toBe("mandarin");
    expect(parseLanguagePreference(undefined)).toBe("none");
    expect(parseLanguagePreference("klingon")).toBe("none");
  });
});
