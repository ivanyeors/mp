import type { RichTextVariable } from "@/components/block-editor/rich-text-doc";
import { placeholderLabel, type CopyField, type EmailCopySpec } from "@/lib/email/copy";

export function copyVariables(spec: EmailCopySpec): RichTextVariable[] {
    return Object.entries(spec.placeholders).map(([key, description]) => ({ key, label: placeholderLabel(key), description }));
}

export const isLong = (f: CopyField) => Boolean(f.multiline) || f.default.length > 80;

export const isOneLine = (f: CopyField) => !f.multiline;
