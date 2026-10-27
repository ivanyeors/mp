import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { EmailsNav } from "@/components/settings/emails-nav";
import { editableEmails, groupLabel, readAllSavedCopy, type SavedCopy } from "@/lib/email/copy-admin";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Admin Panel → Email templates (PRD-email-templates): every email the
 * platform sends whose words Staff can change, by kind, with what was edited.
 * Guarded by `email-templates`, which Owner and Admin hold.
 */
export default async function EmailTemplatesPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("email-templates", locale);
    const to = (href: string) => withLocale(href, locale);

    const emails = editableEmails();
    let saved: Map<string, SavedCopy> | null = null;
    let error: string | null = null;
    try {
        saved = await readAllSavedCopy(supabaseAdmin());
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    }

    const groups = [...new Set(emails.map((e) => e.group))];

    return (
        <div className="space-y-6">
            <EmailsNav
                current="templates"
                campaignsHref={hasPermission(ctx, "campaigns") ? to("/settings/campaigns") : null}
                templatesHref={to("/settings/email-templates")}
            />
            <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
                <InfoTip label="About email templates">
                    <p>
                        The wording of every email customers and partners get: subjects, headings, messages and
                        buttons. An edit applies to every later email of that kind.
                    </p>
                    <p>
                        Order details, amounts, addresses and links are fixed, so an edit can&apos;t break an
                        email. You can always restore the original words.
                    </p>
                </InfoTip>
            </div>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}

            {groups.map((group) => (
                <Card key={group}>
                    <CardHeader>
                        <CardTitle className="text-base">{groupLabel(group)}</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y p-0">
                        {emails
                            .filter((e) => e.group === group)
                            .map((e) => {
                                const s = saved?.get(e.spec.id);
                                const edited = (s?.edited.length ?? 0) > 0;
                                return (
                                    <Link
                                        key={e.spec.id}
                                        href={to(`/settings/email-templates/${e.spec.id}`)}
                                        className="flex flex-col gap-1 px-6 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <span className="min-w-0">
                                            <span className="font-medium">{e.spec.name}</span>
                                            <span className="block text-xs text-muted-foreground">{e.spec.description}</span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                            {edited ? (
                                                <>
                                                    <Badge>Edited</Badge>
                                                    {s?.updatedAt ? (
                                                        <span>
                                                            {formatAdminDateTime(s.updatedAt)}
                                                            {s.updatedBy ? ` by ${s.updatedBy}` : ""}
                                                        </span>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <Badge variant="outline">Original words</Badge>
                                            )}
                                        </span>
                                    </Link>
                                );
                            })}
                    </CardContent>
                </Card>
            ))}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Not edited here</CardTitle>
                    <CardDescription>
                        <span className="block">Sign-in code emails: Supabase sends them, from the templates in its dashboard.</span>
                        <span className="block">Campaigns: each one is written on Email campaigns.</span>
                        <span className="block">Staff notices: support messages, review reminders and invitations to the Admin Panel.</span>
                        <span className="block">The old Shopify-move emails: being retired.</span>
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    );
}
