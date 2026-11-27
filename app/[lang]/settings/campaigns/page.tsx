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
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { keepSendingStatus } from "@/lib/email-campaigns/keep-sending";
import { nextBatchLine } from "@/lib/email-campaigns/progress";
import { readCampaignProgress, type ProgressAnswer } from "@/lib/email-campaigns/progress-server";
import { CAMPAIGN_AUDIENCE_LABEL } from "@/lib/email-campaigns/rules";
import { RESULT_WINDOW_DAYS, formatSgd } from "@/lib/email-campaigns/results";
import { readSendingStatus, type SendingStatus } from "@/lib/email-campaigns/sender";
import { campaignSenderSetup } from "@/lib/email-campaigns/setup";
import { listCampaigns, type CampaignListItem } from "@/lib/email-campaigns/store";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SendingStatusCard } from "./sending-status-card";

export const runtime = "nodejs";

function statusOf({ campaign, stats }: CampaignListItem): { label: string; variant: "secondary" | "default" | "outline" } {
    if (!campaign.lockedAt) return { label: "Draft", variant: "outline" };
    if (stats.handed === 0) return { label: "Started", variant: "secondary" };
    return { label: `Sent to ${stats.handed.toLocaleString("en-SG")}`, variant: "default" };
}

function KeepSendingBadge({ item }: { item: CampaignListItem }) {
    const kept = keepSendingStatus(item.campaign.keepSending);
    if (!kept) return null;
    return (
        <Badge variant="outline" className={kept.tone === "paused" ? "border-amber-500 text-amber-700 dark:text-amber-400" : undefined}>
            {kept.label}
        </Badge>
    );
}

function ProgressSummary({ name, answer }: { name: string; answer: ProgressAnswer | undefined }) {
    if (!answer) return <span className="text-sm text-muted-foreground">—</span>;
    if ("error" in answer) {
        return <span className="block text-xs text-muted-foreground">Could not count who is left: {answer.error}</span>;
    }
    const n = (v: number) => v.toLocaleString("en-SG");
    return (
        <span className="block min-w-44 space-y-1.5">
            <span className="flex items-baseline justify-between gap-3 text-xs tabular-nums">
                <span className="text-foreground">
                    {n(answer.sent)} of {n(answer.total)} sent
                </span>
                <span className="text-muted-foreground">{answer.percent}%</span>
            </span>
            <Progress value={answer.percent} aria-label={`${name}: ${n(answer.sent)} of ${n(answer.total)} sent`} />
            <span className="block text-xs text-muted-foreground">{nextBatchLine(answer)}</span>
        </span>
    );
}

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
    const progress = await readCampaignProgress(supabaseAdmin(), items, {
        now: new Date(),
        dailyLimit: status?.allowance?.limits.daily ?? null,
    });

    return (
        <div className="space-y-6">
            <EmailsNav
                current="campaigns"
                campaignsHref={to("/settings/campaigns")}
                funnelHref={to("/settings/campaigns/funnel")}
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
                                                Clicked {item.stats.clicked} · bought {item.stats.bought} · unsubscribed{" "}
                                                {item.stats.unsubscribed} · bounced {item.stats.bounced} · spam {item.stats.complained}
                                            </span>
                                        ) : null}
                                    </span>
                                    {item.campaign.lockedAt ? (
                                        <span className="mt-2 block">
                                            <ProgressSummary name={item.campaign.name} answer={progress.get(item.campaign.id)} />
                                        </span>
                                    ) : null}
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
                                        <TableHead className="hidden text-right sm:table-cell">
                                            Bought in {RESULT_WINDOW_DAYS} days
                                        </TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Unsubscribed</TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Bounced</TableHead>
                                        <TableHead className="hidden text-right sm:table-cell">Spam</TableHead>
                                        <TableHead className="hidden text-right lg:table-cell">Sign-in clicks</TableHead>
                                        <TableHead className="min-w-52">Progress</TableHead>
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
                                                    {item.stats.bought}
                                                    {item.stats.bought ? (
                                                        <span className="block text-xs text-muted-foreground">{formatSgd(item.stats.boughtTotal)}</span>
                                                    ) : null}
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
                                                <TableCell>
                                                    <ProgressSummary name={item.campaign.name} answer={progress.get(item.campaign.id)} />
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
