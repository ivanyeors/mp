"use client";

import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Info, Link2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import type { SendAllowance } from "@/lib/customer-migration/campaign-ledger";
import {
    allowanceMeters,
    allowanceSummary,
    boardTally,
    CHECK_AREA_LABEL,
    type BoardRow,
    type CheckBoard,
    type CheckState,
    type SendStep,
} from "@/lib/email-campaigns/send-flow";
import { cn } from "@/lib/utils";

const STATE_LOOK: Record<CheckState, { Icon: typeof CheckCircle2; tone: string; label: string; bar: string }> = {
    pass: { Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-500", label: "Done", bar: "bg-emerald-600 dark:bg-emerald-500" },
    fail: { Icon: XCircle, tone: "text-destructive", label: "Not yet", bar: "bg-destructive" },
    waiting: { Icon: CircleDashed, tone: "text-muted-foreground", label: "Waiting", bar: "bg-muted-foreground/40" },
    override: { Icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400", label: "Overridden", bar: "bg-amber-500" },
    advice: { Icon: Info, tone: "text-sky-600 dark:text-sky-400", label: "Recommended", bar: "bg-sky-500" },
};

export function StatusIcon({ state, className }: { state: CheckState; className?: string }) {
    const { Icon, tone, label } = STATE_LOOK[state];
    return <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone, className)} aria-label={label} />;
}

function Tip({ trigger, children, className }: { trigger: ReactNode; children: ReactNode; className?: string }) {
    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const open = pinned || hovered;
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    setPinned(false);
                    setHovered(false);
                }
            }}
        >
            <PopoverAnchor asChild>
                <button
                    type="button"
                    aria-expanded={open}
                    className={cn("text-left outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-press", className)}
                    onClick={() => setPinned((p) => !p)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
                >
                    {trigger}
                </button>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                side="top"
                className="w-80 space-y-1.5 p-3 text-xs leading-relaxed"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {children}
            </PopoverContent>
        </Popover>
    );
}

function Links({ row }: { row: Pick<BoardRow, "needs" | "feeds"> }) {
    const lines = [row.needs, row.feeds].filter((l): l is string => Boolean(l));
    if (!lines.length) return null;
    return (
        <>
            {lines.map((line) => (
                <span key={line} className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Link2 className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    {line}
                </span>
            ))}
        </>
    );
}

const hook = "before:pointer-events-none before:absolute before:rounded-bl-md before:border-b-2 before:border-l-2 before:border-muted-foreground/50";
const branchBox = `relative ml-8 ${hook} before:-left-3 before:-top-2 before:h-[29px] before:w-3`;
const branchLine = `relative ml-6 ${hook} before:-left-[17px] before:-top-1 before:h-[18px] before:w-3.5 max-md:before:h-6`;

function AttentionRow({ row, showArea }: { row: BoardRow; showArea: boolean }) {
    const boxed = row.state !== "advice";
    return (
        <li
            data-check={row.key}
            className={cn(
                "flex items-start gap-2.5 text-sm",
                boxed && "rounded-lg border px-3 py-2.5",
                row.state === "fail" && "border-destructive/40 bg-destructive/5",
                row.state === "waiting" && "border-dashed",
                row.state === "override" && "border-amber-500/40 bg-amber-500/5",
                !boxed && "px-3",
                row.nested && branchBox,
            )}
        >
            <StatusIcon state={row.state} />
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="break-words font-medium">{row.title}</span>
                    {showArea ? <span className="text-[11px] text-muted-foreground">{CHECK_AREA_LABEL[row.area]}</span> : null}
                </span>
                <span className="block break-words text-xs text-muted-foreground">{row.detail}</span>
                {row.fix ? <span className="mt-1 block break-words text-xs">{row.fix}</span> : null}
                {row.state === "waiting" ? null : <Links row={row} />}
            </span>
        </li>
    );
}

