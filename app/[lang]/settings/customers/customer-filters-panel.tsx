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
    customerFiltersSchema,
    describeCustomerFilters,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
    type LastOrderFilter,
    type ReadjustedFilter,
} from "@/lib/crm/customer-filters";

/**
 * The Customers list's CRM filters (CRM slice 04): what they bought, when
 * they last ordered, whether they have been re-adjusted, what they spent, and
 * tags. Values go through the list's one schema (lib/crm/customer-filters.ts),
 * so a control can never put into the URL what a link could not.
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

    const toggleBought = (value: (typeof BOUGHT_FILTERS)[number], checked: boolean) => {
        const next = checked ? [...filters.bought, value] : filters.bought.filter((b) => b !== value);
        onChange({ bought: BOUGHT_FILTERS.filter((b) => next.includes(b)) });
    };

    return (
        <div className="grid min-w-0 gap-5 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
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

            <TagsField tags={filters.tags} onChange={(tags) => onChange({ tags })} />
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
