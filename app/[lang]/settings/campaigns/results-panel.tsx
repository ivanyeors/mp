import { MousePointerClick, Send, ShoppingBag, ShieldAlert, UserMinus } from "lucide-react";
import { StatTile } from "@/components/settings/stat-tile";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    HOLDOUT_PERCENT,
    RESULT_STAGE_LABEL,
    RESULT_WINDOW_DAYS,
    formatRate,
    formatSgd,
    holdoutVerdict,
    rate,
    type CampaignResults,
    type ResultNumbers,
    type StageResult,
} from "@/lib/email-campaigns/results";
import type { CampaignStats } from "@/lib/email-campaigns/store";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-SG");
const withRate = (count: number, of: number) => `${n(count)} (${formatRate(rate(count, of))})`;

const boughtLine = (r: Pick<ResultNumbers, "bought" | "people" | "boughtTotal">) =>
    `${withRate(r.bought, r.people)}${r.bought ? ` · ${formatSgd(r.boughtTotal)}` : ""}`;

export function CampaignResultsPanel({
    stats,
    results,
    className,
}: {
    stats: CampaignStats | null;
    results: CampaignResults | null;
    className?: string;
}) {
    const s = stats;
    if (!s || (s.handed === 0 && s.heldOut === 0)) {
        return (
            <p className={cn("rounded-lg border border-dashed p-4 text-sm text-muted-foreground", className)}>
                Nothing has been sent yet. Results show here once a wave goes out.
            </p>
        );
    }
    const sent = s.handed;
    return (
        <div className={cn("flex flex-col gap-6", className)}>
            <section aria-labelledby="results-heading" className="space-y-3">
                <div className="flex items-center gap-1.5">
                    <h2 id="results-heading" className="text-base font-semibold">
                        What happened after it was sent
                    </h2>
                    <InfoTip label="How results are counted">
                        <p>
                            Rates are of the people sent it, never of opens: Apple Mail marks nearly every email as
                            opened.
                        </p>
                        <p>
                            Clicks are approximate. A click is counted from a person&apos;s browser, not from a mail
                            filter checking links, and a forwarded email&apos;s clicks count too.
                        </p>
                        <p>
                            A purchase is a paid order with goods in it, made within {RESULT_WINDOW_DAYS} days after
                            the email, less anything refunded. A re-adjustment fee is not a purchase.
                        </p>
                    </InfoTip>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    <StatTile icon={Send} label="Sent" value={n(sent)} hint={s.heldOut ? `${n(s.heldOut)} held out` : undefined} />
                    <StatTile icon={MousePointerClick} label="Clicked" value={n(s.clicked)} hint={formatRate(rate(s.clicked, sent))} />
                    <StatTile icon={UserMinus} label="Unsubscribed" value={n(s.unsubscribed)} hint={formatRate(rate(s.unsubscribed, sent))} />
                    <StatTile icon={ShieldAlert} label="Marked as spam" value={n(s.complained)} hint={formatRate(rate(s.complained, sent))} />
                    <StatTile
                        icon={ShoppingBag}
                        label={`Bought within ${RESULT_WINDOW_DAYS} days`}
                        value={n(s.bought)}
                        hint={`${formatRate(rate(s.bought, sent))}${s.bought ? ` · ${formatSgd(s.boughtTotal)}` : ""} · ${n(s.boughtAfterClick)} after a click`}
                        className="col-span-2 sm:col-span-1"
                    />
                </div>
                <p className="text-sm text-muted-foreground">
                    People buy for many reasons, so not every purchase here came from this email.
                    {results?.holdout ? " The holdout below measures what it added." : ""}
                    {s.counting > 0
                        ? ` Still counting: ${n(s.counting)} of them were sent under ${RESULT_WINDOW_DAYS} days ago, so these can still rise.`
                        : ""}
                </p>
            </section>

            {results === null ? (
                <p role="alert" className="text-sm text-destructive">
                    The results by stage could not be read. Reload the page to try again.
                </p>
            ) : (
                <StageTable rows={results.byStage} />
            )}

            {results?.holdout ? <HoldoutSection holdout={results.holdout} /> : null}
        </div>
    );
}

