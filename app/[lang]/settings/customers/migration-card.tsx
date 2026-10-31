"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { migrationJourney, shareLabel, type JourneyStage } from "@/lib/customer-migration/journey";
import type { MigrationSummary } from "@/lib/customer-migration/overview";
import { formatCurrency } from "@/lib/i18n/currencies";
import { formatPoints } from "@/lib/points/value";
import { cn } from "@/lib/utils";
import { MigrationJourney } from "./migration-journey";

const n = (v: number) => v.toLocaleString("en-SG");

/**
 * What the migration earned, under the funnel: money, not people, so not a
 * stage. PRD-loyalty-points slice 06 added both; they count the paid orders of
 * imported customers that used points.
 */
type MigrationFigure = { label: string; value: string; detail: string };

export function migrationFigures(summary: MigrationSummary): MigrationFigure[] {
    const orders = (v: number) => `${n(v)} paid order${v === 1 ? "" : "s"}`;
    return [
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

/** One more line for a stage's tooltip: the facts the funnel folds in. */
export function journeyNotes(summary: MigrationSummary): Partial<Record<JourneyStage, string>> {
    const notes: Partial<Record<JourneyStage, string>> = {
        imported: `Created ${n(summary.created)}, matched ${n(summary.matched)}.`,
    };
    if (summary.emailsBounced > 0 || summary.emailsComplained > 0) {
        notes.emailed = `${n(summary.emailsBounced)} bounced, ${n(summary.emailsComplained)} marked as spam.`;
    }
    if (summary.signedUpBeforeImport > 0) {
        notes.signed_up = `${n(summary.signedUpBeforeImport)} already had an account before import.`;
    }
    return notes;
}

/**
 * The Shopify migration on the Customers page (migration slice 12), from the
 * first applied Import batch on. Visible to anyone with `customers`; counted
 * by `admin_customer_migration_summary`, which reads the same overview as the
 * list, so the card and the *From Shopify* filter agree. Since 2026-10-31 it
 * is one funnel of where every imported customer is now
 * (lib/customer-migration/journey.ts).
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
    // Phones open on a one-line summary; the funnel is a tap away.
    const [journeyOpen, setJourneyOpen] = useState(false);
    if (summary.batchesApplied < 1) return null;
    const notSignedUp = summary.imported - summary.signedUp;
    const steps = migrationJourney(summary);

    return (
        <Card className="max-md:gap-1">
            <CardHeader className="pb-3 max-md:pb-0">
                <CardTitle className="text-base flex items-center gap-1.5">
                    Shopify migration
                    <InfoTip label="About the Shopify migration">
                        <p>
                            Every customer brought in from the Shopify export sits at the furthest stage they have
                            reached. Each bar is everyone who reached that stage: the dark part is still there, the
                            light part went further, and gray is there but can&apos;t be emailed (unsubscribed, or an
                            email bounced or was marked as spam).
                        </p>
                        <p>
                            Someone who skipped a step, such as signing up without a campaign email, counts as past it.
                            Hover a bar to see how many did the step itself.
                        </p>
                        <p>
                            <em>Signed up</em> counts those with an account now; some had one before the import.{" "}
                            <em>Ordered</em> counts a paid order here after their import.
                        </p>
                        <p>
                            <em>Points spent</em> and <em>Revenue</em> count the paid orders of imported customers that
                            used points.
                        </p>
                    </InfoTip>
                </CardTitle>
                <CardDescription className="max-md:hidden">
                    {`Where each of the ${n(summary.imported)} customers imported from Shopify is now.`}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-md:space-y-0">
                <button
                    type="button"
                    onClick={() => setJourneyOpen((o) => !o)}
                    aria-expanded={journeyOpen}
                    className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-md px-2 text-left text-sm transition-colors active:bg-press md:hidden"
                >
                    <span className="min-w-0">
                        <span className="font-semibold tabular-nums">{n(summary.imported)}</span> imported,{" "}
                        <span className="font-semibold tabular-nums">
                            {n(summary.signedUp)} ({shareLabel(summary.signedUp, summary.imported)})
                        </span>{" "}
                        signed up
                    </span>
                    <ChevronDown
                        className={cn("size-4 shrink-0 text-muted-foreground transition-transform", journeyOpen && "rotate-180")}
                        aria-hidden
                    />
                </button>
                <div className={cn("space-y-4 max-md:pt-2 max-md:pb-3", !journeyOpen && "max-md:hidden")}>
                    <MigrationJourney steps={steps} notes={journeyNotes(summary)} />
                    <dl className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                        {migrationFigures(summary).map((f) => (
                            <div key={f.label} className="flex flex-wrap items-baseline gap-x-1.5">
                                <dt>{f.label}</dt>
                                <dd className="text-sm font-semibold text-foreground">{f.value}</dd>
                                <dd>{f.detail}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                {notSignedUp > 0 && (
                    <a
                        href={notSignedUpHref}
                        onClick={(e) => {
                            e.preventDefault();
                            onShowNotSignedUp();
                        }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline active:opacity-60 max-md:min-h-11"
                    >
                        {n(notSignedUp)} from Shopify not signed up yet
                        <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                )}
            </CardContent>
        </Card>
    );
}
