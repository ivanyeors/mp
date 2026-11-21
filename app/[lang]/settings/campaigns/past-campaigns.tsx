"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PastCampaign } from "@/lib/email-campaigns/store";
import { formatAdminDate } from "@/lib/format/admin-date";
import { listPastCampaignsAction } from "./actions";

const pastStatus = (c: PastCampaign) => (c.archived ? "Archived" : c.started ? "Started" : "Draft");

export function PastCampaigns({ onPick, busy }: { onPick: (id: string) => void; busy: boolean }) {
    const [list, setList] = useState<PastCampaign[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        void Promise.resolve()
            .then(() => listPastCampaignsAction())
            .then((r) => {
                if (!live) return;
                if (r.ok) setList(r.campaigns);
                else setError(r.error);
            })
            .catch((e: unknown) => {
                if (live) setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            live = false;
        };
    }, []);

    if (error) {
        return (
            <p id="c-start-past" role="alert" className="text-sm text-destructive">
                {error}
            </p>
        );
    }
    if (!list) {
        return (
            <p id="c-start-past" className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Reading the campaigns…
            </p>
        );
    }
    if (!list.length) {
        return (
            <p id="c-start-past" className="text-sm text-muted-foreground">
                No campaigns yet: this is the first.
            </p>
        );
    }
    return (
        <div id="c-start-past" className="space-y-2">
            <p className="text-xs text-muted-foreground">Picking one makes a copy of it, a new draft: its email and who it goes to, never its sends.</p>
            <ul aria-label="Past campaigns" className="max-h-80 divide-y overflow-y-auto rounded-md border bg-background">
                {list.map((c) => (
                    <li key={c.id}>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => onPick(c.id)}
                            className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-60 max-md:min-h-11"
                        >
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{c.name || "Untitled"}</span>
                                {c.subject ? <span className="block truncate text-xs text-muted-foreground">{c.subject}</span> : null}
                            </span>
                            <span className="shrink-0 text-right text-xs text-muted-foreground" suppressHydrationWarning>
                                <span className="block font-medium">{pastStatus(c)}</span>
                                {formatAdminDate(c.createdAt)}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
