import { Badge } from "@/components/ui/badge";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import {
    LIFECYCLE_DELIVERY_LABEL,
    LIFECYCLE_STAGE_LABEL,
    LIFECYCLE_STAGE_RULE,
    type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { cn } from "@/lib/utils";

/**
 * The **Lifecycle stage** as Staff see it (PRD-crm-retention-loop slice 03):
 * the word, with its rule on hover. The word carries the meaning; the tint
 * only helps the eye find *Loyal* and *At risk* in a long list.
 */
const STAGE_TINT: Record<LifecycleStage, string> = {
    lead: "text-muted-foreground",
    new: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    repeat: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    loyal: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    at_risk: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    lapsed: "text-muted-foreground",
};

/** Placed by the Shopify-era count alone. */
export const UNDATED_NOTE = "No dates yet";
const UNDATED_TITLE = "Placed by their Shopify-era order count; their dates arrive with the Shopify order history.";

export function LifecycleStageBadge({
    stage,
    undated = false,
    className,
}: {
    stage: LifecycleStage;
    undated?: boolean;
    className?: string;
}) {
    const label = LIFECYCLE_STAGE_LABEL[stage];
    return (
        <Badge
            variant="outline"
            className={cn("text-xs font-normal", STAGE_TINT[stage], className)}
            title={`${label}: ${LIFECYCLE_STAGE_RULE[stage]}.${undated ? ` ${UNDATED_TITLE}` : ""}`}
        >
            {label}
        </Badge>
    );
}

/** What else the stage says: a New Customer's delivery step, or that a buyer has no dates yet. */
export function lifecycleNote(
    customer: Pick<CustomerOverviewRow, "lifecycle_delivery" | "lifecycle_undated">,
): string | null {
    if (customer.lifecycle_undated) return UNDATED_NOTE;
    return customer.lifecycle_delivery ? LIFECYCLE_DELIVERY_LABEL[customer.lifecycle_delivery] : null;
}

/** The list's Stage cell: the badge, and its note underneath. */
export function LifecycleStageCell({
    customer,
}: {
    customer: Pick<CustomerOverviewRow, "lifecycle_stage" | "lifecycle_delivery" | "lifecycle_undated">;
}) {
    const note = lifecycleNote(customer);
    return (
        <span className="inline-flex flex-col items-start gap-0.5">
            <LifecycleStageBadge stage={customer.lifecycle_stage} undated={customer.lifecycle_undated} />
            {note ? (
                <span className="text-xs text-muted-foreground whitespace-nowrap" title={customer.lifecycle_undated ? UNDATED_TITLE : undefined}>
                    {note}
                </span>
            ) : null}
        </span>
    );
}
