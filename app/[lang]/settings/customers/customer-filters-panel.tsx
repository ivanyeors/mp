"use client";

import { useId, useState, type KeyboardEvent } from "react";
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
    GOOGLE_REVIEW_FILTERS,
    GOOGLE_REVIEW_LABELS,
    POINTS_LABELS,
    RATING_FILTERS,
    RATING_LABELS,
    STAGE_FILTERS,
    customerFiltersSchema,
    describeCustomerFilters,
    type ConsentFilter,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
    type GoogleReviewFilter,
    type LastOrderFilter,
    type PointsFilter,
    type RatingFilter,
    type ReadjustedFilter,
    type ShopReviewFilter,
} from "@/lib/crm/customer-filters";
import { LIFECYCLE_STAGE_LABEL, LIFECYCLE_STAGE_RULE } from "@/lib/crm/lifecycle-stage";

/**
 * The Customers list's CRM filters: the **Lifecycle stage**
 * (PRD-crm-retention-loop slice 03); (CRM slice 04) what they bought, when
 * they last ordered, whether they have been re-adjusted, what they spent, and
 * tags; Points (PRD-loyalty-points slice 06); Email consent
 * (migration slice 07); and reviews (CRM slice 12: the Google review, Shop
 * reviews, the rating). Values go through
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
}: {
    filters: CustomerListFilters;
    onChange: (patch: Partial<CustomerListFilters>) => void;
}) {
    const id = useId();
    const lastOrderOptions =
        filters.last_order && !LAST_ORDER_PRESETS.some((p) => lastOrderValue(p) === lastOrderValue(filters.last_order!))
            ? [...LAST_ORDER_PRESETS, filters.last_order]
            : LAST_ORDER_PRESETS;

    const toggleStage = (value: (typeof STAGE_FILTERS)[number], checked: boolean) => {
        const next = checked ? [...filters.stage, value] : filters.stage.filter((s) => s !== value);
        onChange({ stage: STAGE_FILTERS.filter((s) => next.includes(s)) });
    };

    const toggleBought = (value: (typeof BOUGHT_FILTERS)[number], checked: boolean) => {
        const next = checked ? [...filters.bought, value] : filters.bought.filter((b) => b !== value);
        onChange({ bought: BOUGHT_FILTERS.filter((b) => next.includes(b)) });
    };

    return (
        <div className="grid min-w-0 gap-5 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
            <fieldset className="min-w-0 sm:col-span-2 lg:col-span-4">
                <legend className="mb-2.5 text-sm font-medium">Stage</legend>
                <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
                    {STAGE_FILTERS.map((value) => (
                        <div key={value} className="flex min-w-0 items-start gap-2">
                            <Checkbox
                                id={`${id}-stage-${value}`}
                                checked={filters.stage.includes(value)}
                                onCheckedChange={(checked) => toggleStage(value, checked === true)}
                                aria-describedby={`${id}-stage-${value}-rule`}
                                className="mt-0.5"
                            />
                            <div className="min-w-0">
                                <Label htmlFor={`${id}-stage-${value}`} className="font-normal">
                                    {LIFECYCLE_STAGE_LABEL[value]}
                                </Label>
                                <p id={`${id}-stage-${value}-rule`} className="text-xs text-muted-foreground">
                                    {LIFECYCLE_STAGE_RULE[value]}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-2.5 text-xs text-muted-foreground">
                    Any of those ticked. A purchase is a paid order with a product on it; a re-adjustment fee is not one.
                    Shopify-era orders count, without dates until their history is imported.
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
 * The active filters above the table, each with ×, and *Clear all*. Also the
 * note for parameters a link carried that the list could not read: they were
 * dropped, never applied.
 */
export function CustomerFilterSummary({
    filters,
    ignored,
    onClear,
    onClearAll,
}: {
    filters: CustomerListFilters;
    ignored: readonly CustomerFilterParam[];
    onClear: (key: CustomerFilterKey) => void;
    onClearAll: () => void;
}) {
    const [noteOpen, setNoteOpen] = useState(true);
    const active = describeCustomerFilters(filters);
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
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-muted"
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
                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-muted-foreground/20"
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
        </div>
    );
}