function StageTable({ rows }: { rows: StageResult[] }) {
    if (rows.length === 0) return null;
    return (
        <section aria-labelledby="by-stage-heading" className="space-y-2">
            <div className="flex items-center gap-1.5">
                <h3 id="by-stage-heading" className="text-sm font-medium">
                    By stage when sent
                </h3>
                <InfoTip label="About stages">
                    <p>
                        Each person&apos;s Lifecycle stage on the day it was sent them. Their stage may have moved since:
                        a New customer who buys again becomes Loyal.
                    </p>
                    <p>{RESULT_STAGE_LABEL.unknown}: sent before stages were kept with each email (31 Oct 2026).</p>
                </InfoTip>
            </div>
            <ul className="divide-y border-y md:hidden">
                {rows.map((r) => (
                    <li key={r.stage} className="space-y-1 py-3 text-sm">
                        <p className="font-medium">
                            {RESULT_STAGE_LABEL[r.stage]} <span className="font-normal text-muted-foreground">· sent {n(r.people)}</span>
                        </p>
                        <p className="tabular-nums text-muted-foreground">
                            Clicked {withRate(r.clicked, r.people)} · unsubscribed {withRate(r.unsubscribed, r.people)} · spam{" "}
                            {withRate(r.complained, r.people)}
                        </p>
                        <p className="tabular-nums">Bought {boughtLine(r)}</p>
                    </li>
                ))}
            </ul>
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Stage when sent</TableHead>
                            <TableHead className="text-right">Sent</TableHead>
                            <TableHead className="text-right">Clicked</TableHead>
                            <TableHead className="text-right">Unsubscribed</TableHead>
                            <TableHead className="text-right">Spam</TableHead>
                            <TableHead className="text-right">Bought within {RESULT_WINDOW_DAYS} days</TableHead>
                            <TableHead className="text-right">Spent</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.stage}>
                                <TableCell className="font-medium">{RESULT_STAGE_LABEL[r.stage]}</TableCell>
                                <TableCell className="text-right tabular-nums">{n(r.people)}</TableCell>
                                <Rated count={r.clicked} of={r.people} />
                                <Rated count={r.unsubscribed} of={r.people} />
                                <Rated count={r.complained} of={r.people} />
                                <Rated count={r.bought} of={r.people} />
                                <TableCell className="text-right tabular-nums">{r.bought ? formatSgd(r.boughtTotal) : "—"}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </section>
    );
}

function Rated({ count, of }: { count: number; of: number }) {
    return (
        <TableCell className="text-right tabular-nums">
            {n(count)} <span className="text-muted-foreground">({formatRate(rate(count, of))})</span>
        </TableCell>
    );
}

function HoldoutSection({ holdout }: { holdout: NonNullable<CampaignResults["holdout"]> }) {
    const { heldOut, sent, difference } = holdout;
    return (
        <section aria-labelledby="holdout-heading" className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-1.5">
                <h3 id="holdout-heading" className="text-sm font-medium">
                    Did it bring people back? The holdout
                </h3>
                <InfoTip label="About the holdout">
                    <p>
                        While the holdout is on, {HOLDOUT_PERCENT}% of the people this campaign would send to are kept
                        back, chosen the same way every time. They never get it. Comparing what they bought with what
                        the people sent it in the same weeks bought shows what the email added.
                    </p>
                    <p>A difference is called clear only when it is bigger than chance would make it 19 times in 20.</p>
                </InfoTip>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <StatTile
                    label={`Sent it, since the holdout began`}
                    value={formatRate(rate(sent.bought, sent.people))}
                    hint={`${n(sent.bought)} of ${n(sent.people)} bought within ${RESULT_WINDOW_DAYS} days`}
                />
                <StatTile
                    label="Held out"
                    value={formatRate(rate(heldOut.bought, heldOut.people))}
                    hint={`${n(heldOut.bought)} of ${n(heldOut.people)} bought within ${RESULT_WINDOW_DAYS} days`}
                />
                <StatTile
                    label="Difference"
                    value={difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference.toFixed(1)} points`}
                    hint={`${n(sent.people + heldOut.people)} people compared`}
                />
            </div>
            <p className="text-sm">{holdoutVerdict(holdout)}</p>
        </section>
    );
}
