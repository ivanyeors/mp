import Link from "next/link";
import { Mail, Plus } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/admin";
import { hasPermission } from "@/lib/auth/permissions";
import { EmailsNav } from "@/components/settings/emails-nav";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { keepSendingStatus } from "@/lib/email-campaigns/keep-sending";
import { CAMPAIGN_AUDIENCE_LABEL } from "@/lib/email-campaigns/rules";
import { readSendingStatus, type SendingStatus } from "@/lib/email-campaigns/sender";
import { campaignSenderSetup } from "@/lib/email-campaigns/setup";
import { listCampaigns, type CampaignListItem } from "@/lib/email-campaigns/store";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SendingStatusCard } from "./sending-status-card";

export const runtime = "nodejs";

/** Draft until the first wave; then the number handed to the provider. */
function statusOf({ campaign, stats }: CampaignListItem): { label: string; variant: "secondary" | "default" | "outline" } {
    if (!campaign.lockedAt) return { label: "Draft", variant: "outline" };
    if (stats.handed === 0) return { label: "Started", variant: "secondary" };
    return { label: `Sent to ${stats.handed.toLocaleString("en-SG")}`, variant: "default" };
}

/** Kept sending (PRD-campaign-audiences slice 10): a badge beside the status, or nothing. */
function KeepSendingBadge({ item }: { item: CampaignListItem }) {
    const kept = keepSendingStatus(item.campaign.keepSending);
    if (!kept) return null;
    return (
        <Badge variant="outline" className={kept.tone === "paused" ? "border-amber-500 text-amber-700 dark:text-amber-400" : undefined}>
            {kept.label}
        </Badge>
    );
}

/**
 * Admin Panel → Email campaigns (PRD-email-marketing): the Sending card
 * (PRD-campaign-send-flow slice 02), then every campaign, newest first, with
 * its numbers. Guarded by `campaigns`, which Owner and Admin hold.
 */
export default async function EmailCampaignsPage({ params }: { params: Promise<{ lang: string }> }) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const ctx = await requireAdminPage("campaigns", locale);
    const to = (href: string) => withLocale(href, locale);

    let items: CampaignListItem[] = [];
    let error: string | null = null;
    const setup = campaignSenderSetup();
    const [listed, status] = await Promise.all([
        listCampaigns(supabaseAdmin()).catch((err: unknown) => err instanceof Error ? err : new Error(String(err))),
        readSendingStatus(setup).catch((): SendingStatus | null => null),
    ]);
    if (listed instanceof Error) error = listed.message;
    else items = listed;

    return (
        <div className="space-y-6">
            <EmailsNav
                current="campaigns"
                campaignsHref={to("/settings/campaigns")}
                templatesHref={hasPermission(ctx, "email-templates") ? to("/settings/email-templates") : null}
            />
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Email campaigns</h1>
                    <InfoTip label="About email campaigns">
                        <p>
                            Write it, test it on yourself, then send it in waves. Only customers
                            who agreed to marketing email get it, and nobody gets it twice.
                        </p>
                        <p>
                            Every email has an unsubscribe link. Addresses that bounce or report
                            spam are left out of later campaigns.
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

            <SendingStatusCard
                status={status}
                origin={setup.origin}
                keptSending={items.filter((i) => i.campaign.keepSending?.on && !i.campaign.keepSending.pausedAt).length}
            />

            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : items.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                        <Mail className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p className="max-w-md text-sm text-muted-foreground">
                            No campaigns yet. Start with the one written for your Shopify
                            customers: read it, test it, then send it.
                        </p>
                        <Button asChild>
                            <Link href={to("/settings/campaigns/new")}>Write your first campaign</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    <MobileList>
                        {items.map((item) => {
                            const status = statusOf(item);
                            return (
                                <MobileListRow key={item.campaign.id} href={to(`/settings/campaigns/${item.campaign.id}`)}>
                                    <span className="block break-words font-medium">{item.campaign.name}</span>
                                    <span className="block break-words text-xs text-muted-foreground">{item.campaign.subject}</span>
                                    <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                        <Badge variant={status.variant}>{status.label}</Badge>
                                        <KeepSendingBadge item={item} />
                                        {item.campaign.lockedAt ? (
                                            <span className="tabular-nums">
                                                Clicked {item.stats.clicked} · unsubscribed {item.stats.unsubscribed} · bounced{" "}
                                                {item.stats.bounced} · spam {item.stats.complained}
                                            </span>
                                        ) : null}
                                    </span>
                                </MobileListRow>
                            );
                        })}
                    </MobileList>
                    <Card className="max-md:hidden">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Campaign</TableHead>
                                        <TableHead className="hidden md:table-cell">Audience</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Clicked</TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Unsubscribed</TableHead>
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
                                                    <span className="flex flex-wrap items-center gap-1.5">
                                                        <Badge variant={status.variant}>{status.label}</Badge>
                                                        <KeepSendingBadge item={item} />
                                                    </span>
                                                </TableCell>
                                                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                                    {item.stats.clicked}
                                                </TableCell>
                                                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                                                    {item.stats.unsubscribed}
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
                </>
            )}
        </div>
    );
}
