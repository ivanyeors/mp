import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { EmailsNav } from "@/components/settings/emails-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CAMPAIGN_AUDIENCE_LABEL } from "@/lib/email-campaigns/rules";
import { listCampaigns, type CampaignListItem } from "@/lib/email-campaigns/store";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Draft until the first wave; then the number handed to the provider. */
function statusOf({ campaign, stats }: CampaignListItem): { label: string; variant: "secondary" | "default" | "outline" } {
    if (!campaign.lockedAt) return { label: "Draft", variant: "outline" };
    if (stats.handed === 0) return { label: "Started", variant: "secondary" };
    return { label: `Sent to ${stats.handed.toLocaleString("en-SG")}`, variant: "default" };
}

/**
 * Admin Panel → Email campaigns (PRD-email-marketing): every campaign, newest
 * first, with its numbers. Guarded by `campaigns`, which Owner and Admin hold.
 */
export default async function EmailCampaignsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);
    const to = (href: string) => withLocale(href, locale);

    let items: CampaignListItem[] = [];
    let error: string | null = null;
    try {
        items = await listCampaigns(supabaseAdmin());
    } catch (err) {
        error = err instanceof Error ? err.message : String(err);
    }

    return (
        <div className="space-y-6">
            <EmailsNav
                current="campaigns"
                campaignsHref={to("/settings/campaigns")}
                templatesHref={hasPermission(ctx, "email-templates") ? to("/settings/email-templates") : null}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Email campaigns</h1>
                    <InfoTip label="About email campaigns">
                        <p>
                            Write an email, send yourself a test, then send it in waves. Only
                            customers who agreed to marketing email receive it, and nobody gets
                            the same campaign twice.
                        </p>
                        <p>
                            Every email has an unsubscribe link. Anyone whose email bounces or who
                            marks one as spam is left out of every later campaign.
                        </p>
                    </InfoTip>
                </div>
                <Button asChild>
                    <Link href={to("/settings/campaigns/new")}>
                        <Plus className="mr-1 h-4 w-4" />
                        New campaign
                    </Link>
                </Button>
            </div>

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : items.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <Mail className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="max-w-md text-sm text-muted-foreground">
                            No campaigns yet. Start with the one for your Shopify customers: it is
                            written for you, so you can read it, test it and send it.
                        </p>
                        <Button asChild>
                            <Link href={to("/settings/campaigns/new")}>Write your first campaign</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Campaign</TableHead>
                                    <TableHead className="hidden md:table-cell">Audience</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="hidden text-right sm:table-cell">Bounced</TableHead>
                                    <TableHead className="hidden text-right sm:table-cell">Spam</TableHead>
                                    <TableHead className="hidden text-right lg:table-cell">Sign-in clicks</TableHead>
                                    <TableHead className="hidden lg:table-cell">Last sent</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((item) => {
                                    const status = statusOf(item);
                                    return (
                                        <TableRow key={item.campaign.id}>
                                            <TableCell>
                                                <Link
                                                    href={to(`/settings/campaigns/${item.campaign.id}`)}
                                                    className="font-medium hover:underline"
                                                >
                                                    {item.campaign.name}
                                                </Link>
                                                <p className="text-xs text-muted-foreground">{item.campaign.subject}</p>
                                            </TableCell>
                                            <TableCell className="hidden text-sm md:table-cell">
                                                {CAMPAIGN_AUDIENCE_LABEL[item.campaign.audience]}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={status.variant}>{status.label}</Badge>
                                            </TableCell>
                                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                                {item.stats.bounced}
                                            </TableCell>
                                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                                {item.stats.complained}
                                            </TableCell>
                                            <TableCell className="hidden text-right tabular-nums lg:table-cell">
                                                {item.stats.linkClicks}
                                            </TableCell>
                                            <TableCell className="hidden text-sm lg:table-cell">
                                                {item.stats.lastSentAt ? formatAdminDateTime(item.stats.lastSentAt) : "—"}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
