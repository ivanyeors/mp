"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ChevronLeft, Download, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { PLAN_OUTCOMES, type SkipReason } from "@/lib/customer-migration/plan";
import type { RowRepair, ShopifyHeaderCheck } from "@/lib/customer-migration/shopify-csv";
import {
    MAX_FILE_BYTES,
    OUTCOME_LABELS,
    REPAIR_LABELS,
    SKIP_REASON_LABELS,
    runShopifyPreview,
    sha256Hex,
    skippedRowsCsv,
    type PreviewRun,
    type PreviewSummary,
    type SkippedRow,
} from "@/lib/customer-migration/preview";
import { previewShopifyImport } from "./actions";

/** The skipped-rows table stops here; the download has every row. */
const SKIPPED_SHOWN = 200;

type PickedFile = { name: string; sha256: string };

type State =
    | { phase: "idle" }
    | { phase: "reading" }
    | { phase: "previewing"; file: PickedFile; done: number; total: number }
    | { phase: "refused"; message: string }
    | { phase: "result"; file: PickedFile; run: PreviewRun };

const int = new Intl.NumberFormat("en-SG");

function downloadSkipped(rows: SkippedRow[]) {
    const url = URL.createObjectURL(new Blob([skippedRowsCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-import-skipped-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function CustomerImportClient() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const [state, setState] = useState<State>({ phase: "idle" });
    const busy = state.phase === "reading" || state.phase === "previewing";

    // The file is read here and lives only in this tab's memory. Nothing
    // uploads or stores it: the server action receives rows, a chunk at a time.
    const onPick = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setState({ phase: "refused", message: "This file is over 20 MB. Export it again from Shopify as a Plain CSV file." });
            return;
        }
        setState({ phase: "reading" });
        try {
            const buffer = await file.arrayBuffer();
            const picked: PickedFile = { name: file.name, sha256: await sha256Hex(buffer) };
            const run = await runShopifyPreview(
                new TextDecoder("utf-8").decode(buffer),
                (rows) => previewShopifyImport(rows),
                (done, total) => setState({ phase: "previewing", file: picked, done, total }),
            );
            setState({ phase: "result", file: picked, run });
        } catch {
            setState({ phase: "refused", message: "This file could not be read. Pick it again." });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <Button variant="ghost" size="sm" className="self-start" asChild>
                    <Link href={to("/settings/customers")}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Customers
                    </Link>
                </Button>
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Import from Shopify</h1>
                    <InfoTip label="About importing from Shopify">
                        <p>
                            Every Shopify customer with an email becomes a Customer here, with no
                            account yet. The first time they sign in with that email, by Google or
                            by code, they land on their own row.
                        </p>
                        <p>
                            Shopify order counts, spend, tags and notes are kept apart from the
                            Customer, where only Staff can see them.
                        </p>
                    </InfoTip>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Pick the export</CardTitle>
                    <CardDescription>
                        In Shopify admin: Customers → Export → All customers → Plain CSV file. Pick
                        it here straight from your downloads. Opening it in Excel first drops the
                        leading 0 from Singapore postcodes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Input
                        type="file"
                        accept=".csv"
                        disabled={busy}
                        onChange={(e) => void onPick(e.currentTarget)}
                        className="max-w-md"
                    />
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        The file stays in this tab. It is never uploaded or stored, and it is gone
                        when you close the tab.
                    </p>
                </CardContent>
            </Card>

            {state.phase === "reading" && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Reading the file…
                </p>
            )}

            {state.phase === "previewing" && (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Checking {int.format(state.done)} of {int.format(state.total)} rows against
                        your customers…
                    </p>
                    <Progress value={state.total ? (state.done / state.total) * 100 : 0} />
                </div>
            )}

            {state.phase === "refused" && <Problem>{state.message}</Problem>}

            {state.phase === "result" && <RunResult file={state.file} run={state.run} />}
        </div>
    );
}

function Problem({ children }: { children: ReactNode }) {
    return (
        <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

function HeaderNotes({ header }: { header: ShopifyHeaderCheck }) {
    if (!header.missingOptional.length && !header.dropped.length) return null;
    return (
        <div className="space-y-1 text-sm text-muted-foreground">
            {header.missingOptional.length > 0 && (
                <p>Not in this file, and not needed: {header.missingOptional.join(", ")}.</p>
            )}
            {header.dropped.length > 0 && (
                <p>Never read or sent: {header.dropped.join(", ")}.</p>
            )}
        </div>
    );
}

function RunResult({ file, run }: { file: PickedFile; run: PreviewRun }) {
    if (run.kind === "header_error") {
        return (
            <div className="space-y-3">
                <Problem>
                    <p className="font-medium">This is not a Shopify customer export, or a column is missing.</p>
                    <p>Missing: {run.header.missing.join(", ")}.</p>
                    <p>Export it again from Shopify as a Plain CSV file. Nothing was sent.</p>
                </Problem>
                <HeaderNotes header={run.header} />
            </div>
        );
    }
    if (run.kind === "empty") {
        return <Problem>This file has the right columns but no customers.</Problem>;
    }
    if (run.kind === "failed") {
        return <Problem>The preview stopped: {run.error}</Problem>;
    }

    const { summary, skipped } = run;
    return (
        <div className="space-y-6">
            <div className="space-y-1 text-sm text-muted-foreground">
                <p className="break-all">
                    <span className="font-medium text-foreground">{file.name}</span> ·{" "}
                    {int.format(summary.rowsTotal)} rows · SHA-256 {file.sha256.slice(0, 12)}…
                </p>
                <HeaderNotes header={run.header} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {PLAN_OUTCOMES.map((o) => (
                    <Card key={o} className="gap-1 py-4">
                        <CardContent className="px-4">
                            <p className="text-xs text-muted-foreground">{OUTCOME_LABELS[o]}</p>
                            <p className="text-2xl font-semibold tabular-nums">{int.format(summary.outcomes[o])}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">
                {int.format(summary.rowsTotal)} rows = {PLAN_OUTCOMES.map((o) => int.format(summary.outcomes[o])).join(" + ")}.
                Every row is accounted for.
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <PeopleCard summary={summary} />
                <CountsCard
                    title="Skipped, and why"
                    empty="No row would be skipped."
                    counts={summary.skipReasons}
                    labels={SKIP_REASON_LABELS}
                />
                <CountsCard
                    title="Repaired or left out"
                    empty="Nothing to repair."
                    counts={summary.repairs}
                    labels={REPAIR_LABELS}
                />
            </div>

            {skipped.length > 0 && <SkippedTable rows={skipped} />}

            <p className="text-sm text-muted-foreground">
                This is a preview. Nothing has been written to your customers.
            </p>
        </div>
    );
}

function PeopleCard({ summary }: { summary: PreviewSummary }) {
    const rows: [string, number][] = [
        ["Bought on Shopify (1+ orders)", summary.buyers],
        ["Never bought", summary.nonBuyers],
        ["Agreed to marketing email", summary.consented],
        ["Did not agree", summary.notConsented],
    ];
    return (
        <Card className="gap-3">
            <CardHeader>
                <CardTitle className="text-sm">Who would come in</CardTitle>
                <CardDescription>The customers this import would create or merge.</CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="space-y-1.5 text-sm">
                    {rows.map(([label, n]) => (
                        <div key={label} className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium tabular-nums">{int.format(n)}</dd>
                        </div>
                    ))}
                </dl>
            </CardContent>
        </Card>
    );
}

function CountsCard<K extends SkipReason | RowRepair>({
    title,
    empty,
    counts,
    labels,
}: {
    title: string;
    empty: string;
    counts: Partial<Record<K, number>>;
    labels: Record<K, string>;
}) {
    const entries = (Object.keys(labels) as K[]).filter((k) => (counts[k] ?? 0) > 0);
    return (
        <Card className="gap-3">
            <CardHeader>
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent>
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{empty}</p>
                ) : (
                    <dl className="space-y-1.5 text-sm">
                        {entries.map((k) => (
                            <div key={k} className="flex justify-between gap-3">
                                <dt className="text-muted-foreground">{labels[k]}</dt>
                                <dd className="font-medium tabular-nums">{int.format(counts[k] ?? 0)}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </CardContent>
        </Card>
    );
}

function SkippedTable({ rows }: { rows: SkippedRow[] }) {
    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-semibold">Skipped rows</h2>
                <Button size="sm" variant="outline" onClick={() => downloadSkipped(rows)}>
                    <Download className="mr-1.5 h-4 w-4" />
                    Download skipped rows
                </Button>
            </div>
            <div className="min-w-0 overflow-x-auto rounded-xl border">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableHead className="px-4">Row</TableHead>
                            <TableHead className="px-4">Email</TableHead>
                            <TableHead className="px-4">Name</TableHead>
                            <TableHead className="px-4">Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.slice(0, SKIPPED_SHOWN).map((r) => (
                            <TableRow key={r.row}>
                                <TableCell className="px-4 tabular-nums text-muted-foreground">{r.row}</TableCell>
                                <TableCell className="px-4 break-all">{r.email || "—"}</TableCell>
                                <TableCell className="px-4">{r.name || "—"}</TableCell>
                                <TableCell className="px-4 text-muted-foreground">{SKIP_REASON_LABELS[r.reason]}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            {rows.length > SKIPPED_SHOWN && (
                <p className="text-sm text-muted-foreground">
                    Showing the first {SKIPPED_SHOWN} of {int.format(rows.length)}. The download has them all.
                </p>
            )}
        </div>
    );
}
