"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BellRing,
    Clock,
    List,
    ListTodo,
    Loader2,
    Map as MapIcon,
    Megaphone,
    RefreshCw,
    Ruler,
    ShoppingCart,
    Sparkles,
    Star,
    StickyNote,
    Trash2,
    Undo2,
    UserCheck,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
    JOURNEY_TONE_LABEL,
    JOURNEY_TONE_RULE,
    buildChapters,
    chapterEntries,
    gapLabel,
    journeyNow,
    visibleFilters,
    type JourneyChapter,
    type JourneyFilter,
    type JourneyNow,
    type JourneyTone,
} from "@/lib/crm/journey/chapters";
import { formatDueOn, sortFollowUps, type CustomerFollowUp, type CustomerFollowUpsData } from "@/lib/crm/followup-rules";
import { canDeleteNote, type CustomerNote } from "@/lib/crm/note-rules";
import { GOOGLE_REPLY_LABELS } from "@/lib/crm/reviews";
import type { ShownTimelineEntry, TimelineGroup } from "@/lib/crm/timeline/types";
import type { MigratedCustomerResult } from "@/lib/customer-migration/overview";
import { cn } from "@/lib/utils";
import { FollowUpActions, FollowUpAssignee, FollowUpDue } from "../followup-parts";
import { FromShopifyCard } from "./customer-account-cards";
import { JourneyComposer, type ComposerMode } from "./journey-composer";
import { JourneyMap, type MapStop } from "./journey-map";

type TimelinePage = {
    entries: ShownTimelineEntry[];
    next: string | null;
    groups: TimelineGroup[];
    unavailable: string[];
};

const GROUP_ICONS: Record<string, LucideIcon> = {
    orders: ShoppingCart,
    results: Sparkles,
    fittings: Ruler,
    readjustments: RefreshCw,
    returns: Undo2,
    reviews: Star,
    aftercare: BellRing,
    marketing: Megaphone,
    account: UserCheck,
    notes: StickyNote,
    followups: ListTodo,
};

const TONE_DOT: Record<JourneyTone, string> = {
    good: "bg-emerald-500 dark:bg-emerald-400",
    steady: "bg-slate-400 dark:bg-slate-500",
    care: "bg-orange-500 dark:bg-orange-400",
};

const NOW_ID = "now";
const NEXT_ID = "next";

