/**
 * Whether a page offers ✨ (PRD-campaign-email-editor slices 09 and 16), in
 * the words it shows. Pure and tiny: the campaign editor's first load reads
 * it, without the settings' schemas (writing-settings.ts).
 */

/**
 * What a page that offers ✨ knows, read on the server: AI writing switched
 * on (General → AI writing), and Claude's credentials set. Off hides every ✨
 * button; on without credentials shows why instead.
 */
export interface AiWritingAvailability {
  on: boolean;
  configured: boolean;
}

/** What the editor says in place of a ✨ button when the credentials aren't set (`claudeConfigured()`). */
export const AI_WRITING_NO_CREDENTIALS = "AI writing is off: add the Claude API key on General";

/** An AI call refused because the owner switched AI writing off on General. */
export const AI_WRITING_SWITCHED_OFF = "AI writing is switched off on General.";