function PassedRow({ row }: { row: BoardRow }) {
    return (
        <li data-check={row.key} className={cn("flex", row.nested && branchLine)}>
            <Tip
                className="-mx-1.5 flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 max-md:min-h-11 max-md:py-2.5"
                trigger={
                    <>
                        <StatusIcon state="pass" />
                        <span className="min-w-0">
                            <span className="break-words underline decoration-muted-foreground/40 decoration-dotted underline-offset-4">{row.title}</span>
                            {row.needs ? (
                                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <Link2 className="h-3 w-3" aria-hidden />
                                    {row.needs}
                                </span>
                            ) : null}
                        </span>
                    </>
                }
            >
                <p className="font-medium text-foreground">{row.title}</p>
                <p className="break-words text-muted-foreground">{row.detail}</p>
                {row.feeds ? <Links row={{ needs: null, feeds: row.feeds }} /> : null}
            </Tip>
        </li>
    );
}

function TallyBar({ tally }: { tally: CheckBoard["tally"] }) {
    const parts = (["fail", "waiting", "override", "pass"] as const).filter((s) => tally[s] > 0);
    return (
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {parts.map((s) => (
                <span key={s} className={cn("h-full rounded-full", STATE_LOOK[s].bar)} style={{ flexGrow: tally[s] }} />
            ))}
        </div>
    );
}

