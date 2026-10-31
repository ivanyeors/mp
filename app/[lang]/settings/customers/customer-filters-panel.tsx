"use client";

import { useId, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
    BOUGHT_FILTERS,
    BOUGHT_LABELS,
    CAMPAIGN_FILTER_STATES,
    LANGUAGE_FILTERS,
    LANGUAGE_LABELS,
    SHIPS_TO_FILTERS,
    emailedLabel,
    emailedParam,
    GOOGLE_REVIEW_FILTERS,
    GOOGLE_REVIEW_LABELS,
    NOT_BOUGHT_FILTERS,
    PILLOW_SIZES,
    POINTS_LABELS,
    RATING_FILTERS,
    RATING_LABELS,
    customerFiltersSchema,
    daysLabel,
    describeCustomerFilters,
    normalizeStageFilter,
    isCustomerFilterActive,
    type AccountFilter,
    type ConsentFilter,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
    type CampaignFilterState,
    type DeliveredFilter,
    type EmailedFilter,
    type FollowUpFilter,
    type GoogleFilter,
    type GoogleReviewFilter,
    type LanguageFilter,
    type LastOrderFilter,
    type MobileFilter,
    type PointsFilter,
    type RatingFilter,
    type ReadjustedFilter,
    type ShipsToFilter,
    type ShopReviewFilter,
    type SourceFilter,
    type StageFilter,
} from "@/lib/crm/customer-filters";
import {
    LIFECYCLE_DETAILS,
    LIFECYCLE_DETAIL_LABEL,
    LIFECYCLE_DETAIL_RULE,
    LIFECYCLE_DETAIL_STAGE,
    LIFECYCLE_STAGES,
    LIFECYCLE_STAGE_LABEL,
    LIFECYCLE_STAGE_RULE,
} from "@/lib/crm/lifecycle-stage";
import type { CampaignFilterOption } from "@/lib/email-campaigns/store";

/**
 * The Customers list's filters, as one mega filter (CustomerMegaFilter): the
 * **Lifecycle stage** and its sub-statuses (PRD-crm-retention-loop slice 03,
 * PRD-campaign-audiences slice 04); purchases (CRM slice 04, campaign
 * audiences slice 04); reach: consent (migration slice 07), where they ship
 * to, the language they read, and the campaigns that reached them (campaign
 * audiences slice 05); the account, sign-in, mobile, Points (PRD-loyalty-points
 * slice 06), tags and follow-ups; and reviews (CRM slice 12). Values go
 * through the list's one schema (lib/crm/customer-filters.ts), so a control
 * can never put into the URL what a link could not.
 */

/** Presets for *Last order*; a link may carry any other month count, shown as its own option. */
const LAST_ORDER_PRESETS: LastOrderFilter[] = [
    { when: "within", months: 3 },
    { when: "within", months: 6 },
    { when: "within", months: 12 },
    { when: "over", months: 6 },
    { when: "over", months: 12 },
    { when: "over", months: 24 },
];

const lastOrderValue = (v: LastOrderFilter) => `${v.when}:${v.months}`;

/** Presets for *Delivered*, in days, as Playbooks are timed; a link may carry any other. */
const DELIVERED_PRESETS: DeliveredFilter[] = [
    { when: "within", days: 7 },
    { when: "within", days: 14 },
    { when: "within", days: 30 },
    { when: "over", days: 30 },
    { when: "over", days: 60 },
    { when: "over", days: 90 },
];

const deliveredValue = (v: DeliveredFilter) => `${v.when}:${v.days}`;

/** Presets for *Last emailed*, in days; a link may carry any other. */
const EMAILED_PRESETS: EmailedFilter[] = [
    { when: "within", days: 7 },
    { when: "within", days: 14 },
    { when: "within", days: 30 },
    { when: "over", days: 14 },
    { when: "over", days: 30 },
    { when: "over", days: 60 },
    { when: "never" },
];

/** How each *Campaign* state reads in its control, for the campaign chosen. */
const CAMPAIGN_STATE_OPTION: Record<CampaignFilterState, string> = {
    sent: "Got it",
    "not-sent": "Didn't get it",
    clicked: "Clicked it",
    "not-clicked": "Got it, didn't click",
};

function deliveredLabel(v: DeliveredFilter): string {
    return v.when === "within" ? `Within ${daysLabel(v.days)}` : `Over ${daysLabel(v.days)} ago`;
}

function lastOrderLabel(v: LastOrderFilter): string {
    const span = v.months % 12 === 0 ? `${v.months / 12} year${v.months === 12 ? "" : "s"}` : `${v.months} month${v.months === 1 ? "" : "s"}`;
    return v.when === "within" ? `Within ${span}` : `Over ${span} ago`;
}

/** Applies a typed value on Enter or when the field loses focus. */
function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
}

/**
 * The mega filter's groups, in the order its rail lists them. Every filter
 * key but `search` (the box above the list) is in exactly one group
 * (`customer-filter-groups.test.ts`).
 */
