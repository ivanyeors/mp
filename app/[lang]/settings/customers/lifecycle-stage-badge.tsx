import { Badge } from "@/components/ui/badge";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import {
    LIFECYCLE_DETAIL_LABEL,
    LIFECYCLE_STAGE_LABEL,
    LIFECYCLE_STAGE_RULE,
    type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { UNENGAGED_RULE } from "@/lib/crm/engagement";
import { UNSUBSCRIBE_REASON_LABEL, type UnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { cn } from "@/lib/utils";

/**
 * The **Lifecycle stage** as Staff see it (PRD-crm-retention-loop slice 03):
 * the word, with its rule on hover, and the sub-status underneath. The word
 * carries the meaning; the tint only helps the eye find *Loyal*, *At risk*
 * and *Lost* in a long list.
 */
const STAGE_TINT: Record<LifecycleStage, string> = {
    lead: "text-muted-foreground",
    new: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    loyal: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    at_risk: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    lost: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
};

/** Placed by the Shopify-era count alone. */
export const UNDATED_NOTE = "No dates yet";
export const UNDATED_TITLE = "Placed by their Shopify-era order count; their dates arrive with the Shopify order history.";

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
            title={`${label}: ${LIFECYCLE_STAGE_RULE[stage]}.${undated && stage !== "lost" ? ` ${UNDATED_TITLE}` : ""}`}
        >
            {label}
        </Badge>
    );
}

type NoteFacts = Pick<CustomerOverviewRow, "lifecycle_stage" | "lifecycle_detail" | "lifecycle_undated" | "marketing_email_updated_at"> &
    Partial<Pick<CustomerOverviewRow, "unengaged">>;

/** **Unengaged** (PRD-campaign-audiences slice 12): a sending choice, never a stage. */
export const UNENGAGED_NOTE = "Unengaged";
export const UNENGAGED_TITLE = `${UNENGAGED_RULE}. Campaigns leave them out unless one includes the Unengaged; they stay subscribed.`;

/**
 * The line under the stage: when a *Lost* Customer unsubscribed, and why
 * when they said (on the Customer page, which reads it); otherwise
 * the sub-status (*Repeat purchases*, *Lapsed*, *Delivered*…), whether a
 * buyer has no dates yet, and whether they are Unengaged.
 */
export function lifecycleNote(
    customer: NoteFacts,
    { unsubscribeReason = null }: { unsubscribeReason?: UnsubscribeReason | null } = {},
): string | null {
    if (customer.lifecycle_stage === "lost") {
        // PRD-crm-retention-loop slice 11: why, when they said.
        const parts = [
            customer.marketing_email_updated_at ? `Unsubscribed ${formatAdminDateMY(customer.marketing_email_updated_at)}` : null,
            unsubscribeReason ? UNSUBSCRIBE_REASON_LABEL[unsubscribeReason] : null,
        ].filter(Boolean);
        return parts.length ? parts.join(" · ") : null;
    }
    const parts = [
        customer.lifecycle_detail ? LIFECYCLE_DETAIL_LABEL[customer.lifecycle_detail] : null,
        customer.lifecycle_undated ? UNDATED_NOTE : null,
        customer.unengaged ? UNENGAGED_NOTE : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

/** The list's Stage cell: the badge, and its note underneath. */
export function LifecycleStageCell({ customer }: { customer: NoteFacts }) {
    const note = lifecycleNote(customer);
    const undated = customer.lifecycle_undated && customer.lifecycle_stage !== "lost";
    return (
        <span className="inline-flex flex-col items-start gap-0.5">
            <LifecycleStageBadge stage={customer.lifecycle_stage} undated={customer.lifecycle_undated} />
            {note ? (
                <span
                    className="text-xs text-muted-foreground whitespace-nowrap"
                    title={[undated ? UNDATED_TITLE : null, customer.unengaged ? UNENGAGED_TITLE : null].filter(Boolean).join(" ") || undefined}
                >
                    {note}
                </span>
            ) : null}
        </span>
    );
}
