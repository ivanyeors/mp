"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays } from "@/lib/readjustment/eligibility";
import {
    FOLLOW_UP_TITLE_MAX,
    sortFollowUps,
    type CustomerFollowUp,
    type CustomerFollowUpsData,
} from "@/lib/crm/followup-rules";
import {
    FollowUpActions,
    FollowUpAssignee,
    FollowUpDoneBy,
    FollowUpDue,
    announceFollowUpsChanged,
} from "../followup-parts";

async function readError(res: Response, fallback: string): Promise<string> {
    const payload = await res.json().catch(() => null);
    return typeof payload?.error === "string" ? payload.error : fallback;
}

/**
 * Follow-ups on the Customer detail (CRM slice 06; ADR 0028 (e)): dated to-dos
 * about this Customer, each assigned to a **Staff profile**. Open ones first,
 * by due date, with their assignee and *Done*; then the done ones.
 *
 * The form adds one: a title, a due date (tomorrow, in Singapore) and an
 * assignee (the profile you work as). The picker lists only profiles whose
 * Member holds `customers-edit`, so nobody is given one they cannot close.
 * Without `customers-edit` the form and every action are left out; the routes
 * refuse regardless.
 *
 * Its own fetch, like the other cards on the page, unless handed `initialData`.
 */
export function CustomerFollowUpsCard({
    customerId,
    canEdit,
    initialData,
}: {
    customerId: string;
    canEdit: boolean;
    initialData?: CustomerFollowUpsData;
}) {
    const [data, setData] = useState<CustomerFollowUpsData | null>(initialData ?? null);
    const [loading, setLoading] = useState(!initialData);
    const [loadError, setLoadError] = useState<string | null>(null);
    const hydrated = useRef(Boolean(initialData));

    const [title, setTitle] = useState("");
    const [dueOn, setDueOn] = useState(initialData ? addDays(initialData.today, 1) : "");
    const [assignee, setAssignee] = useState(defaultAssignee(initialData));
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/followups`);
            if (!res.ok) throw new Error(await readError(res, "Could not load follow-ups."));
            const next = (await res.json()) as CustomerFollowUpsData;
            setData(next);
            setDueOn((d) => d || addDays(next.today, 1));
            setAssignee((a) => a || defaultAssignee(next));
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Could not load follow-ups.");
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (hydrated.current) {
            hydrated.current = false;
            return;
        }
        void load();
    }, [load]);

    const replace = (id: string, next: CustomerFollowUp | null) =>
        setData((d) =>
            d
                ? {
                      ...d,
                      rows: sortFollowUps(
                          next ? d.rows.map((r) => (r.id === id ? next : r)) : d.rows.filter((r) => r.id !== id),
                      ),
                  }
                : d,
        );

    const add = async () => {
        if (!title.trim() || !dueOn || !assignee) return;
        setAdding(true);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/followups`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim(), dueOn, assignedToProfileId: assignee }),
            });
            if (!res.ok) throw new Error(await readError(res, "Could not save the follow-up"));
            const { row } = (await res.json()) as { row: CustomerFollowUp };
            setData((d) => (d ? { ...d, rows: sortFollowUps([row, ...d.rows]) } : d));
            setTitle("");
            announceFollowUpsChanged();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the follow-up");
        } finally {
            setAdding(false);
        }
    };

    const open = data?.rows.filter((r) => !r.doneAt) ?? [];
    const done = data?.rows.filter((r) => r.doneAt) ?? [];

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <ListTodo className="h-4 w-4" />
                    Follow-ups
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !data ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading follow-ups…
                    </div>
                ) : loadError && !data ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{loadError}</span>
                        <Button size="sm" variant="ghost" onClick={() => void load()}>
                            Try again
                        </Button>
                    </div>
                ) : data ? (
                    <>
                        {canEdit ? (
                            <div className="space-y-2">
                                <Input
                                    aria-label="New follow-up"
                                    placeholder="e.g. Call about her second pillow"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={FOLLOW_UP_TITLE_MAX}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            void add();
                                        }
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="followup-due" className="text-xs text-muted-foreground">
                                            Due
                                        </Label>
                                        <Input
                                            id="followup-due"
                                            type="date"
                                            value={dueOn}
                                            onChange={(e) => setDueOn(e.target.value)}
                                        />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <Label className="text-xs text-muted-foreground">For</Label>
                                        <Select value={assignee} onValueChange={setAssignee}>
                                            <SelectTrigger aria-label="Assign to" className="w-full min-w-0">
                                                <SelectValue placeholder="Who is it for?" />
                                            </SelectTrigger>
                                            <SelectContent sheetTitle="Assign to">
                                                {data.assignees.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => void add()}
                                    disabled={adding || !title.trim() || !dueOn || !assignee}
                                >
                                    {adding ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Plus className="mr-2 h-4 w-4" />
                                    )}
                                    Add follow-up
                                </Button>
                            </div>
                        ) : null}

                        {data.rows.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No follow-ups.</p>
                        ) : (
                            <ul className="space-y-2">
                                {[...open, ...done].map((f) => (
                                    <li
                                        key={f.id}
                                        className={`rounded-lg border p-3 text-sm space-y-1.5 ${f.doneAt ? "opacity-70" : ""}`}
                                    >
                                        <p className={`break-words ${f.doneAt ? "line-through" : "font-medium"}`}>{f.title}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <FollowUpAssignee followUp={f} />
                                            {f.doneAt ? <FollowUpDoneBy followUp={f} /> : <FollowUpDue followUp={f} today={data.today} />}
                                        </div>
                                        {canEdit ? (
                                            <FollowUpActions
                                                followUp={f}
                                                assignees={data.assignees}
                                                onChange={(next) => replace(f.id, next)}
                                                allowDelete
                                            />
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                ) : null}
            </CardContent>
        </Card>
    );
}

/** The profile you work as, when it may be given one; otherwise nobody (the picker asks). */
function defaultAssignee(data: CustomerFollowUpsData | null | undefined): string {
    if (!data?.me) return "";
    return data.assignees.some((p) => p.id === data.me!.id) ? data.me.id : "";
}