export type CustomerFilterGroupId = "stage" | "purchases" | "reach" | "account" | "reviews";
export const CUSTOMER_FILTER_GROUPS: readonly {
    id: CustomerFilterGroupId;
    label: string;
    blurb: string;
    keys: readonly CustomerFilterKey[];
}[] = [
    { id: "stage", label: "Stage", blurb: "Where they are in the lifecycle", keys: ["stage"] },
    {
        id: "purchases",
        label: "Purchases",
        blurb: "What they bought, when, and how much",
        keys: ["bought", "not_bought", "size", "readjusted", "last_order", "delivered", "min_spend"],
    },
    {
        id: "reach",
        label: "Reach",
        blurb: "Consent, country, language and campaigns",
        keys: ["consent", "ships_to", "language", "emailed", "campaign"],
    },
    {
        id: "account",
        label: "Account",
        blurb: "Sign-in, mobile, points, tags and follow-ups",
        keys: ["account", "source", "google", "mobile", "followups", "points", "tags"],
    },
    { id: "reviews", label: "Reviews", blurb: "Google and shop reviews", keys: ["google_review", "shop_review", "rating"] },
];

/** Every key the mega filter holds: all but `search`. */
export const MEGA_FILTER_KEYS: readonly CustomerFilterKey[] = CUSTOMER_FILTER_GROUPS.flatMap((g) => g.keys);

/** How many of a group's filters are set. */
export function groupFilterCount(filters: CustomerListFilters, group: { keys: readonly CustomerFilterKey[] }): number {
    return group.keys.filter((k) => isCustomerFilterActive(filters, k)).length;
}

/** The group the mega filter opens on: the first with a filter set, else Stage. */
export function firstActiveGroup(filters: CustomerListFilters): CustomerFilterGroupId {
    return CUSTOMER_FILTER_GROUPS.find((g) => groupFilterCount(filters, g) > 0)?.id ?? "stage";
}

/** *Show 128 customers*, *Show 1 customer*. */
export function showCustomersLabel(total: number): string {
    return `Show ${total.toLocaleString("en-SG")} ${total === 1 ? "customer" : "customers"}`;
}

type MegaFilterProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
    /** Clears the mega filter's own filters: not the search box, not the sort. */
    onClearFilters: () => void;
    campaigns?: readonly CampaignFilterOption[];
    /** Customers the list holds with these filters; null while it counts. */
    total: number | null;
    /** The Filters button. */
    trigger: ReactElement;
    /**
     * The toolbar, given the trigger to place in it. From md it anchors the
     * panel, which opens below it at its full width.
     */
    toolbar: (trigger: ReactNode) => ReactElement;
    /** Put above the groups on a phone, where the toolbar has no room: the sort. */
    phoneExtra?: ReactNode;
};

/**
 * The Customers list's mega filter: every filter in one panel, grouped. From
 * md it opens under the toolbar at the toolbar's width, the groups on a rail
 * with how many of each are set, one group shown at a time. On a phone it is
 * a full-height sheet with the groups as sections. Each change applies at
 * once, as before; the footer says how many customers match, and closes it.
 */
export function CustomerMegaFilter({
    open,
    onOpenChange,
    filters,
    onChange,
    onClearFilters,
    campaigns = [],
    total,
    trigger,
    toolbar,
    phoneExtra,
}: MegaFilterProps) {
    const isMobile = useIsMobile();
    const [group, setGroup] = useState<CustomerFilterGroupId>(() => firstActiveGroup(filters));
    const set = MEGA_FILTER_KEYS.filter((k) => isCustomerFilterActive(filters, k)).length;

    const actions = (
        <>
            <Button type="button" variant="ghost" onClick={onClearFilters} disabled={set === 0}>
                Clear filters
            </Button>
            <Button type="button" onClick={() => onOpenChange(false)}>
                {total == null ? (
                    <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Counting
                    </>
                ) : (
                    showCustomersLabel(total)
                )}
            </Button>
        </>
    );

    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                {toolbar(<SheetTrigger asChild>{trigger}</SheetTrigger>)}
                <SheetContent side="bottom" mobilePreset="full" className="h-[100svh] gap-0 overflow-hidden p-0">
                    <SheetHeader className="shrink-0 border-b px-4 py-3">
                        <SheetTitle>Filters</SheetTitle>
                        <SheetDescription className="sr-only">
                            Choose which customers the list shows. Each change applies at once.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {phoneExtra && <div className="border-b px-4 py-4">{phoneExtra}</div>}
                        <MegaFilterSections filters={filters} onChange={onChange} campaigns={campaigns} />
                    </div>
                    {/* SheetFooter keeps the actions clear of the sheet's pinned close button. */}
                    <SheetFooter className="mt-0 shrink-0 flex-row items-center justify-between gap-3 border-t py-3">
                        {actions}
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (next) setGroup(firstActiveGroup(filters));
                onOpenChange(next);
            }}
        >
            <PopoverAnchor asChild>{toolbar(<PopoverTrigger asChild>{trigger}</PopoverTrigger>)}</PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={8}
                collisionPadding={16}
                aria-label="Filters"
                className="flex h-[min(38rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl p-0 shadow-lg"
            >
                <MegaFilterRail
                    group={group}
                    onGroup={setGroup}
                    filters={filters}
                    onChange={onChange}
                    campaigns={campaigns}
                />
                <div className="flex shrink-0 items-center justify-between gap-3 border-t px-5 py-3">{actions}</div>
            </PopoverContent>
        </Popover>
    );
}

