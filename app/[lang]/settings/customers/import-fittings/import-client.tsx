"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, Loader2, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { parseFittingFormCsv, type DateOrder, type FormHeaderCheck, type RowRepair } from "@/lib/fitting-import/google-form-csv";
import { PLAN_OUTCOMES, type SkipReason } from "@/lib/fitting-import/plan";
import {
    MAX_FILE_BYTES,
    OUTCOME_HINTS,
    OUTCOME_LABELS,
    REPAIR_LABELS,
    SKIP_REASON_LABELS,
    runFittingPreview,
    sha256Hex,
    skippedRows,
    skippedRowsCsv,
    type PreviewRun,
    type PreviewSummary,
    type SkippedRow,
} from "@/lib/fitting-import/preview";
import {
    IMPORT_CONFIRMATION,
    UNDO_CONFIRMATION,
    reconcile,
    recordsWritten,
    runFittingImport,
    skippedTotal,
    type BatchCounts,
    type ImportRun,
} from "@/lib/fitting-import/apply";
import { batchForFile, batchMismatch, batchState, type FittingBatchView, type UndoCounts } from "@/lib/fitting-import/batches";
import {
    applyFittingImportChunk,
    finishFittingImport,
    previewFittingImport,
    previewFittingImportUndo,
    startFittingImport,
    undoFittingImport,
} from "./actions";

/** The skipped-rows table stops here; the download has every row. */
const SKIPPED_SHOWN = 200;

/** The picked file, held in this tab's memory only, so the import sends the rows the preview read. */
type PickedFile = { name: string; sha256: string; text: string; pickedAt: number };

type State =
    | { phase: "idle" }
    | { phase: "reading" }
    | { phase: "previewing"; file: PickedFile; done: number; total: number }
    | { phase: "refused"; message: string }
    | { phase: "result"; file: PickedFile; run: PreviewRun };

const int = new Intl.NumberFormat("en-SG");

const DATE_ORDER_LABELS: Record<DateOrder, string> = {
    mdy: "Month first (10/17/2026)",
    dmy: "Day first (17/10/2026)",
};

