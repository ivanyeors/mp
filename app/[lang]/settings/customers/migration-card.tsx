"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { percentOf, signedUpPercent, type MigrationSummary } from "@/lib/customer-migration/overview";
import { formatCurrency } from "@/lib/i18n/currencies";
import { formatPoints } from "@/lib/points/value";
import { cn } from "@/lib/utils";

/**
 * One figure on the card: slice 06 adds *Clicked*; slice 08 adds *Emailed*,
 * before it; PRD-loyalty-points slice 06 adds *Claim bonus*, *Points spent*
 * and *Revenue*, what the Claim bonus drove.
 */
type MigrationCell = { label: string; value: string; detail: string };

export function migrationCells(summary: MigrationSummary): MigrationCell[] {
    const n = (v: number) => v.toLocaleString("en-SG");
    const orders = (v: number) => `${n(v)} paid order${v === 1 ? "" : "s"}`;
    return [
        {
            label: "Imported",
            value: n(summary.imported),
            detail: `created ${n(summary.created)}, matched ${n(summary.matched)}`,
        },
        {
            label: "Signed up",
            value: `${n(summary.signedUp)} (${signedUpPercent(summary)}%)`,
            detail: `of which ${n(summary.signedUpBeforeImport)} already had an account before import`,
        },
        {
            label: "Emailed",
            value: `${n(summary.emailed)} (${percentOf(summary.emailed, summary.imported)}%)`,
            detail: `${n(summary.emailsBounced)} bounced, ${n(summary.emailsComplained)} marked as spam`,
        },
        {
            label: "Clicked",
            value: `${n(summary.clicked)} (${percentOf(summary.clicked, summary.imported)}%)`,
            detail: "opened their Claim link",
        },
        {
            label: "Claim bonus",
            value: `${n(summary.claimBonuses)} (${percentOf(summary.claimBonuses, summary.imported)}%)`,
            detail: "got the sign-in bonus in points",
        },
        {
            label: "Points spent",
            value: formatPoints(summary.migratedPointsSpent),
            detail: `on ${orders(summary.pointsOrders)}`,
        },
        {
            label: "Revenue",
            value: formatCurrency(summary.pointsRevenue, "SGD"),
            detail: `from ${orders(summary.pointsOrders)} that used points`,
        },
    ];
}

/**
 * The Shopify migration on the Customers page (migration slice 12), from the
 * first applied Import batch on. Visible to anyone with `customers`; counted
 * by `admin_customer_migration_summary`, which reads the same overview as the
 * list, so the card and the *From Shopify* filter agree.
 */
export function MigrationCard({
    summary,
    notSignedUpHref,
    onShowNotSignedUp,
}: {
    summary: MigrationSummary;
    /** The list filtered to *From Shopify* and *No account*, as a link to share. */
    notSignedUpHref: string;
    /** Applies that filter in place (the list keeps its filters in state and the URL). */
    onShowNotSignedUp: () => void;
}) {
    // Phones open on a one-line summary; the seven figures are a tap away.
    const [figuresOpen, setFiguresOpen] = useState(false);
    if (summary.batchesApplied < 1) return null;
    const notSignedUp = summary.imported - summary.signedUp;
    const cells = migrationCells(summary);

    return (
        <Card className="max-md:gap-1">
            <CardHeader className="pb-3 max-md:pb-0">
                <CardTitle className="text-base flex items-center gap-1.5">
                    Shopify migration
                    <InfoTip label="About the Shopify migration">
                        <p>
                            Customers brought in from the Shopify export. <em>Created</em> rows are new
                            Customers; <em>matched</em> rows were already here and were only filled in.
                        </p>
                        <p>
                            <em>Signed up</em> counts those who have an account now. Some already had one
                            before the import reached them.
                        </p>
                        <p>
                            <em>Emailed</em> counts those a campaign email went out to. A bounced address
                            and anyone who marked one as spam get no more.
                        </p>
                        <p>
                            <em>Clicked</em> counts those who opened the link in a campaign email.{" "}
                            <em>Claim bonus</em> counts those whose sign-in added the bonus points.
                        </p>
                        <p>
                            <em>Points spent</em> and <em>Revenue</em> count the paid orders of imported
                            customers that used points.
                        </p>
                    </InfoTip>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-md:space-y-0">
                <button
                    type="button"
                    onClick={() => setFiguresOpen((o) => !o)}
                    aria-expanded={figuresOpen}
                    className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm transition-colors active:bg-press md:hidden"
                >
                    <span className="min-w-0">
                        <span className="font-semibold tabular-nums">{summary.imported.toLocaleString("en-SG")}</span>{" "}
                        imported,{" "}
                        <span className="font-semibold tabular-nums">{cells[1]!.value}</span> signed up
                    </span>
                    <ChevronDown
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", figuresOpen && "rotate-180")}
                        aria-hidden
                    />
                </button>
                <dl
                    className={cn(
                        "grid grid-cols-2 gap-x-3 gap-y-4 max-md:py-2 md:gap-3 xl:grid-cols-3",
                        !figuresOpen && "max-md:hidden",
                    )}
                >
                    {cells.map((cell) => (
                        <div key={cell.label} className="min-w-0 rounded-lg border p-3 max-md:rounded-none max-md:border-0 max-md:p-0">
                            <dt className="text-xs text-muted-foreground">{cell.label}</dt>
                            <dd className="text-lg font-semibold tabular-nums break-words md:text-xl">{cell.value}</dd>
                            <dd className="text-xs text-muted-foreground">{cell.detail}</dd>
                        </div>
                    ))}
                </dl>
                {notSignedUp > 0 && (
                    <a
                        href={notSignedUpHref}
                        onClick={(e) => {
                            e.preventDefault();
                            onShowNotSignedUp();
                        }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline active:opacity-60 max-md:min-h-11"
                    >
                        {notSignedUp.toLocaleString("en-SG")} from Shopify not signed up yet
                        <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                )}
            </CardContent>
        </Card>
    );
}