/** From md: the groups on a rail, one shown at a time. */
function MegaFilterRail({
    group,
    onGroup,
    filters,
    onChange,
    campaigns,
}: {
    group: CustomerFilterGroupId;
    onGroup: (group: CustomerFilterGroupId) => void;
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
    campaigns: readonly CampaignFilterOption[];
}) {
    const id = useId();
    const current = CUSTOMER_FILTER_GROUPS.find((g) => g.id === group) ?? CUSTOMER_FILTER_GROUPS[0]!;

    // A vertical tablist: up and down move between groups, Home and End jump.
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const at = CUSTOMER_FILTER_GROUPS.findIndex((g) => g.id === group);
        const last = CUSTOMER_FILTER_GROUPS.length - 1;
        const to =
            e.key === "ArrowDown" ? (at === last ? 0 : at + 1)
            : e.key === "ArrowUp" ? (at === 0 ? last : at - 1)
            : e.key === "Home" ? 0
            : e.key === "End" ? last
            : null;
        if (to == null) return;
        e.preventDefault();
        const next = CUSTOMER_FILTER_GROUPS[to]!.id;
        onGroup(next);
        document.getElementById(`${id}-tab-${next}`)?.focus();
    };

    return (
        <div className="flex min-h-0 flex-1">
            <div
                role="tablist"
                aria-orientation="vertical"
                aria-label="Filter groups"
                onKeyDown={onKeyDown}
                className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-muted/40 p-2"
            >
                {CUSTOMER_FILTER_GROUPS.map((g) => {
                    const n = groupFilterCount(filters, g);
                    const selected = g.id === group;
                    return (
                        <button
                            key={g.id}
                            type="button"
                            role="tab"
                            id={`${id}-tab-${g.id}`}
                            aria-selected={selected}
                            aria-controls={`${id}-panel`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => onGroup(g.id)}
                            className={cn(
                                "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-press",
                                selected && "bg-background shadow-xs",
                            )}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{g.label}</span>
                                <span className="block text-xs text-muted-foreground">{g.blurb}</span>
                            </span>
                            {n > 0 && (
                                <Badge className="mt-0.5 h-5 min-w-5 shrink-0 rounded-full px-1.5 text-xs" aria-label={`${n} set`}>
                                    {n}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </div>
            <div
                role="tabpanel"
                id={`${id}-panel`}
                aria-labelledby={`${id}-tab-${current.id}`}
                className="@container min-w-0 flex-1 overflow-y-auto p-5"
            >
                <CustomerFilterGroup key={current.id} group={current.id} filters={filters} onChange={onChange} campaigns={campaigns} />
            </div>
        </div>
    );
}

/** On a phone: every group, a section each, opened where a filter is set. */
export function MegaFilterSections({
    filters,
    onChange,
    campaigns = [],
}: {
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
    campaigns?: readonly CampaignFilterOption[];
}) {
    const [openGroups, setOpenGroups] = useState<string[]>(() => {
        const set = CUSTOMER_FILTER_GROUPS.filter((g) => groupFilterCount(filters, g) > 0).map((g) => g.id);
        return set.length ? set : ["stage"];
    });
    return (
        <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups} className="px-4">
            {CUSTOMER_FILTER_GROUPS.map((g) => {
                const n = groupFilterCount(filters, g);
                return (
                    <AccordionItem key={g.id} value={g.id}>
                        <AccordionTrigger className="items-center py-3.5 hover:no-underline">
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="min-w-0">
                                    <span className="block">{g.label}</span>
                                    <span className="block text-xs font-normal text-muted-foreground">{g.blurb}</span>
                                </span>
                                {n > 0 && (
                                    <Badge className="h-5 min-w-5 shrink-0 rounded-full px-1.5 text-xs" aria-label={`${n} set`}>
                                        {n}
                                    </Badge>
                                )}
                            </span>
                        </AccordionTrigger>
                        <AccordionContent className="@container pb-5">
                            <CustomerFilterGroup group={g.id} filters={filters} onChange={onChange} campaigns={campaigns} />
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}

/**
 * One group of the mega filter's controls. Every value goes through the
 * list's one schema (lib/crm/customer-filters.ts), so a control can never put
 * into the URL what a link could not. Render it inside an `@container`: its
 * grids follow the room the group is given, not the window.
 */
export function CustomerFilterGroup({
    group,
    filters,
    onChange,
    campaigns = [],
}: {
    group: CustomerFilterGroupId;
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
    /** The *Campaign* filter's choices: campaigns that have started sending, latest first. */
    campaigns?: readonly CampaignFilterOption[];
}) {
    const id = useId();
    const lastOrderOptions =
        filters.last_order && !LAST_ORDER_PRESETS.some((p) => lastOrderValue(p) === lastOrderValue(filters.last_order!))
            ? [...LAST_ORDER_PRESETS, filters.last_order]
            : LAST_ORDER_PRESETS;

    const deliveredOptions =
        filters.delivered && !DELIVERED_PRESETS.some((p) => deliveredValue(p) === deliveredValue(filters.delivered!))
            ? [...DELIVERED_PRESETS, filters.delivered]
            : DELIVERED_PRESETS;

    const emailedOptions =
        filters.emailed && !EMAILED_PRESETS.some((p) => emailedParam(p) === emailedParam(filters.emailed!))
            ? [...EMAILED_PRESETS, filters.emailed]
            : EMAILED_PRESETS;

    // A link's campaign that is not among the choices still shows, by its id.
    const campaignOptions =
        filters.campaign && !campaigns.some((c) => c.id === filters.campaign!.id)
            ? [...campaigns, { id: filters.campaign.id, name: "A campaign not listed here" }]
            : campaigns;

    // Ticking a stage takes in its sub-statuses: normalizeStageFilter drops them.
    const toggleStage = (value: StageFilter, checked: boolean) => {
        const next = checked ? [...filters.stage, value] : filters.stage.filter((s) => s !== value);
        onChange({ stage: normalizeStageFilter(next) });
    };

    const toggleBought = (value: (typeof BOUGHT_FILTERS)[number], checked: boolean) => {
        const next = checked ? [...filters.bought, value] : filters.bought.filter((b) => b !== value);
        onChange({ bought: BOUGHT_FILTERS.filter((b) => next.includes(b)) });
    };

    const toggleNotBought = (value: (typeof NOT_BOUGHT_FILTERS)[number], checked: boolean) => {
        const next = checked ? [...filters.not_bought, value] : filters.not_bought.filter((b) => b !== value);
        onChange({ not_bought: NOT_BOUGHT_FILTERS.filter((b) => next.includes(b)) });
    };

    const toggleSize = (value: (typeof PILLOW_SIZES)[number], checked: boolean) => {
        const next = checked ? [...filters.size, value] : filters.size.filter((s) => s !== value);
        onChange({ size: PILLOW_SIZES.filter((s) => next.includes(s)) });
    };

    switch (group) {
        case "stage":
            return (
                <fieldset className="min-w-0">
                    <legend className="sr-only">Stage</legend>
                    <div className="grid gap-x-5 gap-y-4 @lg:grid-cols-3 @3xl:grid-cols-5">
                        {LIFECYCLE_STAGES.map((stage) => {
                            const stageChecked = filters.stage.includes(stage);
                            const details = LIFECYCLE_DETAILS.filter((d) => LIFECYCLE_DETAIL_STAGE[d] === stage);
                            return (
                                <div key={stage} className="min-w-0 space-y-2">
                                    <div className="flex min-w-0 items-start gap-2">
                                        <Checkbox
                                            id={`${id}-stage-${stage}`}
                                            checked={stageChecked}
                                            onCheckedChange={(checked) => toggleStage(stage, checked === true)}
                                            aria-describedby={`${id}-stage-${stage}-rule`}
                                            className="mt-0.5"
                                        />
                                        <div className="min-w-0">
                                            <Label htmlFor={`${id}-stage-${stage}`} className="font-normal">
                                                {LIFECYCLE_STAGE_LABEL[stage]}
                                            </Label>
                                            <p id={`${id}-stage-${stage}-rule`} className="text-xs text-muted-foreground">
                                                {LIFECYCLE_STAGE_RULE[stage]}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Sub-statuses (slice 04): implied, and so locked, while their stage is ticked. */}
                                    {details.length > 0 && (
                                        <div className="ml-6 space-y-1.5 border-l pl-3">
                                            {details.map((detail) => (
                                                <div key={detail} className="flex min-w-0 items-start gap-2">
                                                    <Checkbox
                                                        id={`${id}-stage-${detail}`}
                                                        checked={stageChecked || filters.stage.includes(detail)}
                                                        disabled={stageChecked}
                                                        onCheckedChange={(checked) => toggleStage(detail, checked === true)}
                                                        aria-describedby={`${id}-stage-${detail}-rule`}
                                                        className="mt-0.5"
                                                    />
                                                    <div className="min-w-0">
                                                        <Label htmlFor={`${id}-stage-${detail}`} className="font-normal">
                                                            {LIFECYCLE_DETAIL_LABEL[detail]}
                                                        </Label>
                                                        <p
                                                            id={`${id}-stage-${detail}-rule`}
                                                            className="text-xs text-muted-foreground"
                                                        >
                                                            {LIFECYCLE_DETAIL_RULE[detail]}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-2.5 text-xs text-muted-foreground">
                        Any of those ticked. A purchase is a paid order with a product on it; a re-adjustment fee is not one,
                        but the re-adjustment it pays for counts as a booking once attended. Shopify-era orders count,
                        without dates until their history is imported. Lost means unsubscribed from marketing email, with no
                        purchase or attended booking since.
                    </p>
                </fieldset>
            );
        case "purchases":
            return (
                <div className="grid min-w-0 gap-x-6 gap-y-5 @lg:grid-cols-2 @3xl:grid-cols-3">
                    <fieldset className="min-w-0 space-y-2.5">
                        <legend className="mb-2.5 text-sm font-medium">Bought</legend>
                        {BOUGHT_FILTERS.map((value) => (
                            <div key={value} className="flex items-center gap-2">
                                <Checkbox
                                    id={`${id}-bought-${value}`}
                                    checked={filters.bought.includes(value)}
                                    onCheckedChange={(checked) => toggleBought(value, checked === true)}
                                />
                                <Label htmlFor={`${id}-bought-${value}`} className="font-normal">
                                    {BOUGHT_LABELS[value]}
                                </Label>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">Any of those ticked, on a paid order.</p>
                    </fieldset>

                    <fieldset className="min-w-0 space-y-2.5">
                        <legend className="mb-2.5 text-sm font-medium">Didn&apos;t buy</legend>
                        {NOT_BOUGHT_FILTERS.map((value) => (
                            <div key={value} className="flex items-center gap-2">
                                <Checkbox
                                    id={`${id}-not-bought-${value}`}
                                    checked={filters.not_bought.includes(value)}
                                    onCheckedChange={(checked) => toggleNotBought(value, checked === true)}
                                />
                                <Label htmlFor={`${id}-not-bought-${value}`} className="font-normal">
                                    {BOUGHT_LABELS[value]}
                                </Label>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">None of those ticked, on any paid order.</p>
                    </fieldset>

                    <div className="min-w-0 space-y-4">
                        <fieldset className="min-w-0">
                            <legend className="mb-2.5 text-sm font-medium">Pillow size</legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-2.5">
                                {PILLOW_SIZES.map((value) => (
                                    <div key={value} className="flex items-center gap-2">
                                        <Checkbox
                                            id={`${id}-size-${value}`}
                                            checked={filters.size.includes(value)}
                                            onCheckedChange={(checked) => toggleSize(value, checked === true)}
                                        />
                                        <Label htmlFor={`${id}-size-${value}`} className="font-normal">
                                            {value}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-2.5 text-xs text-muted-foreground">Owns a pillow of any of those sizes.</p>
                        </fieldset>
                        <div className="space-y-2">
                            <Label htmlFor={`${id}-readjusted`}>Re-adjusted</Label>
                            <Select
                                value={filters.readjusted ?? "any"}
                                onValueChange={(v) => onChange({ readjusted: v === "any" ? null : (v as ReadjustedFilter) })}
                            >
                                <SelectTrigger id={`${id}-readjusted`} className="w-full" aria-label="Re-adjusted">
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any</SelectItem>
                                    <SelectItem value="ever">Re-adjusted</SelectItem>
                                    <SelectItem value="never">Never re-adjusted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor={`${id}-last-order`}>Last order</Label>
                            <Select
                                value={filters.last_order ? lastOrderValue(filters.last_order) : "any"}
                                onValueChange={(v) => {
                                    const parsed = customerFiltersSchema.shape.last_order.safeParse(v);
                                    onChange({ last_order: parsed.success ? (parsed.data ?? null) : null });
                                }}
                            >
                                <SelectTrigger id={`${id}-last-order`} className="w-full" aria-label="Last order">
                                    <SelectValue placeholder="Any time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any time</SelectItem>
                                    {lastOrderOptions.map((o) => (
                                        <SelectItem key={lastOrderValue(o)} value={lastOrderValue(o)}>
                                            {lastOrderLabel(o)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${id}-delivered`}>Delivered</Label>
                            <Select
                                value={filters.delivered ? deliveredValue(filters.delivered) : "any"}
                                onValueChange={(v) => {
                                    const parsed = customerFiltersSchema.shape.delivered.safeParse(v);
                                    onChange({ delivered: parsed.success ? (parsed.data ?? null) : null });
                                }}
                            >
                                <SelectTrigger
                                    id={`${id}-delivered`}
                                    className="w-full"
                                    aria-label="Delivered"
                                    aria-describedby={`${id}-delivered-hint`}
                                >
                                    <SelectValue placeholder="Any time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any time</SelectItem>
                                    {deliveredOptions.map((o) => (
                                        <SelectItem key={deliveredValue(o)} value={deliveredValue(o)}>
                                            {deliveredLabel(o)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p id={`${id}-delivered-hint`} className="text-xs text-muted-foreground">
                                Their latest purchase. One still on its way matches neither.
                            </p>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-min-spend`}>Spent at least (SGD)</Label>
                        {/* Keyed by the applied value, so clearing its chip clears the field. */}
                        <Input
                            key={String(filters.min_spend)}
                            id={`${id}-min-spend`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            placeholder="Any amount"
                            defaultValue={filters.min_spend ?? ""}
                            onKeyDown={onEnter}
                            onBlur={(e) => {
                                const text = e.currentTarget.value.trim();
                                if (!text) {
                                    if (filters.min_spend != null) onChange({ min_spend: null });
                                    return;
                                }
                                const parsed = customerFiltersSchema.shape.min_spend.safeParse(text);
                                if (!parsed.success) {
                                    // Not an amount the list reads: put back the one applied.
                                    e.currentTarget.value = filters.min_spend == null ? "" : String(filters.min_spend);
                                } else if (parsed.data !== filters.min_spend) {
                                    onChange({ min_spend: parsed.data ?? null });
                                }
                            }}
                        />
                        <p className="text-xs text-muted-foreground">Total spent on platform orders.</p>
                    </div>
                </div>
            );
        case "reach":
            // PRD-campaign-audiences slice 05: whether we may email them, where
            // they are, what they read, and what we last sent them.
            return (
                <div className="min-w-0 space-y-6">
                    <div className="grid min-w-0 gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
                        {/* Marketing consent (migration slice 07): who a campaign may reach. */}
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-consent`}>Email consent</Label>
                            <Select value={filters.consent} onValueChange={(v) => onChange({ consent: v as ConsentFilter })}>
                                <SelectTrigger id={`${id}-consent`} className="w-full" aria-label="Email consent">
                                    <SelectValue placeholder="Email consent" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any email consent</SelectItem>
                                    <SelectItem value="subscribed">Subscribed</SelectItem>
                                    <SelectItem value="not-subscribed">Not subscribed</SelectItem>
                                    <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-ships-to`}>Ships to</Label>
                            <Select
                                value={filters.ships_to ?? "any"}
                                onValueChange={(v) => onChange({ ships_to: v === "any" ? null : (v as ShipsToFilter) })}
                            >
                                <SelectTrigger
                                    id={`${id}-ships-to`}
                                    className="w-full"
                                    aria-label="Ships to"
                                    aria-describedby={`${id}-ships-to-hint`}
                                >
                                    <SelectValue placeholder="Anywhere" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Anywhere</SelectItem>
                                    {SHIPS_TO_FILTERS.map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {v === "sg" ? "Singapore" : v === "not-sg" ? "Outside Singapore" : "Unknown"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p id={`${id}-ships-to-hint`} className="text-xs text-muted-foreground">
                                Their latest order&apos;s address, else their default one. Unknown is never Singapore.
                            </p>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-language`}>Language</Label>
                            <Select
                                value={filters.language ?? "any"}
                                onValueChange={(v) => onChange({ language: v === "any" ? null : (v as LanguageFilter) })}
                            >
                                <SelectTrigger
                                    id={`${id}-language`}
                                    className="w-full"
                                    aria-label="Language"
                                    aria-describedby={`${id}-language-hint`}
                                >
                                    <SelectValue placeholder="Any language" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any language</SelectItem>
                                    {LANGUAGE_FILTERS.map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {LANGUAGE_LABELS[v]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p id={`${id}-language-hint`} className="text-xs text-muted-foreground">
                                The language they use the site in.
                            </p>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-emailed`}>Last emailed</Label>
                            <Select
                                value={filters.emailed ? emailedParam(filters.emailed) : "any"}
                                onValueChange={(v) => {
                                    const parsed = customerFiltersSchema.shape.emailed.safeParse(v);
                                    onChange({ emailed: parsed.success ? (parsed.data ?? null) : null });
                                }}
                            >
                                <SelectTrigger
                                    id={`${id}-emailed`}
                                    className="w-full"
                                    aria-label="Last emailed"
                                    aria-describedby={`${id}-emailed-hint`}
                                >
                                    <SelectValue placeholder="Any time" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any time</SelectItem>
                                    {emailedOptions.map((o) => (
                                        <SelectItem key={emailedParam(o)} value={emailedParam(o)}>
                                            {emailedLabel(o)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p id={`${id}-emailed-hint`} className="text-xs text-muted-foreground">
                                A campaign email. &ldquo;Not emailed&rdquo; includes people never emailed.
                            </p>
                        </div>
                    </div>
                    <fieldset className="min-w-0">
                        <legend className="mb-2.5 text-sm font-medium">Campaign history</legend>
                        <div className="grid min-w-0 gap-4 @lg:grid-cols-2">
                            <div className="min-w-0 space-y-2">
                                <Label htmlFor={`${id}-campaign`}>Campaign</Label>
                                <Select
                                    value={filters.campaign?.id ?? "any"}
                                    onValueChange={(v) =>
                                        onChange({
                                            campaign: v === "any" ? null : { id: v, state: filters.campaign?.state ?? "sent" },
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        id={`${id}-campaign`}
                                        disabled={campaignOptions.length === 0}
                                        className="w-full"
                                        aria-label="Campaign"
                                        aria-describedby={`${id}-campaign-hint`}
                                    >
                                        <SelectValue placeholder={campaignOptions.length ? "Any campaign" : "None sent yet"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="any">Any campaign</SelectItem>
                                        {campaignOptions.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name || "Untitled campaign"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p id={`${id}-campaign-hint`} className="text-xs text-muted-foreground">
                                    {campaignOptions.length
                                        ? "Campaigns that have started sending, latest first."
                                        : "No campaign has started sending yet."}
                                </p>
                            </div>
                            <div className="min-w-0 space-y-2">
                                <Label htmlFor={`${id}-campaign-state`}>What they did</Label>
                                <Select
                                    value={filters.campaign?.state ?? "sent"}
                                    onValueChange={(v) =>
                                        filters.campaign &&
                                        onChange({ campaign: { id: filters.campaign.id, state: v as CampaignFilterState } })
                                    }
                                >
                                    <SelectTrigger
                                        id={`${id}-campaign-state`}
                                        disabled={!filters.campaign}
                                        className="w-full"
                                        aria-label="What they did with the campaign"
                                        aria-describedby={`${id}-campaign-state-hint`}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CAMPAIGN_FILTER_STATES.map((v) => (
                                            <SelectItem key={v} value={v}>
                                                {CAMPAIGN_STATE_OPTION[v]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p id={`${id}-campaign-state-hint`} className="text-xs text-muted-foreground">
                                    A click is a visit to the site from a link in that email.
                                </p>
                            </div>
                        </div>
                    </fieldset>
                </div>
            );
        case "account":
            return (
                <div className="grid min-w-0 gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-account`}>Account</Label>
                        <Select value={filters.account} onValueChange={(v) => onChange({ account: v as AccountFilter })}>
                            <SelectTrigger id={`${id}-account`} className="w-full" aria-label="Account">
                                <SelectValue placeholder="Account" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All accounts</SelectItem>
                                {/* An account is bound by the email they signed in with (CRM 11). */}
                                <SelectItem value="signed-up">Signed up, email verified</SelectItem>
                                <SelectItem value="no-account">No account, email not verified</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-source`}>Source</Label>
                        <Select value={filters.source} onValueChange={(v) => onChange({ source: v as SourceFilter })}>
                            <SelectTrigger id={`${id}-source`} className="w-full" aria-label="Source">
                                <SelectValue placeholder="Source" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All sources</SelectItem>
                                <SelectItem value="shopify">From Shopify</SelectItem>
                                <SelectItem value="platform">Platform</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-google`}>Sign-in</Label>
                        <Select value={filters.google} onValueChange={(v) => onChange({ google: v as GoogleFilter })}>
                            <SelectTrigger id={`${id}-google`} className="w-full" aria-label="Google">
                                <SelectValue placeholder="Google" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any sign-in</SelectItem>
                                <SelectItem value="linked">Google linked</SelectItem>
                                <SelectItem value="not-linked">Google not linked</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-mobile`}>Mobile</Label>
                        <Select value={filters.mobile} onValueChange={(v) => onChange({ mobile: v as MobileFilter })}>
                            <SelectTrigger id={`${id}-mobile`} className="w-full" aria-label="Mobile">
                                <SelectValue placeholder="Mobile" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any mobile</SelectItem>
                                <SelectItem value="on-file">Valid mobile on file</SelectItem>
                                <SelectItem value="missing">Mobile missing</SelectItem>
                                <SelectItem value="invalid">Mobile invalid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-followups`}>Follow-ups</Label>
                        <Select value={filters.followups} onValueChange={(v) => onChange({ followups: v as FollowUpFilter })}>
                            <SelectTrigger id={`${id}-followups`} className="w-full" aria-label="Follow-ups">
                                <SelectValue placeholder="Follow-ups" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any follow-ups</SelectItem>
                                <SelectItem value="open">Has an open follow-up</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {/* Points (PRD-loyalty-points slice 06): an available balance, or none. */}
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor={`${id}-points`}>Points</Label>
                        <Select value={filters.points} onValueChange={(v) => onChange({ points: v as PointsFilter })}>
                            <SelectTrigger id={`${id}-points`} className="w-full" aria-label="Points">
                                <SelectValue placeholder="Points" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any points</SelectItem>
                                <SelectItem value="has">{POINTS_LABELS.has}</SelectItem>
                                <SelectItem value="none">{POINTS_LABELS.none}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <TagsField tags={filters.tags} onChange={(tags) => onChange({ tags })} />
                </div>
            );
        case "reviews":
            // CRM slice 12: a Google review counts once Staff have linked it.
            return (
                <fieldset className="min-w-0 space-y-3">
                    <legend className="sr-only">Reviews</legend>
                    <div className="grid min-w-0 gap-4 @lg:grid-cols-3">
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-google-review`}>Google review</Label>
                            <Select
                                value={filters.google_review}
                                onValueChange={(v) => onChange({ google_review: v as GoogleReviewFilter })}
                            >
                                <SelectTrigger id={`${id}-google-review`} className="w-full" aria-label="Google review">
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any</SelectItem>
                                    {GOOGLE_REVIEW_FILTERS.filter((v) => v !== "all").map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {GOOGLE_REVIEW_LABELS[v]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-shop-review`}>Shop review</Label>
                            <Select
                                value={filters.shop_review}
                                onValueChange={(v) => onChange({ shop_review: v as ShopReviewFilter })}
                            >
                                <SelectTrigger id={`${id}-shop-review`} className="w-full" aria-label="Shop review">
                                    <SelectValue placeholder="Any" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Any</SelectItem>
                                    <SelectItem value="yes">Left a shop review</SelectItem>
                                    <SelectItem value="no">No shop review</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor={`${id}-rating`}>Rating</Label>
                            <Select
                                value={filters.rating ?? "any"}
                                onValueChange={(v) => onChange({ rating: v === "any" ? null : (v as RatingFilter) })}
                            >
                                <SelectTrigger id={`${id}-rating`} className="w-full" aria-label="Rating">
                                    <SelectValue placeholder="Any rating" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="any">Any rating</SelectItem>
                                    {RATING_FILTERS.map((v) => (
                                        <SelectItem key={v} value={v}>
                                            {RATING_LABELS[v]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        The rating is the linked Google review&apos;s, or else their shop reviews&apos; average.
                    </p>
                </fieldset>
            );
    }
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
    const id = useId();
    const applied = tags.join(", ");
    return (
        <div className="min-w-0 space-y-2">
            <Label htmlFor={id}>Tags</Label>
            <Input
                key={applied}
                id={id}
                placeholder="vip, wholesale"
                defaultValue={applied}
                onKeyDown={onEnter}
                onBlur={(e) => {
                    const parsed = customerFiltersSchema.shape.tags.safeParse(e.currentTarget.value);
                    const next = parsed.success ? (parsed.data ?? []) : [];
                    if (next.join(",") !== tags.join(",")) onChange(next);
                }}
            />
            <p className="text-xs text-muted-foreground">Any of these, separated by commas.</p>
        </div>
    );
}

function ignoredNote(ignored: readonly CustomerFilterParam[]): string {
    const n = ignored.length;
    return `${n} filter${n === 1 ? "" : "s"} ignored (${ignored.join(", ")}): the link had a value the list does not know, so it was left out.`;
}

/**
 * With *Ships to* Singapore or elsewhere (PRD-campaign-audiences slice 05):
 * how many more match every other filter but have no known country, so the
 * list says whom it leaves out. Null when there are none to mention.
 */
export function shipsToUnknownNote(filters: Pick<CustomerListFilters, "ships_to">, unknown: number | null | undefined): string | null {
    if ((filters.ships_to !== "sg" && filters.ships_to !== "not-sg") || !unknown) return null;
    const n = unknown.toLocaleString("en-SG");
    return `${n} more match${unknown === 1 ? "es" : ""} the other filters but ship${unknown === 1 ? "s" : ""} to an unknown country: no order or address of theirs names one.`;
}

/**
 * The active filters above the table, each with ×, and *Clear all*. Also the
 * note for parameters a link carried that the list could not read: they were
 * dropped, never applied.
 */
export function CustomerFilterSummary({
    filters,
    ignored,
    campaigns = [],
    shipsToUnknown = null,
    onClear,
    onClearAll,
}: {
    filters: CustomerListFilters;
    ignored: readonly CustomerFilterParam[];
    /** Names for a *Campaign* filter's chip. */
    campaigns?: readonly CampaignFilterOption[];
    /** With *Ships to*: how many more ship to an unknown country (`listAdminCustomers`). */
    shipsToUnknown?: number | null;
    onClear: (key: CustomerFilterKey) => void;
    onClearAll: () => void;
}) {
    const [noteOpen, setNoteOpen] = useState(true);
    const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));
    const active = describeCustomerFilters(filters, { campaignNames });
    const unknownNote = shipsToUnknownNote(filters, shipsToUnknown);
    const showNote = noteOpen && ignored.length > 0;
    if (!active.length && !showNote) return null;

    return (
        <div className="space-y-2">
            {showNote && (
                <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span>{ignoredNote(ignored)}</span>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => setNoteOpen(false)}
                        className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors after:absolute after:-inset-2.5 after:content-[''] hover:bg-muted active:bg-press"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </p>
            )}
            {active.length > 0 && (
                <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
                    {active.map(({ key, label }) => (
                        <Badge key={key} variant="secondary" className="max-w-full gap-1 py-0.5 pr-0.5 font-normal">
                            <span className="truncate">{label}</span>
                            <button
                                type="button"
                                aria-label={`Remove filter: ${label}`}
                                onClick={() => onClear(key)}
                                className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors after:absolute after:-inset-3 after:content-[''] hover:bg-muted-foreground/20 active:bg-press"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onClearAll}>
                        Clear all
                    </Button>
                </div>
            )}
            {unknownNote && <p className="text-sm text-muted-foreground">{unknownNote}</p>}
        </div>
    );
}