function downloadSkipped(rows: SkippedRow[]) {
    const url = URL.createObjectURL(new Blob([skippedRowsCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fitting-import-skipped-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function FittingImportClient({ history = [] }: { history?: FittingBatchView[] | null }) {
    const pathname = usePathname() ?? "/";
    const router = useRouter();
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const [state, setState] = useState<State>({ phase: "idle" });
    const [importing, setImporting] = useState(false);
    const busy = state.phase === "reading" || state.phase === "previewing" || importing;
    const refresh = () => router.refresh();

    const preview = async (file: PickedFile, order?: DateOrder) => {
        const run = await runFittingPreview(file.text, (rows, o) => previewFittingImport(rows, o), {
            order,
            onProgress: (done, total) => setState({ phase: "previewing", file, done, total }),
        });
        setState({ phase: "result", file, run });
    };

    // The file is read here and lives only in this tab's memory. Nothing
    // uploads or stores it: the server actions receive rows, a chunk at a time.
    const onPick = async (input: HTMLInputElement) => {
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setState({ phase: "refused", message: "This file is over 20 MB. Download the responses again as a CSV." });
            return;
        }
        setState({ phase: "reading" });
        try {
            const buffer = await file.arrayBuffer();
            const picked: PickedFile = {
                name: file.name,
                sha256: await sha256Hex(buffer),
                text: new TextDecoder("utf-8").decode(buffer),
                pickedAt: Date.now(),
            };
            // A file that already has an import is read the way that import read it.
            const existing = history ? batchForFile(history, picked.sha256) : null;
            await preview(picked, existing?.dateOrder);
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
                    <h1 className="text-2xl font-semibold tracking-tight">Import fittings</h1>
                    <InfoTip label="About importing fittings">
                        <p>
                            Each response to the in-store fitting form becomes a fitting record on the customer:
                            measurements, size, configuration type, profile side, sleep and health answers, who
                            serviced them, notes and the Drive photos.
                        </p>
                        <p>
                            A customer who came in more than once gets every visit as its own record, with its own
                            measurements, all on one customer. A response joins the customer with its email. Under an
                            email no customer has, it joins the one with the same mobile and name, or creates a
                            customer with no login. One without an email joins the customer with its mobile number,
                            or, when several share it, the one with the same name.
                        </p>
                        <p>
                            Staff see fitting records on the customer&apos;s page. The customer sees their own on their
                            Profile, without the photos.
                        </p>
                    </InfoTip>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Pick the form responses</CardTitle>
                    <CardDescription>
                        In the form&apos;s Google Sheet: File → Download → Comma-separated values (.csv). Or in
                        Google Forms: Responses → ⋮ → Download responses. Pick the file here straight from your
                        downloads.
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
                        The file stays in this tab. It is never uploaded or stored, and it is gone when you close
                        the tab.
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
                        Checking {int.format(state.done)} of {int.format(state.total)} rows against your customers…
                    </p>
                    <Progress value={state.total ? (state.done / state.total) * 100 : 0} />
                </div>
            )}

            {state.phase === "refused" && <Problem>{state.message}</Problem>}

            {state.phase === "result" && (
                <RunResult
                    file={state.file}
                    run={state.run}
                    locked={Boolean(history && batchForFile(history, state.file.sha256))}
                    onOrder={(order) => void preview(state.file, order)}
                />
            )}

            {state.phase === "result" && state.run.kind === "done" && (
                <ImportPanel
                    key={`${state.file.pickedAt}-${state.run.order}`}
                    file={state.file}
                    order={state.run.order}
                    rowsTotal={state.run.rowsTotal}
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

function countsSum(c: BatchCounts) {
    return [c.created, c.matchedEmail, c.matchedPhone, c.alreadyImported, skippedTotal(c.skipped)]
        .map((n) => int.format(n))
        .join(" + ");
}

/** A batch that does not reconcile: shown in red, and never marked applied. */
function MismatchProblem({ counts }: { counts: BatchCounts }) {
    const r = reconcile(counts);
    return (
        <Problem>
            <p className="font-medium">The counts do not reconcile, so this import is not marked done.</p>
            <p>
                {int.format(counts.rowsTotal)} rows, but the outcomes add up to {countsSum(counts)} ={" "}
                {int.format(r.accounted)}.
            </p>
            <p>It stays unapplied. Undo it in the history below, or pick the same file to check it again.</p>
        </Problem>
    );
}

function StoppedNotice({ batch }: { batch: FittingBatchView }) {
    if (batchMismatch(batch)) return <MismatchProblem counts={batch} />;
    return (
        <Notice>
            <p className="font-medium">
                Import stopped at {int.format(batch.rowsDone)} of {int.format(batch.rowsTotal)}. Pick the same file
                to continue.
            </p>
            <p className="break-all text-muted-foreground">
                {batch.fileName}, started {formatAdminDateTimeMY(batch.createdAt)}
                {batch.runBy ? ` by ${batch.runBy}` : ""}. A different file cannot continue it.
            </p>
        </Notice>
    );
}

function HeaderNotes({ header }: { header: FormHeaderCheck }) {
    if (!header.missing.length && !header.other.length) return null;
    return (
        <div className="space-y-1 text-sm text-muted-foreground">
            {header.missing.length > 0 && <p>Questions not in this file: {header.missing.join(", ")}.</p>}
            {header.other.length > 0 && (
                <p>Kept on each fitting record as other answers: {header.other.join(", ")}.</p>
            )}
        </div>
    );
}

function RunResult({
    file,
    run,
    locked,
    onOrder,
}: {
    file: PickedFile;
    run: PreviewRun;
    /** The file already has an import, so its date order is that import's. */
    locked: boolean;
    onOrder: (order: DateOrder) => void;
}) {
    if (run.kind === "header_error") {
        return (
            <div className="space-y-3">
                <Problem>
                    <p className="font-medium">This does not look like the fitting form&apos;s responses.</p>
                    {run.header.problems.map((p) => (
                        <p key={p}>{p}</p>
                    ))}
                    <p>Download the responses again as a CSV. Nothing was sent.</p>
                </Problem>
                <HeaderNotes header={run.header} />
            </div>
        );
    }
    if (run.kind === "dates_conflict") {
        return (
            <Problem>
                <p className="font-medium">Some dates in this file are month first and others are day first.</p>
                <p>Download the responses again from one sheet, so every date is written the same way. Nothing was sent.</p>
            </Problem>
        );
    }
    if (run.kind === "failed") return <Problem>The preview stopped: {run.error}</Problem>;

    const { summary, skipped } = run;
    return (
        <div className="space-y-6">
            <div className="space-y-1 text-sm text-muted-foreground">
                <p className="break-all">
                    <span className="font-medium text-foreground">{file.name}</span> · {int.format(summary.rowsTotal)}{" "}
                    rows · SHA-256 {file.sha256.slice(0, 12)}…
                </p>
                <HeaderNotes header={run.header} />
            </div>

            <DateOrderCard
                order={run.order}
                proven={run.dates.proven !== null}
                locked={locked}
                onOrder={onOrder}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {PLAN_OUTCOMES.map((o) => (
                    <Card key={o} className="gap-1 py-4">
                        <CardContent className="px-4">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                {OUTCOME_LABELS[o]}
                                <InfoTip label={OUTCOME_LABELS[o]}>
                                    <p>{OUTCOME_HINTS[o]}</p>
                                </InfoTip>
                            </p>
                            <p className="text-2xl font-semibold tabular-nums">{int.format(summary.outcomes[o])}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <p className="text-sm text-muted-foreground">
                {int.format(summary.rowsTotal)} rows ={" "}
                {PLAN_OUTCOMES.map((o) => int.format(summary.outcomes[o])).join(" + ")}. Every row is accounted for.{" "}
                {int.format(summary.withPhotos)} of the fittings have Drive photos.
            </p>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CountsCard title="Skipped, and why" empty="No row would be skipped." counts={summary.skipReasons} labels={SKIP_REASON_LABELS} />
                <CountsCard title="Read differently" empty="Every answer reads as typed." counts={summary.repairs} labels={REPAIR_LABELS} />
            </div>

            {skipped.length > 0 && <SkippedTable rows={skipped} />}

            <p className="text-sm text-muted-foreground">This is a preview. Nothing has been written to your customers.</p>
        </div>
    );
}

/** How the file's dates are read. Fixed when the file proves it; Staff choose when every date fits both. */
function DateOrderCard({
    order,
    proven,
    locked,
    onOrder,
}: {
    order: DateOrder;
    proven: boolean;
    locked: boolean;
    onOrder: (order: DateOrder) => void;
}) {
    if (proven || locked) {
        return (
            <p className="text-sm text-muted-foreground">
                Dates read {order === "mdy" ? "month first" : "day first"}
                {proven ? ", as the file's own dates show" : ", as this file's import read them"}, in Singapore time.
            </p>
        );
    }
    return (
        <Card className="gap-3">
            <CardHeader>
                <CardTitle className="text-sm">How does this file write its dates?</CardTitle>
                <CardDescription>
                    Every date in the file could be either, so check one you know in the sheet. Times are read as
                    Singapore time.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div role="group" aria-label="Date order" className="flex flex-col gap-2 sm:flex-row">
                    {(Object.keys(DATE_ORDER_LABELS) as DateOrder[]).map((o) => (
                        <Button
                            key={o}
                            size="sm"
                            variant={o === order ? "default" : "outline"}
                            aria-pressed={o === order}
                            onClick={() => o !== order && onOrder(o)}
                        >
                            {DATE_ORDER_LABELS[o]}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

type ApplyPhase =
    | { kind: "idle" }
    | { kind: "starting" }
    | { kind: "running"; done: number; total: number }
    | { kind: "error"; error: string }
    | { kind: "done"; run: ImportRun };

/** Start a batch (or continue the one this file already has), send its rows, then show the server's own counts. */
function ImportPanel({
    file,
    order,
    rowsTotal,
    summary,
    history,
    onRunning,
    onChanged,
}: {
    file: PickedFile;
    order: DateOrder;
    rowsTotal: number;
    summary: PreviewSummary;
    history: FittingBatchView[] | null;
    onRunning: (running: boolean) => void;
    onChanged: () => void;
}) {
    const existing = history ? batchForFile(history, file.sha256) : null;
    const [typed, setTyped] = useState("");
    const [phase, setPhase] = useState<ApplyPhase>({ kind: "idle" });
    const writes = summary.outcomes.created + summary.outcomes.matched_email + summary.outcomes.matched_phone;

    const run = async (batch: { id: string; rowsDone: number; rowsTotal: number }, batchOrder: DateOrder) => {
        onRunning(true);
        setPhase({ kind: "running", done: batch.rowsDone, total: batch.rowsTotal });
        try {
            const result = await runFittingImport({
                text: file.text,
                batch,
                order: batchOrder,
                applyChunk: (id, start, rows) => applyFittingImportChunk(id, start, rows),
                finish: (id) => finishFittingImport(id),
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
        let res: Awaited<ReturnType<typeof startFittingImport>>;
        try {
            res = await startFittingImport({
                fileName: file.name,
                sha256: file.sha256,
                rowsTotal,
                dateOrder: order,
                confirmation: typed.trim(),
            });
        } catch (e) {
            res = { ok: false, error: e instanceof Error ? e.message : "The import could not start." };
        }
        if (!res.ok) {
            setPhase({ kind: "error", error: res.error });
            return;
        }
        await run(res.batch, order);
    };

    if (phase.kind === "running") {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Importing…</CardTitle>
                    <CardDescription>
                        Keep this tab open. If it closes, pick the same file again and the import continues where it
                        stopped.
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

    if (phase.kind === "done") return <ImportOutcome run={phase.run} file={file} />;

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
                            Importing it again would change nothing. A newer download of the form, with more
                            responses, imports only the new ones.
                        </p>
                    </Notice>
                    <Button disabled>Import {int.format(writes)} fittings</Button>
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
                        {existing.runBy ? ` by ${existing.runBy}` : ""}, dates read{" "}
                        {existing.dateOrder === "mdy" ? "month first" : "day first"}.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {mismatch ? (
                        <MismatchProblem counts={existing} />
                    ) : (
                        <p className="text-sm">
                            Import stopped at {int.format(existing.rowsDone)} of {int.format(existing.rowsTotal)}. Every
                            row from there is decided again against your customers as they are now.
                        </p>
                    )}
                    {phase.kind === "error" && <Problem>{phase.error}</Problem>}
                    <Button
                        onClick={() =>
                            void run({ id: existing.id, rowsDone: existing.rowsDone, rowsTotal: existing.rowsTotal }, existing.dateOrder)
                        }
                    >
                        {mismatch ? "Check again" : "Continue the import"}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const confirmed = typed.trim() === IMPORT_CONFIRMATION && writes > 0;
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Import</CardTitle>
                <CardDescription>
                    {int.format(writes)} fitting records: {int.format(summary.outcomes.created)} for new customers and{" "}
                    {int.format(summary.outcomes.matched_email + summary.outcomes.matched_phone)} for customers you
                    already have, whose empty name and mobile are filled in and nothing else changes. Nobody is
                    emailed, and no login is created.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid max-w-xs gap-1.5">
                    <Label htmlFor="fitting-import-confirm">Type {IMPORT_CONFIRMATION} to confirm</Label>
                    <Input id="fitting-import-confirm" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
                </div>
                {phase.kind === "error" && <Problem>{phase.error}</Problem>}
                <Button disabled={!confirmed || phase.kind === "starting"} onClick={() => void onStart()}>
                    {phase.kind === "starting" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Import {int.format(writes)} fittings
                </Button>
            </CardContent>
        </Card>
    );
}

/** What the server says the import did, with the rows it skipped, named from this tab's copy. */
function ImportOutcome({ run, file }: { run: ImportRun; file: PickedFile }) {
    const skipped = skippedRows(parseFittingFormCsv(file.text).rows, run.outcomes);
    if (run.kind === "stopped") {
        return (
            <Problem>
                <p className="font-medium">The import stopped after {int.format(run.rowsDone)} rows.</p>
                <p>{run.error}</p>
                <p>Those rows are saved. Pick the same file to continue.</p>
            </Problem>
        );
    }
    const { status, counts, fittingRecords } = run.result;
    if (status === "mismatch") return <MismatchProblem counts={counts} />;
    if (status === "undone") return <Problem>This import was undone while it ran.</Problem>;
    if (status === "incomplete") return <Problem>The import has rows left. Pick the same file to continue.</Problem>;
    const cards: [string, number][] = [
        ["New customers", counts.created],
        ["Matched by email", counts.matchedEmail],
        ["Matched by mobile", counts.matchedPhone],
        ["Already imported", counts.alreadyImported],
        ["Skipped", skippedTotal(counts.skipped)],
    ];
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                        Imported {int.format(fittingRecords)} fitting records
                    </CardTitle>
                    <CardDescription>
                        {int.format(counts.rowsTotal)} rows = {countsSum(counts)}. Every row is accounted for.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {cards.map(([label, n]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="text-2xl font-semibold tabular-nums">{int.format(n)}</dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>
            {recordsWritten(counts) !== fittingRecords && (
                <Problem>
                    {int.format(recordsWritten(counts))} rows were written but the database holds{" "}
                    {int.format(fittingRecords)} fitting records for this import.
                </Problem>
            )}
            {skipped.length > 0 && <SkippedTable rows={skipped} />}
        </div>
    );
}

const STATE_LABELS = { applied: "Applied", stopped: "Stopped", undone: "Undone" } as const;

function HistoryCard({ history, busy, onChanged }: { history: FittingBatchView[] | null; busy: boolean; onChanged: () => void }) {
    return (
        <div className="space-y-3">
            <h2 className="text-base font-semibold">Import history</h2>
            {history === null ? (
                <Problem>The import history could not be read. Reload the page.</Problem>
            ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fitting imports yet.</p>
            ) : (
                <div className="min-w-0 overflow-x-auto rounded-xl border">
                    <Table className="max-md:block">
                        <TableHeader className="max-md:hidden">
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">File</TableHead>
                                <TableHead className="px-4">Run by</TableHead>
                                <TableHead className="px-4 text-right">New customers</TableHead>
                                <TableHead className="px-4 text-right">Matched</TableHead>
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

function HistoryRow({ batch, busy, onChanged }: { batch: FittingBatchView; busy: boolean; onChanged: () => void }) {
    const state = batchState(batch);
    const mismatch = batchMismatch(batch);
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
                </p>
                <p className="text-xs text-muted-foreground md:hidden">Run by {batch.runBy ?? "—"}</p>
            </TableCell>
            <TableCell className="px-4 align-top max-md:hidden">{batch.runBy ?? "—"}</TableCell>
            <CountCell label="New customers" value={batch.created} />
            <CountCell label="Matched" value={batch.matchedEmail + batch.matchedPhone} />
            <CountCell label="Already imported" value={batch.alreadyImported} />
            <CountCell label="Skipped" value={skippedTotal(batch.skipped)} />
            <TableCell className="px-4 align-top max-md:col-span-2 max-md:p-0">
                <Badge variant={state === "applied" ? "secondary" : "outline"}>{STATE_LABELS[state]}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                    {state === "applied" && formatAdminDateMY(batch.appliedAt)}
                    {state === "undone" && formatAdminDateMY(batch.rolledBackAt)}
                    {state === "stopped" && !mismatch && `at ${int.format(batch.rowsDone)} of ${int.format(batch.rowsTotal)}`}
                </p>
                {mismatch && (
                    <p className="mt-1 text-xs font-medium text-destructive">
                        Does not reconcile: {int.format(mismatch.accounted)} of {int.format(batch.rowsTotal)} rows
                        accounted for
                    </p>
                )}
                {batch.undoCounts && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {int.format(batch.undoCounts.fittingsRemoved)} fittings and{" "}
                        {int.format(batch.undoCounts.customersRemoved)} customers removed
                    </p>
                )}
            </TableCell>
            <TableCell className="px-4 text-right align-top max-md:col-span-2 max-md:p-0">
                {state !== "undone" && <UndoButton batch={batch} disabled={busy} onChanged={onChanged} />}
            </TableCell>
        </TableRow>
    );
}

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
function UndoButton({ batch, disabled, onChanged }: { batch: FittingBatchView; disabled: boolean; onChanged: () => void }) {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<UndoPhase>({ kind: "loading" });
    const [typed, setTyped] = useState("");

    const onOpen = async () => {
        setOpen(true);
        setTyped("");
        setPhase({ kind: "loading" });
        try {
            const res = await previewFittingImportUndo(batch.id);
            setPhase(res.ok ? { kind: "ready", counts: res.counts } : { kind: "error", error: res.error });
        } catch (e) {
            setPhase({ kind: "error", error: e instanceof Error ? e.message : "Could not check the undo." });
        }
    };

    const onConfirm = async (counts: UndoCounts) => {
        setPhase({ kind: "undoing", counts });
        try {
            const res = await undoFittingImport(batch.id, typed.trim());
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
                            <Input id={`undo-confirm-${batch.id}`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
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
                    {int.format(counts.fittingsRemoved)} fitting records {done ? "were removed" : "will be removed"}
                </span>
                , with {int.format(counts.customersRemoved)} customers this import created.
            </p>
            {counts.customersKept > 0 && (
                <p className="text-muted-foreground">
                    {int.format(counts.customersKept)} customers it created {done ? "were" : "are"} kept, because they
                    have signed in ({int.format(counts.keptSignedIn)}) or have an order, booking, note or another
                    fitting since ({int.format(counts.keptReferenced)}).
                </p>
            )}
            <p className="text-muted-foreground">
                Customers it matched keep the name and mobile it filled in: those are true.
            </p>
        </div>
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
                            <TableHead className="px-4">Name</TableHead>
                            <TableHead className="px-4">Contact</TableHead>
                            <TableHead className="px-4">Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.slice(0, SKIPPED_SHOWN).map((r) => (
                            <TableRow key={r.row}>
                                <TableCell className="px-4 tabular-nums text-muted-foreground">{r.row + 1}</TableCell>
                                <TableCell className="px-4">{r.name || "—"}</TableCell>
                                <TableCell className="px-4 break-all">{r.email || r.mobile || "—"}</TableCell>
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
