"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListTodo, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { WORKING_AS_CHANGED_EVENT } from "@/components/settings/working-as-picker";
import {
    FOLLOW_UP_SCOPES,
    FOLLOW_UP_SCOPE_LABELS,
    type FollowUpListData,
    type FollowUpListRow,
    type FollowUpScope,
} from "@/lib/crm/followup-rules";
import { FollowUpActions, FollowUpAssignee, FollowUpDue } from "./followup-parts";

export function FollowUpsTab({
    canEdit,
    initialScope = "mine",
    initialData,
}: {
    canEdit: boolean;
    initialScope?: FollowUpScope;
    initialData?: FollowUpListData;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const [scope, setScope] = useState<FollowUpScope>(initialData?.scope ?? initialScope);
    const [data, setData] = useState<FollowUpListData | null>(initialData ?? null);
    const [loading, setLoading] = useState(!initialData);
    const [error, setError] = useState<string | null>(null);
    const hydrated = useRef(Boolean(initialData));

    const load = useCallback(async (which: FollowUpScope) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/settings/customers/followups?scope=${which}`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load follow-ups.");
            setData(json as FollowUpListData);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load follow-ups.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (hydrated.current) {
            hydrated.current = false;
            return;
        }
        void load(scope);
    }, [load, scope]);

    useEffect(() => {
        const reload = () => void load(scope);
        window.addEventListener(WORKING_AS_CHANGED_EVENT, reload);
        return () => window.removeEventListener(WORKING_AS_CHANGED_EVENT, reload);
    }, [load, scope]);

    const choose = (next: FollowUpScope) => {
        setScope(next);
        const url = new URL(window.location.href);
        if (next === "mine") url.searchParams.delete("scope");
        else url.searchParams.set("scope", next);
        window.history.replaceState(null, "", url);
    };

    const update = (row: FollowUpListRow, next: FollowUpListRow["assignee"] | null, done: boolean) =>
        setData((d) => {
            if (!d) return d;
            const leaves = done || next === null || (d.scope === "mine" && next.id !== d.me?.id);
            return {
                ...d,
                rows: leaves
                    ? d.rows.filter((r) => r.id !== row.id)
                    : d.rows.map((r) => (r.id === row.id ? { ...r, assignee: next } : r)),
            };
        });

    const rows = data && data.scope === scope ? data.rows : [];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Which follow-ups">
                {FOLLOW_UP_SCOPES.map((s) => (
                    <Button
                        key={s}
                        size="sm"
                        variant={s === scope ? "default" : "outline"}
                        aria-pressed={s === scope}
                        onClick={() => choose(s)}
                    >
                        {FOLLOW_UP_SCOPE_LABELS[s]}
                    </Button>
                ))}
                {data?.me && scope === "mine" ? (
                    <span className="text-xs text-muted-foreground">Working as {data.me.name}</span>
                ) : null}
            </div>

            {loading && !rows.length ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{error}</span>
                    <Button size="sm" variant="ghost" onClick={() => void load(scope)}>
                        Try again
                    </Button>
                </div>
            ) : scope === "mine" && data && !data.me ? (
                <EmptyState>
                    Choose who you are working as (top right) to see the follow-ups assigned to you.
                </EmptyState>
            ) : rows.length === 0 ? (
                <EmptyState>
                    {scope === "overdue" ? "Nothing overdue." : scope === "mine" ? "Nothing to follow up." : "No open follow-ups."}
                </EmptyState>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">Customer</TableHead>
                                <TableHead className="px-4">Follow-up</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Due</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Assignee</TableHead>
                                {canEdit ? <TableHead className="px-4 text-right">Actions</TableHead> : null}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="px-4 py-3 align-top">
                                        <Link
                                            href={withLocale(`/settings/customers/${row.customerId}`, locale)}
                                            className="font-medium text-primary hover:underline"
                                        >
                                            {row.customerName}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 align-top">
                                        <span className="break-words">{row.title}</span>
                                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 md:hidden">
                                            <span className="sm:hidden">
                                                <FollowUpDue followUp={row} today={data!.today} />
                                            </span>
                                            <FollowUpAssignee followUp={row} />
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 align-top hidden sm:table-cell whitespace-nowrap">
                                        <FollowUpDue followUp={row} today={data!.today} />
                                    </TableCell>
                                    <TableCell className="px-4 py-3 align-top hidden md:table-cell">
                                        <FollowUpAssignee followUp={row} />
                                    </TableCell>
                                    {canEdit ? (
                                        <TableCell className="px-4 py-3 align-top">
                                            <div className="flex justify-end">
                                                <FollowUpActions
                                                    followUp={row}
                                                    assignees={data!.assignees}
                                                    onChange={(next) =>
                                                        update(row, next ? next.assignee : null, Boolean(next?.doneAt))
                                                    }
                                                />
                                            </div>
                                        </TableCell>
                                    ) : null}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
            {data?.truncated && data.scope === scope ? (
                <p className="text-xs text-muted-foreground">Showing the first {rows.length}, by due date.</p>
            ) : null}
        </div>
    );
}

function EmptyState({ children }: { children: ReactNode }) {
    return (
        <div className="rounded-xl border border-dashed p-14 text-center">
            <ListTodo className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">{children}</p>
        </div>
    );
}
