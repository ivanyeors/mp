"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bookmark, Loader2, Mail, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    SEGMENT_NAME_MAX,
    formatSegmentCount,
    sameSegmentFilters,
    segmentCampaignHref,
    segmentHref,
    type CustomerSegment,
    type SegmentParams,
} from "@/lib/crm/segment-rules";

const SEGMENTS_URL = "/api/settings/customers/segments";

async function readError(res: Response, fallback: string): Promise<string> {
    const payload = await res.json().catch(() => null);
    return typeof payload?.error === "string" ? payload.error : fallback;
}

async function fetchSegments(): Promise<CustomerSegment[]> {
    const res = await fetch(SEGMENTS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(await readError(res, "Could not load Segments"));
    return ((await res.json()) as { rows: CustomerSegment[] }).rows;
}

const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

type NameDialog = { mode: "create" } | { mode: "rename"; segment: CustomerSegment };

export function SegmentsRow({
    initialSegments,
    canEdit,
    newCampaignPath,
    params,
    activeId,
    listPath,
    onChoose,
    onSelect,
}: {
    initialSegments?: CustomerSegment[];
    canEdit: boolean;
    newCampaignPath?: string;
    params: SegmentParams;
    activeId: string | null;
    listPath: string;
    onChoose: (segment: CustomerSegment) => void;
    onSelect: (id: string | null) => void;
}) {
    const router = useRouter();
    const [segments, setSegments] = useState<CustomerSegment[] | null>(initialSegments ?? null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
    const [archiving, setArchiving] = useState<CustomerSegment | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        try {
            setSegments(await fetchSegments());
            setLoadFailed(false);
        } catch {
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => {
        if (initialSegments) return;
        let cancelled = false;
        fetchSegments().then(
            (rows) => !cancelled && setSegments(rows),
            () => !cancelled && setLoadFailed(true),
        );
        return () => {
            cancelled = true;
        };
    }, [initialSegments]);

    const list = segments ?? [];
    const filtered = Object.keys(params).length > 0;
    const chosen = activeId ? list.find((s) => s.id === activeId) : undefined;
    const active =
        (chosen && (filtered || chosen.needsReview) ? chosen : undefined) ??
        (filtered ? list.find((s) => sameSegmentFilters(s.params, params)) : undefined) ??
        null;
    const changed = active !== null && !sameSegmentFilters(active.params, params);
    const offerUpdate = canEdit && filtered && active !== null && (changed || active.needsReview);
    const offerSave = canEdit && filtered && active === null;
    const emailActive = active && !changed ? segmentCampaignHref(newCampaignPath, active) : null;

    if (!list.length && !offerSave && !loadFailed) return null;

    const openName = (dialog: NameDialog) => {
        setNameDialog(dialog);
        setName(dialog.mode === "rename" ? dialog.segment.name : "");
        setError(null);
    };

    const send = async (
        url: string,
        method: "POST" | "PATCH",
        body: unknown,
        fallback: string,
    ): Promise<{ ok: true; row: CustomerSegment | null } | { ok: false; message: string }> => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await readError(res, fallback));
            const json = (await res.json()) as { row?: CustomerSegment };
            await reload();
            return { ok: true, row: json.row ?? null };
        } catch (e) {
            const message = e instanceof Error ? e.message : fallback;
            setError(message);
            return { ok: false, message };
        } finally {
            setSaving(false);
        }
    };

    const submitName = async () => {
        if (!nameDialog) return;
        const trimmed = name.trim();
        if (nameDialog.mode === "create") {
            const sent = await send(SEGMENTS_URL, "POST", { name: trimmed, filters: params }, "Could not save the Segment");
            if (!sent.ok) return;
            if (sent.row) onSelect(sent.row.id);
            const emailNew = sent.row ? segmentCampaignHref(newCampaignPath, sent.row) : null;
            toast.success(`Saved “${trimmed}”`, emailNew ? { action: { label: "Email this Segment", onClick: () => router.push(emailNew) } } : undefined);
        } else {
            const sent = await send(
                `${SEGMENTS_URL}/${nameDialog.segment.id}`,
                "PATCH",
                { name: trimmed },
                "Could not rename the Segment",
            );
            if (!sent.ok) return;
            toast.success(`Renamed to “${trimmed}”`);
        }
        setNameDialog(null);
    };

    const update = async (segment: CustomerSegment) => {
        const sent = await send(`${SEGMENTS_URL}/${segment.id}`, "PATCH", { filters: params }, "Could not update the Segment");
        if (sent.ok) toast.success(`Updated “${segment.name}”`);
        else toast.error(sent.message);
    };

    const archive = async () => {
        if (!archiving) return;
        const sent = await send(`${SEGMENTS_URL}/${archiving.id}`, "PATCH", { archived: true }, "Could not archive the Segment");
        if (!sent.ok) return;
        if (active?.id === archiving.id) onSelect(null);
        toast.success(`Archived “${archiving.name}”`);
        setArchiving(null);
    };

    return (
        <section aria-label="Segments" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] max-md:overflow-x-auto max-md:px-3 md:contents">
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                        <Bookmark className="h-3.5 w-3.5" />
                        Segments
                    </span>
                    {list.map((s) => {
                        const isActive = active?.id === s.id;
                        const emailHref = segmentCampaignHref(newCampaignPath, s);
                        const hasMenu = canEdit || emailHref !== null;
                        const href = segmentHref(listPath, s.params);
                        return (
                            <span
                                key={s.id}
                                className={`inline-flex max-w-full items-center rounded-full border text-sm transition-colors max-md:shrink-0 max-md:overflow-hidden ${
                                    isActive ? "border-primary bg-primary/10" : "bg-background hover:bg-muted"
                                }`}
                            >
                                <a
                                    href={href}
                                    aria-current={isActive ? "true" : undefined}
                                    title={s.needsReview ? `Needs review: ${s.ignored.join(", ")}` : undefined}
                                    onClick={(e) => {
                                        if (!plainClick(e)) return;
                                        e.preventDefault();
                                        onChoose(s);
                                    }}
                                    className={`inline-flex min-h-8 min-w-0 items-center gap-1.5 py-1 pl-3 transition-colors active:bg-press max-md:min-h-11 ${hasMenu ? "pr-1 max-md:pr-2" : "pr-3"}`}
                                >
                                    <span className="truncate font-medium">{s.name}</span>
                                    {s.needsReview ? (
                                        <Badge
                                            variant="outline"
                                            className="border-amber-300 text-[11px] font-normal text-amber-800 dark:text-amber-200"
                                        >
                                            Needs review
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="text-[11px] font-normal tabular-nums">
                                            {formatSegmentCount(s.count)}
                                        </Badge>
                                    )}
                                </a>
                                {hasMenu && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={`More for ${s.name}`}
                                                className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted-foreground/20 active:bg-press max-md:mr-0 max-md:h-11 max-md:w-11 max-md:rounded-none max-md:border-l"
                                            >
                                                <MoreHorizontal className="h-3.5 w-3.5" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {emailHref && (
                                                <DropdownMenuItem asChild>
                                                    <Link href={emailHref}>
                                                        <Mail className="h-4 w-4" />
                                                        Email this Segment
                                                    </Link>
                                                </DropdownMenuItem>
                                            )}
                                            {canEdit && (
                                                <>
                                                    <DropdownMenuItem onSelect={() => openName({ mode: "rename", segment: s })}>
                                                        Rename
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        variant="destructive"
                                                        onSelect={() => {
                                                            setError(null);
                                                            setArchiving(s);
                                                        }}
                                                    >
                                                        Archive
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </span>
                        );
                    })}
                </div>
                {loadFailed && <span className="text-sm text-muted-foreground">Segments could not be loaded.</span>}
                {offerSave && (
                    <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => openName({ mode: "create" })}>
                        Save as Segment
                    </Button>
                )}
                {emailActive && (
                    <Button asChild size="sm" className="h-8">
                        <Link href={emailActive}>
                            <Mail className="mr-1.5 h-3.5 w-3.5" />
                            Email this Segment
                        </Link>
                    </Button>
                )}
                {offerUpdate && active && (
                    <>
                        <Button type="button" size="sm" className="h-8" disabled={saving} onClick={() => update(active)}>
                            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                            {`Update ${active.name}`}
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => openName({ mode: "create" })}>
                            Save as new
                        </Button>
                    </>
                )}
            </div>

            {active?.needsReview && (
                <p role="status" className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                        <strong className="font-medium">{active.name}</strong> needs review:{" "}
                        {active.ignored.join(", ")} {active.ignored.length === 1 ? "is" : "are"} no longer a filter the
                        list knows, so it counts no Customers. The list shows its other filters.
                        {canEdit ? " Update it to save it as shown, or archive it." : ""}
                    </span>
                </p>
            )}

            <Dialog open={nameDialog !== null} onOpenChange={(open) => !open && !saving && setNameDialog(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{nameDialog?.mode === "rename" ? "Rename Segment" : "Save as Segment"}</DialogTitle>
                        <DialogDescription>
                            {nameDialog?.mode === "rename"
                                ? "Everyone with Customers sees the new name."
                                : "Everyone with Customers sees it, with a live count. It saves these filters, not a list of people."}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-1.5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submitName();
                        }}
                    >
                        <Label htmlFor="segment-name">Name</Label>
                        <Input
                            id="segment-name"
                            value={name}
                            maxLength={SEGMENT_NAME_MAX}
                            placeholder="Premium, bought over a year ago, never re-adjusted"
                            autoFocus
                            onChange={(e) => setName(e.target.value)}
                        />
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                        <DialogFooter className="pt-3">
                            <Button type="button" variant="outline" onClick={() => setNameDialog(null)} disabled={saving}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={saving || !name.trim()}>
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {nameDialog?.mode === "rename" ? "Rename" : "Save"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={archiving !== null} onOpenChange={(open) => !open && !saving && setArchiving(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Archive {archiving?.name}?</DialogTitle>
                        <DialogDescription>
                            Nobody sees it in the Segments row any more, and its name can be used again. No Customer is
                            changed.
                        </DialogDescription>
                    </DialogHeader>
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setArchiving(null)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={archive} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Archive
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