function MiniRow({ row, showArea }: { row: BoardRow; showArea: boolean }) {
    return (
        <li data-check={row.key} className={cn("flex", row.nested && branchLine)}>
            <Tip
                className={cn(
                    "-mx-1.5 flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60 max-md:min-h-11 max-md:py-2.5",
                    row.state === "fail" && "bg-destructive/5",
                )}
                trigger={
                    <>
                        <StatusIcon state={row.state} />
                        <span className="min-w-0 flex-1 truncate underline decoration-muted-foreground/40 decoration-dotted underline-offset-4">{row.title}</span>
                        {showArea ? <span className="mt-0.5 hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{CHECK_AREA_LABEL[row.area]}</span> : null}
                    </>
                }
            >
                <p className="font-medium text-foreground">{row.title}</p>
                <p className="break-words text-muted-foreground">{row.detail}</p>
                {row.fix ? <p className="break-words text-foreground">{row.fix}</p> : null}
                {row.state === "waiting" ? null : <Links row={row} />}
            </Tip>
        </li>
    );
}

const COUNTED: readonly CheckState[] = ["fail", "waiting", "override", "pass", "advice"];

const MINI_ROWS = 3;

function Toggle({ open, controls, onToggle, closed }: { open: boolean; controls: string; onToggle: () => void; closed: ReactNode }) {
    return (
        <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
            className="-my-1 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
        >
            {open ? "Less" : closed}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </Button>
    );
}

export function CheckBoardView({ board, headline = board.headline }: { board: CheckBoard; headline?: string }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const areas = new Set([...board.attention, ...board.passed.flatMap((g) => g.rows)].map((r) => r.area));
    const many = areas.size > 1;
    const lead: CheckState = board.tally.fail || board.tally.waiting ? "fail" : board.tally.override ? "override" : "pass";
    const shown = open ? board.attention : board.attention.slice(0, MINI_ROWS);
    const more = board.attention.length - shown.length;
    const areaAt = (r: BoardRow, i: number) => many && r.area !== shown[i - 1]?.area;
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <StatusIcon state={lead} className="mt-0" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5" role="status">
                        <p className="text-sm font-medium">{headline}</p>
                        <p className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                            <span className="sr-only">{boardTally(board.tally)}</span>
                            {COUNTED.filter((s) => board.tally[s] > 0).map((s) => (
                                <span key={s} className="inline-flex items-center gap-0.5" aria-hidden>
                                    <StatusIcon state={s} className="mt-0 h-3.5 w-3.5" />
                                    {board.tally[s]}
                                </span>
                            ))}
                        </p>
                    </div>
                    <Toggle open={open} controls={id} onToggle={() => setOpen((o) => !o)} closed="Details" />
                </div>
                <TallyBar tally={board.tally} />
            </div>
            <div id={id} className="space-y-3">
                {shown.length ? (
                    <ul className={open ? "space-y-2" : "space-y-0.5"} aria-label="Needs a look">
                        {shown.map((r, i) =>
                            open ? (
                                <AttentionRow key={`${r.state}:${r.key}`} row={r} showArea={areaAt(r, i)} />
                            ) : (
                                <MiniRow key={`${r.state}:${r.key}`} row={r} showArea={areaAt(r, i)} />
                            ),
                        )}
                    </ul>
                ) : null}
                {more > 0 ? (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="relative -mt-2 pl-6 text-xs text-muted-foreground underline underline-offset-2 after:absolute after:-inset-y-3.5 after:inset-x-0 after:content-[''] hover:text-foreground active:opacity-60"
                    >
                        +{more} more
                    </button>
                ) : null}
                {open && board.passed.length ? (
                    <div className="space-y-3">
                        {board.passed.map((g) => (
                            <div key={g.area} className="space-y-0.5">
                                {many ? <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p> : null}
                                <ul className="space-y-0.5">
                                    {g.rows.map((r) => (
                                        <PassedRow key={r.key} row={r} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function StepStrip({
    steps,
    renderItems,
    onShowReady,
}: {
    steps: readonly SendStep[];
    renderItems: (step: SendStep) => ReactNode;
    onShowReady: () => void;
}) {
    const rank: Record<CheckState, number> = { fail: 0, waiting: 1, override: 2, advice: 3, pass: 4 };
    const left = steps.filter((s) => s.state !== "pass").sort((a, b) => rank[a.state] - rank[b.state]);
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 max-md:gap-1.5">
                <ol className="flex flex-wrap gap-2 max-md:gap-1.5" aria-label="Before you send">
                    {steps.map((step, i) => (
                        <li key={step.key} data-send-step={step.key}>
                            <Tip
                                className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border py-1 pl-2 pr-3 text-xs font-medium hover:bg-muted/60 max-md:size-11 max-md:justify-center max-md:p-0",
                                    step.state === "fail" && "border-destructive/40 bg-destructive/5",
                                    step.state === "waiting" && "border-dashed",
                                )}
                                trigger={
                                    <>
                                        <StatusIcon state={step.done ? "pass" : step.state} className="mt-0 max-md:h-5 max-md:w-5" />
                                        <span className="sr-only">Step {i + 1}: </span>
                                        <span className="max-md:sr-only">{step.label}</span>
                                    </>
                                }
                            >
                                <p className="font-medium text-foreground">{step.label}</p>
                                <p className="break-words text-muted-foreground">{step.detail}</p>
                                {step.needs ? <Links row={{ needs: step.needs, feeds: null }} /> : null}
                                {step.fromReady ? <Links row={{ needs: "From Ready to send?", feeds: null }} /> : null}
                            </Tip>
                        </li>
                    ))}
                </ol>
                {left.length ? (
                    <Toggle
                        open={open}
                        controls={id}
                        onToggle={() => setOpen((o) => !o)}
                        closed={
                            <>
                                {left.length} left<span className="max-md:hidden"> to do</span>
                            </>
                        }
                    />
                ) : null}
            </div>
            {open && left.length ? (
                <ul id={id} className="space-y-2" aria-label="Left to do">
                    {left.map((step) => (
                        <li
                            key={step.key}
                            data-send-step-detail={step.key}
                            className={cn(
                                "flex items-start gap-2.5 text-sm",
                                step.state === "fail" && "rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5",
                                step.state === "waiting" && "rounded-lg border border-dashed px-3 py-2.5",
                                step.state === "advice" && "px-3",
                            )}
                        >
                            <StatusIcon state={step.state} />
                            <span className="min-w-0 flex-1">
                                <span className="block font-medium">{step.label}</span>
                                <span className="block break-words text-xs text-muted-foreground">{step.detail}</span>
                                {renderItems(step)}
                                {step.fromReady && !step.done && !step.items?.length ? (
                                    <button
                                        type="button"
                                        onClick={onShowReady}
                                        className="relative mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] hover:no-underline active:opacity-60"
                                    >
                                        <Link2 className="h-3 w-3" aria-hidden />
                                        See Ready to send?
                                    </button>
                                ) : null}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

export function AllowanceMeters({ allowance }: { allowance: SendAllowance }) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-4">
                {allowanceMeters(allowance).map((m) => (
                    <div key={m.label} className="flex min-w-0 flex-col justify-between gap-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                            <span className="font-medium">{m.label}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {m.used.toLocaleString("en-SG")} of {m.limit.toLocaleString("en-SG")}
                            </span>
                        </div>
                        <Progress value={m.percent} aria-label={`${m.label}: ${m.text}`} />
                    </div>
                ))}
            </div>
            <p className={allowance.remaining === 0 ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
                {allowanceSummary(allowance)}
            </p>
        </div>
    );
}
