"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    BOUGHT_FILTERS,
    BOUGHT_LABELS,
    CAMPAIGN_FILTER_STATES,
    LANGUAGE_FILTERS,
    LANGUAGE_LABELS,
    SHIPS_TO_FILTERS,
    emailedLabel,
    emailedParam,
    monthsLabel,
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
    type ConsentFilter,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
    type CampaignFilterState,
    type DeliveredFilter,
    type EmailedFilter,
    type GoogleReviewFilter,
    type LanguageFilter,
    type LastOrderFilter,
    type PointsFilter,
    type RatingFilter,
    type ReadjustedFilter,
    type ShipsToFilter,
    type ShopReviewFilter,
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
 * The Customers list's CRM filters: the **Lifecycle stage**
 * (PRD-crm-retention-loop slice 03); (CRM slice 04) what they bought, when
 * they last ordered, whether they have been re-adjusted, what they spent, and
 * tags; Points (PRD-loyalty-points slice 06); Email consent
 * (migration slice 07); and reviews (CRM slice 12: the Google review, Shop
 * reviews, the rating); and (PRD-campaign-audiences slice 04) the Stage's
 * sub-statuses, what they did not buy, their pillow size, and how long ago
 * their latest purchase was delivered; and (slice 05) reach: where they ship
 * to, the language they read, when their points expire, what one campaign
 * did with them, and when a campaign last reached them. Values go through
 * the list's one schema (lib/crm/customer-filters.ts), so a control can never
 * put into the URL what a link could not.
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

/** Presets for *Points expire within*, in months; a link may carry any other. */
const POINTS_EXPIRE_PRESETS = [1, 3, 6];

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

export function CustomerFiltersPanel({
    filters,
    onChange,
    campaigns = [],
    children,
}: {
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
    /** The *Campaign* filter's choices: campaigns that have started sending, latest first. */
    campaigns?: readonly CampaignFilterOption[];
    /** Extra controls at the top of the panel: the toolbar's selects, on a phone. */
    children?: ReactNode;
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

    const pointsExpireOptions =
        filters.points_expire && !POINTS_EXPIRE_PRESETS.includes(filters.points_expire.months)
            ? [...POINTS_EXPIRE_PRESETS, filters.points_expire.months].sort((a, b) => a - b)
            : POINTS_EXPIRE_PRESETS;

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

    return (
        <div className="grid min-w-0 gap-5 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
            {children}
            <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
                <legend className="mb-2.5 text-sm font-medium">Stage</legend>
                <div className="grid gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
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

            <div className="min-w-0 space-y-4">
                <div className="space-y-2">
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
                {/* Marketing consent (migration slice 07): who a campaign may reach. */}
                <div className="space-y-2">
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
            </div>

            <div className="min-w-0 space-y-4">
                {/* Points (PRD-loyalty-points slice 06): an available balance, or none. */}
                <div className="space-y-2">
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

            {/* Reach (PRD-campaign-audiences slice 05): where they are, what they read, and what we last sent them. */}
            <fieldset className="min-w-0 space-y-3 sm:col-span-2 lg:col-span-4">
                <legend className="mb-1 text-sm font-medium">Reach</legend>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                        <Label htmlFor={`${id}-points-expire`}>Points expire</Label>
                        <Select
                            value={filters.points_expire ? String(filters.points_expire.months) : "any"}
                            onValueChange={(v) => onChange({ points_expire: v === "any" ? null : { months: Number(v) } })}
                        >
                            <SelectTrigger
                                id={`${id}-points-expire`}
                                className="w-full"
                                aria-label="Points expire"
                                aria-describedby={`${id}-points-expire-hint`}
                            >
                                <SelectValue placeholder="Any time" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any time</SelectItem>
                                {pointsExpireOptions.map((m) => (
                                    <SelectItem key={m} value={String(m)}>
                                        Within {monthsLabel(m)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p id={`${id}-points-expire-hint`} className="text-xs text-muted-foreground">
                            A balance above 0, on the date their Profile shows. None while points are off.
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
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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

            {/* Reviews (CRM slice 12): a Google review counts once Staff have linked it. */}
            <fieldset className="min-w-0 space-y-3 sm:col-span-2 lg:col-span-4">
                <legend className="mb-1 text-sm font-medium">Reviews</legend>
                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
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
        </div>
    );
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
