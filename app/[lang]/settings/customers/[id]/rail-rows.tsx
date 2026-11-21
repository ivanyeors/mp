"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function RailRows({ children }: { children: ReactNode }) {
    return <Card className="gap-0 divide-y overflow-hidden py-0">{children}</Card>;
}

const BARE_CARDS =
    "[&_[data-slot=card]]:gap-3 [&_[data-slot=card]]:rounded-none [&_[data-slot=card]]:border-0 [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:py-0 [&_[data-slot=card]]:shadow-none " +
    "[&_[data-slot=card-header]]:hidden [&_[data-slot=card-content]]:px-0";

export function RailRow({
    icon: Icon,
    label,
    summary,
    defaultOpen = false,
    children,
}: {
    icon: LucideIcon;
    label: string;
    summary?: ReactNode;
    defaultOpen?: boolean;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const [mounted, setMounted] = useState(defaultOpen);

    return (
        <Collapsible
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setMounted(true);
            }}
        >
            <CollapsibleTrigger
                className={cn(
                    "flex min-h-12 w-full items-center gap-3 px-[var(--card-px,1.5rem)] py-2.5 text-left text-sm outline-none transition-colors",
                    "hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-press",
                )}
            >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="shrink-0 font-medium">{label}</span>
                <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">{summary}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent forceMount={mounted ? true : undefined} hidden={!open}>
                <div className={cn("space-y-5 px-[var(--card-px,1.5rem)] pt-1 pb-4", BARE_CARDS)}>{children}</div>
            </CollapsibleContent>
        </Collapsible>
    );
}
