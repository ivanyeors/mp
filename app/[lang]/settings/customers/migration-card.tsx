"use client";

import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { signedUpPercent, type MigrationSummary } from "@/lib/customer-migration/overview";

/** One figure on the card: slices 06 and 08 append *Emailed*, *Clicked*, *Voucher used* and *Revenue*. */
type MigrationCell = { label: string; value: string; detail: string };

export function migrationCells(summary: MigrationSummary): MigrationCell[] {
    const n = (v: number) => v.toLocaleString("en-SG");
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
    if (summary.batchesApplied < 1) return null;
    const notSignedUp = summary.imported - summary.signedUp;

    return (
        <Card>
            <CardHeader className="pb-3">
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
                    </InfoTip>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {migrationCells(summary).map((cell) => (
                        <div key={cell.label} className="rounded-lg border p-3">
                            <dt className="text-xs text-muted-foreground">{cell.label}</dt>
                            <dd className="text-xl font-semibold tabular-nums">{cell.value}</dd>
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
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                        {notSignedUp.toLocaleString("en-SG")} from Shopify not signed up yet
                        <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                )}
            </CardContent>
        </Card>
    );
}
