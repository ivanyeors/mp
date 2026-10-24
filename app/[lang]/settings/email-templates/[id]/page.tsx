import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/admin";
import { editableEmail, groupLabel, readSavedCopy, type SavedCopy } from "@/lib/email/copy-admin";
import { defaultEmailCopy } from "@/lib/email/copy";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { supabaseAdmin } from "@/lib/supabase/server";
import { EmailCopyEditor } from "../email-copy-editor";

export const runtime = "nodejs";

/** One email's words: edit, preview each version, test, save or reset (PRD-email-templates). */
export default async function EmailTemplatePage({ params }: { params: Promise<{ lang: string; id: string }> }) {
    const { lang, id } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("email-templates", locale);
    const email = editableEmail(decodeURIComponent(id));
    if (!email) notFound();

    let saved: SavedCopy;
    let readError: string | null = null;
    try {
        saved = await readSavedCopy(supabaseAdmin(), email.spec);
    } catch (err) {
        readError = err instanceof Error ? err.message : String(err);
        saved = { copy: defaultEmailCopy(email.spec), edited: [], updatedAt: null, updatedBy: null };
    }

    return (
        <EmailCopyEditor
            spec={email.spec}
            groupLabel={groupLabel(email.group)}
            variants={email.variants}
            saved={saved}
            readError={readError}
            staffEmail={ctx.email}
        />
    );
}
