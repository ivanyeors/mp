"use client";

import { useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import {
    FOLLOW_UPS_CHANGED_EVENT,
    describeDue,
    followUpState,
    type CustomerFollowUp,
    type FollowUpProfile,
} from "@/lib/crm/followup-rules";

async function readError(res: Response, fallback: string): Promise<string> {
    const payload = await res.json().catch(() => null);
    return typeof payload?.error === "string" ? payload.error : fallback;
}

const followUpUrl = (f: Pick<CustomerFollowUp, "customerId" | "id">) =>
    `/api/shop/customers/${f.customerId}/followups/${f.id}`;

export async function patchFollowUp(
    f: Pick<CustomerFollowUp, "customerId" | "id">,
    body: { done: true } | { assignedToProfileId: string },
): Promise<CustomerFollowUp> {
    const res = await fetch(followUpUrl(f), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await readError(res, "Could not change the follow-up"));
    const { row } = (await res.json()) as { row: CustomerFollowUp };
    announceFollowUpsChanged();
    return row;
}

export async function deleteFollowUpRequest(f: Pick<CustomerFollowUp, "customerId" | "id">): Promise<void> {
    const res = await fetch(followUpUrl(f), { method: "DELETE" });
    if (!res.ok) throw new Error(await readError(res, "Could not delete the follow-up"));
    announceFollowUpsChanged();
}

export function announceFollowUpsChanged() {
    window.dispatchEvent(new Event(FOLLOW_UPS_CHANGED_EVENT));
}

export function FollowUpDue({ followUp, today }: { followUp: CustomerFollowUp; today: string }) {
    const state = followUpState(followUp, today);
    const tone =
        state === "overdue"
            ? "text-red-700 dark:text-red-300"
            : state === "due_today"
              ? "text-amber-700 dark:text-amber-300"
              : "text-muted-foreground";
    return <span className={`text-xs ${tone}`}>{describeDue(followUp, today)}</span>;
}

export function FollowUpAssignee({ followUp }: { followUp: CustomerFollowUp }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground">{followUp.assignee.name}</span>
            {followUp.assignee.archived && !followUp.doneAt ? (
                <Badge variant="outline" className="border-amber-300 text-[11px] font-normal text-amber-800 dark:text-amber-200">
                    Assignee archived
                </Badge>
            ) : null}
        </span>
    );
}

export function FollowUpDoneBy({ followUp }: { followUp: CustomerFollowUp }) {
    if (!followUp.doneAt) return null;
    return (
        <span className="text-xs text-muted-foreground">
            {`Done ${formatAdminDateMY(followUp.doneAt)}${followUp.doneBy ? ` by ${followUp.doneBy.name}` : ""}`}
        </span>
    );
}

export function FollowUpActions({
    followUp,
    assignees,
    onChange,
    allowDelete = false,
}: {
    followUp: CustomerFollowUp;
    assignees: FollowUpProfile[];
    onChange: (next: CustomerFollowUp | null) => void;
    allowDelete?: boolean;
}) {
    const [busy, setBusy] = useState<"done" | "reassign" | "delete" | null>(null);
    const others = assignees.filter((p) => p.id !== followUp.assignee.id);

    const run = async (kind: "done" | "reassign" | "delete", fn: () => Promise<CustomerFollowUp | null>) => {
        setBusy(kind);
        try {
            onChange(await fn());
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not change the follow-up");
        } finally {
            setBusy(null);
        }
    };

    const remove = async (): Promise<CustomerFollowUp | null> => {
        if (!window.confirm("Delete this follow-up? It will no longer be on anyone's list.")) return followUp;
        await deleteFollowUpRequest(followUp);
        return null;
    };

    if (followUp.doneAt) {
        return allowDelete ? (
            <DeleteButton busy={busy === "delete"} onDelete={() => void run("delete", remove)} />
        ) : null;
    }

    return (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {others.length ? (
                <Select
                    value=""
                    onValueChange={(id) =>
                        void run("reassign", () => patchFollowUp(followUp, { assignedToProfileId: id }))
                    }
                >
                    <SelectTrigger
                        disabled={busy !== null}
                        aria-label={`Reassign: ${followUp.title}`}
                        className={`h-8 w-auto gap-1 text-xs ${followUp.assignee.archived ? "border-amber-300" : ""}`}
                    >
                        {busy === "reassign" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        <SelectValue placeholder="Reassign" />
                    </SelectTrigger>
                    <SelectContent align="end" sheetTitle="Reassign to">
                        {others.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ) : null}
            <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => void run("done", () => patchFollowUp(followUp, { done: true }))}
                disabled={busy !== null}
            >
                {busy === "done" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                Done
            </Button>
            {allowDelete ? <DeleteButton busy={busy === "delete"} onDelete={() => void run("delete", remove)} /> : null}
        </div>
    );
}

function DeleteButton({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
    return (
        <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete follow-up"
            title="Delete follow-up"
        >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
    );
}