function statusLabel(status: string): string {
    const spaced = status.replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function fetchPage(customerId: string, before: string | null): Promise<TimelinePage> {
    const qs = new URLSearchParams();
    if (before) qs.set("before", before);
    const res = await fetch(`/api/settings/customers/${customerId}/timeline?${qs}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(typeof body?.error === "string" ? body.error : "Could not load the journey");
    return body as TimelinePage;
}

async function fetchFollowUps(customerId: string): Promise<CustomerFollowUpsData> {
    const res = await fetch(`/api/shop/customers/${customerId}/followups`);
    if (!res.ok) throw new Error("Could not load follow-ups");
    return (await res.json()) as CustomerFollowUpsData;
}

function chapterWhen(chapter: JourneyChapter): string {
    const from = formatAdminDateMY(chapter.from);
    const to = formatAdminDateMY(chapter.to);
    return from === to ? from : `${from} to ${to}`;
}

export type JourneyViewer = { userId: string; grantsAll: boolean };

export function CustomerJourney({
    customerId,
    canEdit,
    viewer,
    initialNotes,
    migration,
    importHistoryHref,
    nextStepText,
    stageLabel,
    composerMode,
    onComposerModeChange,
    composerFocus,
    reloadSignal,
    onAnswerReview,
}: {
    customerId: string;
    canEdit: boolean;
    viewer: JourneyViewer;
    initialNotes: CustomerNote[] | null;
    migration: MigratedCustomerResult | undefined;
    importHistoryHref: string | null;
    nextStepText: string | null;
    stageLabel: string | null;
    composerMode: ComposerMode;
    onComposerModeChange: (mode: ComposerMode) => void;
    composerFocus: number;
    reloadSignal: number;
    onAnswerReview: () => void;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;

    const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
    const [entries, setEntries] = useState<ShownTimelineEntry[]>([]);
    const [next, setNext] = useState<string | null>(null);
    const [groups, setGroups] = useState<TimelineGroup[]>([]);
    const [unavailable, setUnavailable] = useState<string[]>([]);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [followUps, setFollowUps] = useState<CustomerFollowUpsData | null>(null);
    const [notes, setNotes] = useState<CustomerNote[]>(initialNotes ?? []);
    const [filterKey, setFilterKey] = useState<string | null>(null);
    const [view, setView] = useState<"map" | "list" | null>(null);
    const [selectedId, setSelectedId] = useState<string>(NOW_ID);
    const pages = useRef(0);
    const timelineReads = useRef({ started: 0, shown: 0 });
    const followUpReads = useRef({ started: 0, shown: 0 });

    const refresh = useCallback(async () => {
        const read = ++timelineReads.current.started;
        try {
            const page = await fetchPage(customerId, null);
            if (read < timelineReads.current.shown) return;
            timelineReads.current.shown = read;
            setEntries((prev) => {
                const oldest = page.entries.length ? Date.parse(page.entries[page.entries.length - 1]!.at) : Infinity;
                const fresh = new Set(page.entries.map((e) => e.id));
                const older = page.next ? prev.filter((e) => !fresh.has(e.id) && Date.parse(e.at) < oldest) : [];
                return [...page.entries, ...older];
            });
            if (pages.current <= 1) setNext(page.next);
            pages.current = Math.max(pages.current, 1);
            setGroups(page.groups);
            setUnavailable(page.unavailable);
            setStatus("ready");
        } catch {
            setStatus((s) => (s === "ready" ? s : "error"));
        }
    }, [customerId]);

    const refreshFollowUps = useCallback(async () => {
        const read = ++followUpReads.current.started;
        try {
            const data = await fetchFollowUps(customerId);
            if (read < followUpReads.current.shown) return;
            followUpReads.current.shown = read;
            setFollowUps(data);
        } catch {}
    }, [customerId]);

    useEffect(() => {
        void refresh();
        void refreshFollowUps();
    }, [refresh, refreshFollowUps, reloadSignal]);

    const rereadTimelineOverLocalChange = () => {
        timelineReads.current.shown = ++timelineReads.current.started;
        void refresh();
    };
    const rereadFollowUpsOverLocalChange = () => {
        followUpReads.current.shown = ++followUpReads.current.started;
        void refreshFollowUps();
    };

    const loadOlder = async () => {
        if (!next) return;
        setLoadingOlder(true);
        try {
            const older = await fetchPage(customerId, next);
            pages.current += 1;
            setEntries((prev) => {
                const have = new Set(prev.map((e) => e.id));
                return [...prev, ...older.entries.filter((e) => !have.has(e.id))];
            });
            setNext(older.next);
            setUnavailable((u) => [...new Set([...u, ...older.unavailable])]);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not load older entries");
        } finally {
            setLoadingOlder(false);
        }
    };

    const complete = status === "ready" && next === null;
    const chapters = useMemo(() => buildChapters(entries, { complete }), [entries, complete]);
    const filters = useMemo(() => visibleFilters(groups.map((g) => g.key)), [groups]);
    const filter: JourneyFilter | null = filters.find((f) => f.key === filterKey) ?? null;

    const openFollowUps = useMemo(() => (followUps?.rows ?? []).filter((f) => !f.doneAt), [followUps]);
    const now: JourneyNow = useMemo(
        () => journeyNow(openFollowUps, followUps?.today ?? new Date().toISOString().slice(0, 10)),
        [openFollowUps, followUps?.today],
    );
    const nowShown = !filter || filter.groups.includes("followups");

    const [nowIso] = useState(() => new Date().toISOString());

    const { stops, gaps } = useMemo(() => {
        const stops: MapStop[] = chapters.map((c) => ({
            id: c.id,
            title: c.title,
            when: formatAdminDateMY(c.from),
            tone: c.tone,
            kind: "past",
            dimmed: filter ? chapterEntries(c, filter).length === 0 : false,
            count: c.entries.length,
        }));
        const gaps: Array<string | null> = chapters.map((c, i) => {
            const after = chapters[i + 1];
            return gapLabel(c.to, after ? after.from : nowIso);
        });
        stops.push({ id: NOW_ID, title: "Now", when: stageLabel ?? "Today", tone: now.tone, kind: "now", dimmed: !nowShown });
        if (now.next) {
            const wait = gapLabel(nowIso, `${now.next.dueOn}T12:00:00+08:00`);
            gaps.push(wait ? `in ${wait}` : null);
            stops.push({
                id: NEXT_ID,
                title: now.next.title,
                when: `Due ${formatDueOn(now.next.dueOn)}`,
                tone: "steady",
                kind: "next",
                dimmed: !nowShown,
            });
        }
        return { stops, gaps };
    }, [chapters, filter, now, nowIso, nowShown, stageLabel]);

    const hasMap = chapters.length >= 2;
    const selected = chapters.find((c) => c.id === selectedId) ?? null;

    const onFollowUpChange = (id: string, nextRow: CustomerFollowUp | null) => {
        setFollowUps((d) =>
            d
                ? {
                      ...d,
                      rows: sortFollowUps(nextRow ? d.rows.map((r) => (r.id === id ? nextRow : r)) : d.rows.filter((r) => r.id !== id)),
                  }
                : d,
        );
        rereadFollowUpsOverLocalChange();
        if (nextRow) void refresh();
        else {
            setEntries((prev) => prev.filter((e) => !(e.ref.type === "customer_followup" && e.ref.id === id)));
            rereadTimelineOverLocalChange();
        }
    };

    const deleteNote = async (note: CustomerNote) => {
        if (!window.confirm("Delete this note? Staff will no longer see it.")) return;
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/notes/${note.id}`, { method: "DELETE" });
            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(typeof payload?.error === "string" ? payload.error : "Could not delete the note");
            }
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
            setEntries((prev) => prev.filter((e) => e.id !== `note.added:${note.id}`));
            rereadTimelineOverLocalChange();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete the note");
        }
    };

    const entryActions = (entry: ShownTimelineEntry): ReactNode => {
        if (!canEdit) return null;
        if (entry.kind === "note.added") {
            const note = notes.find((n) => n.id === entry.ref.id);
            if (!note || !canDeleteNote(viewer, note)) return null;
            return (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                    aria-label="Delete note"
                    onClick={() => void deleteNote(note)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            );
        }
        if (entry.kind === "google_review.written" && entry.status === GOOGLE_REPLY_LABELS.waiting) {
            return (
                <Button variant="outline" size="sm" className="h-8" onClick={onAnswerReview}>
                    <Star className="h-4 w-4" />
                    Reply to this review
                </Button>
            );
        }
        if (entry.kind === "follow_up.added" && followUps) {
            const row = followUps.rows.find((f) => f.id === entry.ref.id);
            if (!row) return null;
            return (
                <FollowUpActions
                    followUp={row}
                    assignees={followUps.assignees}
                    onChange={(nextRow) => onFollowUpChange(row.id, nextRow)}
                    allowDelete
                />
            );
        }
        return null;
    };

    const shopifyFor = (chapter: JourneyChapter): ReactNode =>
        chapter.entries.some((e) => e.kind === "account.imported") ? (
            <FromShopifyCard migration={migration} importHistoryHref={importHistoryHref} bare />
        ) : null;
    const shopifyShown = chapters.some((c) => c.entries.some((e) => e.kind === "account.imported"));

    const chapterCard = (chapter: JourneyChapter) => (
        <ChapterCard
            key={chapter.id}
            chapter={chapter}
            entries={chapterEntries(chapter, filter)}
            filtered={filter !== null}
            locale={locale}
            actions={entryActions}
            extra={shopifyFor(chapter)}
        />
    );

    const nowCard = (
        <NowCard
            now={now}
            nextStepText={nextStepText}
            followUps={openFollowUps}
            today={followUps?.today ?? null}
            actions={(f) =>
                canEdit && followUps ? (
                    <FollowUpActions
                        followUp={f}
                        assignees={followUps.assignees}
                        onChange={(nextRow) => onFollowUpChange(f.id, nextRow)}
                        allowDelete
                    />
                ) : null
            }
        />
    );

    const mapOnly = view === "map" ? "" : view === "list" ? "hidden" : "max-md:hidden";
    const listOnly = !hasMap ? "" : view === "list" ? "" : view === "map" ? "hidden" : "md:hidden";

    const newestFirst = chapters.slice().reverse();
    const listed = filter ? newestFirst.filter((c) => chapterEntries(c, filter).length > 0) : newestFirst;

    return (
        <div className="space-y-4 md:space-y-6">
            {canEdit ? (
                <JourneyComposer
                    customerId={customerId}
                    mode={composerMode}
                    onModeChange={onComposerModeChange}
                    focusSignal={composerFocus}
                    followUps={followUps}
                    onNoteAdded={(note) => {
                        setNotes((prev) => [note, ...prev]);
                        void refresh();
                    }}
                    onFollowUpAdded={(row) => {
                        setFollowUps((d) => (d ? { ...d, rows: sortFollowUps([row, ...d.rows]) } : d));
                        rereadFollowUpsOverLocalChange();
                        void refresh();
                    }}
                />
            ) : null}

            <Card className="gap-4">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <CardTitle className="text-base">Journey</CardTitle>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {status === "ready" ? journeySummary(chapters, entries.length, complete, nowIso) : "Everything that happened, as chapters."}
                            </p>
                        </div>
                        {hasMap ? (
                            <div role="group" aria-label="Show as" className="inline-flex rounded-lg border p-0.5">
                                {(["map", "list"] as const).map((v) => {
                                    const on = view === v;
                                    const Icon = v === "map" ? MapIcon : List;
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => setView(v)}
                                            className={cn(
                                                "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors max-md:h-10",
                                                "focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-press",
                                                on
                                                    ? "bg-primary text-primary-foreground"
                                                    : cn(
                                                          "text-muted-foreground hover:text-foreground",
                                                          view === null && (v === "map" ? "md:bg-muted md:text-foreground" : "max-md:bg-muted max-md:text-foreground"),
                                                      ),
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {v === "map" ? "Map" : "List"}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>
                    {filters.length > 1 ? (
                        <div className="flex gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 md:flex-wrap" role="group" aria-label="Show">
                            <FilterChip on={filter === null} onClick={() => setFilterKey(null)}>
                                All
                            </FilterChip>
                            {filters.map((f) => (
                                <FilterChip key={f.key} on={filter?.key === f.key} onClick={() => setFilterKey(filter?.key === f.key ? null : f.key)}>
                                    {f.label}
                                </FilterChip>
                            ))}
                        </div>
                    ) : null}
                </CardHeader>

                {status === "loading" ? (
                    <CardContent>
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    </CardContent>
                ) : status === "error" ? (
                    <CardContent>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>Could not load the journey.</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setStatus("loading");
                                    void refresh();
                                }}
                            >
                                Try again
                            </Button>
                        </div>
                    </CardContent>
                ) : (
                    <>
                        {unavailable.length ? (
                            <CardContent>
                                <p className="text-xs text-muted-foreground">
                                    Could not load {unavailable.join(", ")} this time; the rest is shown.
                                </p>
                            </CardContent>
                        ) : null}
                        {hasMap ? (
                            <div className={mapOnly}>
                                <JourneyMap stops={stops} gaps={gaps} selectedId={selectedId} onSelect={setSelectedId} />
                                <CardContent className="pt-3">
                                    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="What each height means">
                                        {(["good", "steady", "care"] as const).map((tone) => (
                                            <li key={tone} className="flex items-center gap-1.5">
                                                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
                                                <span>
                                                    <span className="font-medium text-foreground">{JOURNEY_TONE_LABEL[tone]}</span>
                                                    {": "}
                                                    {JOURNEY_TONE_RULE[tone]}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </div>
                        ) : null}
                        {next ? (
                            <CardContent>
                                <Button variant="outline" size="sm" className="w-full" onClick={() => void loadOlder()} disabled={loadingOlder}>
                                    {loadingOlder ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    Load older chapters
                                </Button>
                            </CardContent>
                        ) : null}
                    </>
                )}
            </Card>

            {status === "ready" ? (
                <>
                    {hasMap ? (
                        <div className={cn("space-y-4 md:space-y-6", mapOnly)} aria-live="polite">
                            {selectedId === NOW_ID || selectedId === NEXT_ID || !selected ? nowCard : chapterCard(selected)}
                        </div>
                    ) : null}

                    <div className={cn("space-y-3", listOnly)}>
                        {nowShown ? nowCard : null}
                        {listed.map((chapter, i) => {
                            const newer = i === 0 ? null : listed[i - 1]!;
                            const quiet = gapLabel(chapter.to, newer ? newer.from : nowIso);
                            return (
                                <div key={chapter.id} className="space-y-3">
                                    {quiet ? <QuietLine>{quiet} quiet</QuietLine> : null}
                                    {chapterCard(chapter)}
                                </div>
                            );
                        })}
                        {listed.length === 0 && !nowShown ? (
                            <p className="px-1 text-sm text-muted-foreground">Nothing of this kind yet.</p>
                        ) : null}
                        {chapters.length === 0 && !filter ? (
                            <p className="px-1 text-sm text-muted-foreground">Nothing has happened with this customer yet.</p>
                        ) : null}
                    </div>

                    {!shopifyShown && complete ? (
                        <FromShopifyCard migration={migration} importHistoryHref={importHistoryHref} />
                    ) : null}
                </>
            ) : null}
        </div>
    );
}

function journeySummary(chapters: JourneyChapter[], events: number, complete: boolean, nowIso: string): string {
    if (chapters.length === 0) return "Nothing has happened yet.";
    const parts = [
        `${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`,
        `${events} ${events === 1 ? "entry" : "entries"}`,
    ];
    if (complete) {
        const span = gapLabel(chapters[0]!.from, nowIso);
        if (span) parts.unshift(`${span} since the first`);
    } else {
        parts.push("older ones not loaded yet");
    }
    return parts.join(" · ");
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <Button
            type="button"
            size="sm"
            variant={on ? "default" : "outline"}
            aria-pressed={on}
            className="h-7 min-w-11 shrink-0 rounded-full px-3 text-xs"
            onClick={onClick}
        >
            {children}
        </Button>
    );
}

function QuietLine({ children }: { children: ReactNode }) {
    return (
        <p className="flex items-center gap-3 px-1 text-xs text-muted-foreground" aria-label={`${String(children)}`}>
            <span className="h-px flex-1 bg-border" />
            {children}
            <span className="h-px flex-1 bg-border" />
        </p>
    );
}

function ToneLine({ tone, reason }: { tone: JourneyTone; reason: string | null }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
            <span className="font-medium text-foreground">{JOURNEY_TONE_LABEL[tone]}</span>
            {reason ? <span>· {reason}</span> : null}
        </span>
    );
}

export function ChapterCard({
    chapter,
    entries,
    filtered,
    locale,
    actions,
    extra,
}: {
    chapter: JourneyChapter;
    entries: ShownTimelineEntry[];
    filtered: boolean;
    locale: string;
    actions: (entry: ShownTimelineEntry) => ReactNode;
    extra?: ReactNode;
}) {
    return (
        <Card className="@container gap-4">
            <CardHeader className="gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <CardTitle className="text-base">{chapter.title}</CardTitle>
                    <span className="text-xs text-muted-foreground">{chapterWhen(chapter)}</span>
                </div>
                <ToneLine tone={chapter.tone} reason={chapter.reason} />
            </CardHeader>
            <CardContent className="space-y-4">
                {entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing of this kind in this chapter.</p>
                ) : (
                    <ul className="space-y-3 max-md:space-y-1">
                        {entries.map((entry) => {
                            const Icon = GROUP_ICONS[entry.group] ?? Clock;
                            const action = actions(entry);
                            return (
                                <li
                                    key={entry.id}
                                    className={cn(
                                        "flex gap-3 text-sm max-md:relative max-md:-mx-2 max-md:min-h-11 max-md:rounded-md max-md:px-2 max-md:py-1.5",
                                        entry.ref.href && !action && "max-md:transition-colors max-md:has-[a:active]:bg-press",
                                    )}
                                >
                                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
                                        <Icon className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                                            {entry.ref.href ? (
                                                <Link
                                                    href={withLocale(entry.ref.href, locale as Parameters<typeof withLocale>[1])}
                                                    className={cn(
                                                        "font-medium text-primary hover:underline break-words md:active:opacity-60",
                                                        !action && "max-md:after:absolute max-md:after:inset-0 max-md:after:content-['']",
                                                    )}
                                                >
                                                    {entry.summary}
                                                </Link>
                                            ) : (
                                                <span className="font-medium break-words">{entry.summary}</span>
                                            )}
                                            {entry.status ? (
                                                <Badge variant="outline" className="text-xs">
                                                    {statusLabel(entry.status)}
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="text-xs text-muted-foreground">{formatAdminDateTimeMY(entry.at)}</p>
                                        {entry.detail ? (
                                            <p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.detail}</p>
                                        ) : null}
                                        {action ? <div className="pt-1">{action}</div> : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {!filtered ? extra : null}
            </CardContent>
        </Card>
    );
}

export function NowCard({
    now,
    nextStepText,
    followUps,
    today,
    actions,
}: {
    now: JourneyNow;
    nextStepText: string | null;
    followUps: CustomerFollowUp[];
    today: string | null;
    actions: (followUp: CustomerFollowUp) => ReactNode;
}) {
    return (
        <Card className="gap-4 border-dashed">
            <CardHeader className="gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <CardTitle className="text-base">Now</CardTitle>
                    <span className="text-xs text-muted-foreground">What is open today</span>
                </div>
                <ToneLine tone={now.tone} reason={now.reason} />
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                {nextStepText ? (
                    <p>
                        <span className="font-medium">Next step</span> <span className="text-muted-foreground">{nextStepText}</span>
                    </p>
                ) : null}
                {followUps.length === 0 ? (
                    <p className="text-muted-foreground">
                        No follow-up is open{nextStepText ? "." : ", and nothing is due."}
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {followUps.map((f) => (
                            <li
                                key={f.id}
                                className="space-y-1.5 rounded-lg border p-3 max-md:rounded-none max-md:border-x-0 max-md:border-t-0 max-md:p-0 max-md:pb-3 max-md:last:border-b-0 max-md:last:pb-0"
                            >
                                <p className="font-medium break-words">{f.title}</p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <FollowUpAssignee followUp={f} />
                                    {today ? <FollowUpDue followUp={f} today={today} /> : null}
                                </div>
                                {actions(f)}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
