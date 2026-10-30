"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, Loader2, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
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
import {
    IMPORT_CONFIRMATION,
    UNDO_CONFIRMATION,
    localIsoDate,
    reconcile,
    runShopifyImport,
    skippedTotal,
    type BatchCounts,
    type ImportRun,
} from "@/lib/customer-migration/apply";
import {
    batchForFile,
    batchMismatch,
    batchState,
    type ImportBatchView,
    type UndoCounts,
} from "@/lib/customer-migration/batches";
import {
    applyShopifyImportChunk,
    finishShopifyImport,
    previewShopifyImport,
    previewShopifyImportUndo,
    startShopifyImport,
    undoShopifyImport,
} from "./actions";

/** The skipped-rows table stops here; the download has every row. */
const SKIPPED_SHOWN = 200;

/**
 * The picked file, held in this tab's memory only. The text is kept so the
 * import can send the same rows the preview read; it is gone when the tab
 * closes.
 */
type PickedFile = { name: string; sha256: string; lastModified: number; text: string; pickedAt: number };

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

export function CustomerImportClient({ history = [] }: { history?: ImportBatchView[] | null }) {
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const [state, setState] = useState<State>({ phase: "idle" });
    const [importing, setImporting] = useState(false);
    const busy = state.phase === "reading" || state.phase === "previewing" || importing;
    // The history is read on the server; after a write, read it again.
    const refresh = () => router.refresh();

    // The file is read here and lives only in this tab's memory. Nothing
    // uploads or stores it: the server actions receive rows, a chunk at a time.
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
            const text = new TextDecoder("utf-8").decode(buffer);
            const picked: PickedFile = {
                name: file.name,
                sha256: await sha256Hex(buffer),
                lastModified: file.lastModified,
                text,
                pickedAt: Date.now(),
            };
            const run = await runShopifyPreview(
                text,
                (rows) => previewShopifyImport(rows),
                (done, total) => setState({ phase: "previewing", file: picked, done, total }),
            );
            setState({ phase: "result", file: picked, run });
        } catch {
            setState({ phase: "refused", message: "This file could not be read. Pick it again." });
        }
    };

    const stopped = (history ?? []).filter((b) => batchState(b) === "stopped");

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <Button variant="ghost" size="sm" className="self-start max-md:hidden" asChild>
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

            {stopped.map((b) => (
                <StoppedNotice key={b.id} batch={b} />
            ))}

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

            {state.phase === "result" && state.run.kind === "done" && (
                <ImportPanel
                    key={state.file.pickedAt}
                    file={state.file}
                    summary={state.run.summary}
                    history={history}
                    onRunning={setImporting}
                    onChanged={refresh}
                />
            )}

            <HistoryCard history={history} busy={busy} onChanged={refresh} />
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
            <div className="min-w-0 flex-1 space-y-1">{children}</div>
        </div>
    );
}

function Notice({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">{children}</div>
        </div>
    );
}

/** created + merged + already imported + skipped, as a sum. */
function countsSum(c: BatchCounts) {
    return [c.created, c.merged, c.alreadyImported, skippedTotal(c.skipped)].map((n) => int.format(n)).join(" + ");
}

/** A batch that does not reconcile: shown in red, and never marked applied. */
function MismatchProblem({ counts, rows }: { counts: BatchCounts; rows?: { created: number; merged: number } }) {
    const r = reconcile(counts);
    return (
        <Problem>
            <p className="font-medium">The counts do not reconcile, so this import is not marked done.</p>
            {r.accounted !== counts.rowsTotal && (
                <p>
                    {int.format(counts.rowsTotal)} rows, but created + merged + already imported + skipped ={" "}
                    {countsSum(counts)} = {int.format(r.accounted)}.
                </p>
            )}
            {rows && (rows.created !== counts.created || rows.merged !== counts.merged) && (
                <p>
                    The database holds {int.format(rows.created)} created and {int.format(rows.merged)} merged
                    rows for this import, against {int.format(counts.created)} and {int.format(counts.merged)} counted.
                </p>
            )}
            <p>It stays unapplied. Undo it in the history below, or pick the same file to check it again.</p>
        </Problem>
    );
}

