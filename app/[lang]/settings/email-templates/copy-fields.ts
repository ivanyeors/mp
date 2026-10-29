import type { RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { placeholderLabel, type CopyField, type EmailCopySpec } from "@/lib/email/copy";

/**
 * How an Email template's fields are edited (PRD-campaign-email-editor slice
 * 14): each is the shared text input in plain mode, offering the email's own
 * placeholders as Variables. A field is still a string with `{order_number}`
 * in it: `richTextFromWords` loads it as chips and `richTextWords` writes it
 * back as it was. Pure, so the round trip is tested over every email.
 */

/** Pure — the email's placeholders as the Variables its fields offer: a chip each, with what it becomes as its title. */
export function copyVariables(spec: EmailCopySpec): RichTextVariable[] {
    return Object.entries(spec.placeholders).map(([key, description]) => ({ key, label: placeholderLabel(key), description }));
}

/** A field gets a taller box when it is several paragraphs, or long. */
export const isLong = (f: CopyField) => Boolean(f.multiline) || f.default.length > 80;

/** Only a field of paragraphs takes a new line; any other is one line of words, however long it wraps. */
export const isOneLine = (f: CopyField) => !f.multiline;