/** A batch that never finished: picking the same file continues it. */
function StoppedNotice({ batch }: { batch: ImportBatchView }) {
    if (batchMismatch(batch)) return <MismatchProblem counts={batch} />;
    return (
        <Notice>
            <p className="font-medium">
                Import stopped at {int.format(batch.rowsDone)} of {int.format(batch.rowsTotal)}. Pick the same
                file to continue.
            </p>
            <p className="break-all text-muted-foreground">
                {batch.fileName}, started {formatAdminDateTimeMY(batch.createdAt)}
                {batch.runBy ? ` by ${batch.runBy}` : ""}. A different file cannot continue it.
            </p>
        </Notice>
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

type ApplyPhase =
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "running"; done: number; total: number }
    | { kind: "error"; error: string }
    | { kind: "done"; run: ImportRun };

/**
 * The Import step under the preview: start a batch (or continue the one this
 * file already has), send its rows, then show the server's own counts.
 */
export function ImportPanel({
    file,
    summary,
    history,
    onRunning,
    onChanged,
}: {
    file: PickedFile;
    summary: PreviewSummary;
    history: ImportBatchView[] | null;
    onRunning: (running: boolean) => void;
    onChanged: () => void;
}) {
    const existing = history ? batchForFile(history, file.sha256) : null;
    const [withoutAddresses, setWithoutAddresses] = useState(false);
    const [exportedAt, setExportedAt] = useState(() => localIsoDate(file.lastModified || Date.now()));
    const [typed, setTyped] = useState("");
    const [phase, setPhase] = useState<ApplyPhase>({ kind: "idle" });
    const writes = summary.outcomes.create + summary.outcomes.merge;

    const run = async (batch: { id: string; rowsDone: number; rowsTotal: number }) => {
        onRunning(true);
        setPhase({ kind: "running", done: batch.rowsDone, total: batch.rowsTotal });
        try {
            const result = await runShopifyImport({
                text: file.text,
                batch,
                applyChunk: (id, start, rows) => applyShopifyImportChunk(id, start, rows),
                finish: (id) => finishShopifyImport(id),
                onProgress: (done, total) => setPhase({ kind: "running", done, total }),
            });
            setPhase({ kind: "done", run: result });
        } finally {
            onRunning(false);
            onChanged();
        }
    };

    const onStart = async () => {
        setPhase({ kind: "starting" });
        let res: Awaited<ReturnType<typeof startShopifyImport>>;
        try {
            res = await startShopifyImport({
                fileName: file.name,
                sha256: file.sha256,
                rowsTotal: summary.rowsTotal,
                withAddresses: !withoutAddresses,
                exportedAt,
                confirmation: typed.trim(),
            });
        } catch (e) {
            res = { ok: false, error: e instanceof Error ? e.message : "The import could not start." };
        }
        if (!res.ok) {
            setPhase({ kind: "error", error: res.error });
            return;
        }
        await run(res.batch);
    };

    if (phase.kind === "running") {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Importing…</CardTitle>
                    <CardDescription>
                        Keep this tab open. If it closes, pick the same file again and the import
                        continues where it stopped.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        {int.format(phase.done)} of {int.format(phase.total)} rows done
                    </p>
                    <Progress value={phase.total ? (phase.done / phase.total) * 100 : 0} />
                </CardContent>
            </Card>
        );
    }

    if (phase.kind === "done") return <ImportOutcome run={phase.run} />;

    if (existing && batchState(existing) === "applied") {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Import</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Notice>
                        <p className="font-medium">
                            This file was imported on {formatAdminDateTimeMY(existing.appliedAt)}
                            {existing.runBy ? ` by ${existing.runBy}` : ""}.
                        </p>
                        <p className="text-muted-foreground">
                            Importing it again would change nothing. To redo it, undo that import below first.
                        </p>
                    </Notice>
                    <Button disabled>Import {int.format(writes)} customers</Button>
                </CardContent>
            </Card>
        );
    }

    if (existing) {
        const mismatch = batchMismatch(existing);
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Continue the import</CardTitle>
                    <CardDescription>
                        Started {formatAdminDateTimeMY(existing.createdAt)}
                        {existing.runBy ? ` by ${existing.runBy}` : ""},{" "}
                        {existing.withAddresses ? "with addresses" : "without addresses"}, export dated{" "}
                        {formatAdminDateMY(existing.exportedAt)}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {mismatch ? (
                        <MismatchProblem counts={existing} />
                    ) : (
                        <p className="text-sm">
                            Import stopped at {int.format(existing.rowsDone)} of {int.format(existing.rowsTotal)}.
                            Every row from there is decided again against your customers as they are now.
                        </p>
                    )}
                    {phase.kind === "error" && <Problem>{phase.error}</Problem>}
                    <Button
                        onClick={() =>
                            void run({ id: existing.id, rowsDone: existing.rowsDone, rowsTotal: existing.rowsTotal })
                        }
                    >
                        {mismatch ? "Check again" : `Continue from row ${int.format(existing.rowsDone + 1)}`}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const confirmed = typed.trim() === IMPORT_CONFIRMATION && Boolean(exportedAt);
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Import</CardTitle>
                <CardDescription>
                    {int.format(summary.outcomes.create)} new Customers and {int.format(summary.outcomes.merge)} matched
                    to an existing Customer, whose empty name and phone fields are filled and nothing else
                    changes. Nobody is emailed, and no account is created: each person claims their row by
                    signing in.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-start gap-2">
                    <Checkbox
                        id="import-without-addresses"
                        checked={withoutAddresses}
                        onCheckedChange={(v) => setWithoutAddresses(v === true)}
                    />
                    <div className="grid gap-1">
                        <Label htmlFor="import-without-addresses">Import without addresses</Label>
                        <p className="text-sm text-muted-foreground">
                            The conservative import: names, emails and Shopify history only. If a Shopify email
                            was mistyped, its owner cannot see somebody else&apos;s address.
                        </p>
                    </div>
                </div>
                <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="import-exported-at">Exported from Shopify on</Label>
                    <Input
                        id="import-exported-at"
                        type="date"
                        value={exportedAt}
                        onChange={(e) => setExportedAt(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                        Recorded with each customer&apos;s marketing choice. It starts at the file&apos;s date.
                    </p>
                </div>
                <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="import-confirm">Type {IMPORT_CONFIRMATION} to confirm</Label>
                    <Input
                        id="import-confirm"
                        value={typed}
                        autoComplete="off"
                        onChange={(e) => setTyped(e.target.value)}
                    />
                </div>
                {phase.kind === "error" && <Problem>{phase.error}</Problem>}
                <Button disabled={!confirmed || phase.kind === "starting"} onClick={() => void onStart()}>
                    {phase.kind === "starting" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Import {int.format(writes)} customers
                </Button>
            </CardContent>
        </Card>
    );
}

/** What the server says the import did. */
function ImportOutcome({ run }: { run: ImportRun }) {
    if (run.kind === "stopped") {
        return (
            <Problem>
                <p className="font-medium">The import stopped at row {int.format(run.rowsDone)}.</p>
                <p>{run.error}</p>
                <p>Everything before that row is saved. Pick the same file to continue.</p>
            </Problem>
        );
    }
    const { status, counts, rows } = run.result;
    if (status === "mismatch") return <MismatchProblem counts={counts} rows={rows} />;
    if (status === "undone") return <Problem>This import was undone while it ran.</Problem>;
    if (status === "incomplete") {
        return <Problem>The import has rows left. Pick the same file to continue.</Problem>;
    }
    const cards: [string, number][] = [
        ["Created", counts.created],
        ["Merged", counts.merged],
        ["Already imported", counts.alreadyImported],
        ["Skipped", skippedTotal(counts.skipped)],
    ];
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                    Imported
                </CardTitle>
                <CardDescription>
                    {int.format(counts.rowsTotal)} rows = {countsSum(counts)}. Every row is accounted for.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {cards.map(([label, n]) => (
                        <div key={label}>
                            <dt className="text-xs text-muted-foreground">{label}</dt>
                            <dd className="text-2xl font-semibold tabular-nums">{int.format(n)}</dd>
                        </div>
                    ))}
                </dl>
            </CardContent>
        </Card>
    );
}

const STATE_LABELS = { applied: "Applied", stopped: "Stopped", undone: "Undone" } as const;

/** Every Import batch, newest first, with Undo. */
function HistoryCard({
    history,
    busy,
    onChanged,
}: {
    history: ImportBatchView[] | null;
    busy: boolean;
    onChanged: () => void;
}) {
    return (
        <div className="space-y-3">
            <h2 className="text-base font-semibold">Import history</h2>
            {history === null ? (
                <Problem>The import history could not be read. Reload the page.</Problem>
            ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No imports yet.</p>
            ) : (
                // Phones: each batch is a card (the row turns into a grid), not a table
                // too wide for the screen. One element per batch keeps #batch-<id> working.
                <div className="min-w-0 overflow-x-auto rounded-xl border">
                    <Table className="max-md:block">
                        <TableHeader className="max-md:hidden">
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">File</TableHead>
                                <TableHead className="px-4">Run by</TableHead>
                                <TableHead className="px-4 text-right">Created</TableHead>
                                <TableHead className="px-4 text-right">Merged</TableHead>
                                <TableHead className="px-4 text-right">Already imported</TableHead>
                                <TableHead className="px-4 text-right">Skipped</TableHead>
                                <TableHead className="px-4">State</TableHead>
                                <TableHead className="px-4" />
                            </TableRow>
                        </TableHeader>
                        <TableBody className="max-md:block">
                            {history.map((b) => (
                                <HistoryRow key={b.id} batch={b} busy={busy} onChanged={onChanged} />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

function HistoryRow({ batch, busy, onChanged }: { batch: ImportBatchView; busy: boolean; onChanged: () => void }) {
    const state = batchState(batch);
    const mismatch = batchMismatch(batch);
    // The Customer overview links each batch as /settings/customers/import#batch-<id>.
    return (
        <TableRow
            id={`batch-${batch.id}`}
            className="scroll-mt-20 target:bg-muted/60 max-md:grid max-md:grid-cols-4 max-md:gap-3 max-md:p-4"
        >
            <TableCell className="px-4 align-top max-md:col-span-4 max-md:p-0">
                <p className="max-w-56 break-all font-medium max-md:max-w-none max-md:break-normal max-md:[overflow-wrap:anywhere]">
                    {batch.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                    {formatAdminDateTimeMY(batch.createdAt)} · {int.format(batch.rowsTotal)} rows
                    {batch.withAddresses ? "" : " · without addresses"}
                </p>
                <p className="text-xs text-muted-foreground md:hidden">Run by {batch.runBy ?? "—"}</p>
            </TableCell>
            <TableCell className="px-4 align-top max-md:hidden">{batch.runBy ?? "—"}</TableCell>
            <CountCell label="Created" value={batch.created} />
            <CountCell label="Merged" value={batch.merged} />
            <CountCell label="Already imported" value={batch.alreadyImported} />
            <CountCell label="Skipped" value={skippedTotal(batch.skipped)} />
            <TableCell className="px-4 align-top max-md:col-span-2 max-md:p-0">
                <Badge variant={state === "applied" ? "secondary" : "outline"}>
                    {STATE_LABELS[state]}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                    {state === "applied" && formatAdminDateMY(batch.appliedAt)}
                    {state === "undone" && formatAdminDateMY(batch.rolledBackAt)}
                    {state === "stopped" &&
                        !mismatch &&
                        `at ${int.format(batch.rowsDone)} of ${int.format(batch.rowsTotal)}`}
                </p>
                {mismatch && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                        Does not reconcile: {int.format(mismatch.accounted)} of {int.format(batch.rowsTotal)} rows
                        accounted for
                    </p>
                )}
                {batch.undoCounts && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {int.format(batch.undoCounts.removed)} removed, {int.format(batch.undoCounts.kept)} kept
                    </p>
                )}
            </TableCell>
            <TableCell className="px-4 text-right align-top max-md:col-span-2 max-md:p-0">
                {state !== "undone" && <UndoButton batch={batch} disabled={busy} onChanged={onChanged} />}
            </TableCell>
        </TableRow>
    );
}

/** A count column; on a phone, a labelled figure in the batch card. */
function CountCell({ label, value }: { label: string; value: number }) {
    return (
        <TableCell className="px-4 text-right align-top tabular-nums max-md:p-0 max-md:text-left">
            <span className="block text-xs text-muted-foreground md:hidden">{label}</span>
            {int.format(value)}
        </TableCell>
    );
}

type UndoPhase =
    | { kind: "loading" }
    | { kind: "ready"; counts: UndoCounts }
    | { kind: "undoing"; counts: UndoCounts }
    | { kind: "done"; counts: UndoCounts }
    | { kind: "error"; error: string; counts?: UndoCounts };

/** A preview of the undo first, then a typed confirmation. */
function UndoButton({ batch, disabled, onChanged }: { batch: ImportBatchView; disabled: boolean; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<UndoPhase>({ kind: "loading" });
    const [typed, setTyped] = useState("");

    const onOpen = async () => {
        setOpen(true);
        setTyped("");
        setPhase({ kind: "loading" });
        try {
            const res = await previewShopifyImportUndo(batch.id);
            setPhase(res.ok ? { kind: "ready", counts: res.counts } : { kind: "error", error: res.error });
        } catch (e) {
            setPhase({ kind: "error", error: e instanceof Error ? e.message : "Could not check the undo." });
        }
    };

    const onConfirm = async (counts: UndoCounts) => {
        setPhase({ kind: "undoing", counts });
        try {
            const res = await undoShopifyImport(batch.id, typed.trim());
            setPhase(res.ok ? { kind: "done", counts: res.counts } : { kind: "error", error: res.error, counts });
        } catch (e) {
            setPhase({ kind: "error", error: e instanceof Error ? e.message : "Could not undo the import.", counts });
        }
        onChanged();
    };

    const counts = "counts" in phase ? phase.counts : undefined;
    return (
        <>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => void onOpen()}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Undo
            </Button>
            <Dialog open={open} onOpenChange={(o) => phase.kind !== "undoing" && setOpen(o)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Undo this import</DialogTitle>
                        <DialogDescription className="break-all">
                            {batch.fileName}, {formatAdminDateTimeMY(batch.createdAt)}
                        </DialogDescription>
                    </DialogHeader>
                    {phase.kind === "loading" && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Checking what would change…
                        </p>
                    )}
                    {counts && <UndoSummary counts={counts} done={phase.kind === "done"} />}
                    {phase.kind === "error" && <Problem>{phase.error}</Problem>}
                    {(phase.kind === "ready" || phase.kind === "undoing") && (
                        <div className="grid gap-1.5">
                            <Label htmlFor={`undo-confirm-${batch.id}`}>Type {UNDO_CONFIRMATION} to confirm</Label>
                            <Input
                                id={`undo-confirm-${batch.id}`}
                                value={typed}
                                autoComplete="off"
                                onChange={(e) => setTyped(e.target.value)}
                            />
                        </div>
                    )}
                    <DialogFooter>
                        {phase.kind === "done" ? (
                            <Button onClick={() => setOpen(false)}>Done</Button>
                        ) : (
                            <Button
                                variant="destructive"
                                disabled={!(phase.kind === "ready" && typed.trim() === UNDO_CONFIRMATION)}
                                onClick={() => phase.kind === "ready" && void onConfirm(phase.counts)}
                            >
                                {phase.kind === "undoing" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                                Undo import
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function UndoSummary({ counts, done }: { counts: UndoCounts; done: boolean }) {
    return (
        <div className="space-y-2 text-sm">
            <p>
                <span className="font-medium">
                    {int.format(counts.removed)} {done ? "were removed" : "will be removed"}.
                </span>{" "}
                {counts.kept > 0 && (
                    <>
                        {int.format(counts.kept)} {done ? "were" : "are"} kept, because they have signed up or bought
                        since ({int.format(counts.keptClaimed)} signed up, {int.format(counts.keptReferenced)} with an
                        order, booking, review, Result or address since).
                    </>
                )}
            </p>
            {counts.unlinked > 0 && (
                <p className="text-muted-foreground">
                    {int.format(counts.unlinked)} existing Customers the import matched {done ? "lost" : "lose"} their
                    Shopify details and the address the import added. Their names and phone stay: they are true.
                </p>
            )}
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
