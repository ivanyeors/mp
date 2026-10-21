"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Tag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
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
import { formatCurrency } from "@/lib/i18n/currencies";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { PointsSettingsCard } from "./points-settings-card";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Coupon = {
    id: string;
    code: string;
    discount_type: "percentage" | "fixed_amount" | "free_shipping";
    discount_value: number;
    currency: string;
    usage_count: number;
    usage_limit: number | null;
    is_active: boolean;
    starts_at: string | null;
    expires_at: string | null;
    created_at: string;
};

/** Exactly the JSON `GET /api/shop/coupons?limit=100` returns. */
export type CouponsListResponse = {
    ok: true;
    rows: Coupon[];
    total: number;
    page: number;
    limit: number;
};

export type DiscountsInitialData = {
    coupons: CouponsListResponse;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(coupon: Coupon): string {
    if (coupon.discount_type === "percentage") return `${coupon.discount_value}%`;
    if (coupon.discount_type === "fixed_amount")
        return formatCurrency(coupon.discount_value, coupon.currency);
    return "Free shipping";
}

function typeBadgeVariant(
    type: Coupon["discount_type"]
): "default" | "secondary" | "outline" {
    if (type === "percentage") return "default";
    if (type === "fixed_amount") return "secondary";
    return "outline";
}

function typeBadgeLabel(type: Coupon["discount_type"]): string {
    if (type === "percentage") return "Percentage";
    if (type === "fixed_amount") return "Fixed";
    return "Free shipping";
}

function getStatus(coupon: Coupon): {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
} {
    const now = new Date();
    if (!coupon.is_active) return { label: "Inactive", variant: "secondary" };
    if (coupon.starts_at && new Date(coupon.starts_at) > now)
        return { label: "Scheduled", variant: "outline" };
    if (coupon.expires_at && new Date(coupon.expires_at) < now)
        return { label: "Expired", variant: "destructive" };
    return { label: "Active", variant: "default" };
}

function formatDateRange(starts_at: string | null, expires_at: string | null): string {
    const fmt = (d: string) => formatAdminDateMY(d);
    if (starts_at && expires_at) return `${fmt(starts_at)} – ${fmt(expires_at)}`;
    if (starts_at) return `From ${fmt(starts_at)}`;
    if (expires_at) return `Until ${fmt(expires_at)}`;
    return "No expiry";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiscountsClient({
    initialData,
}: {
    initialData?: DiscountsInitialData;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    const [coupons, setCoupons] = useState<Coupon[]>(initialData?.coupons.rows ?? []);
    const [total, setTotal] = useState(initialData?.coupons.total ?? 0);
    const [loading, setLoading] = useState(!initialData);

    // The RSC page already fetched this list — skip the mount fetch once.
    const hydratedFromServer = useRef(Boolean(initialData));

    const fetchCoupons = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shop/coupons?limit=100");
            const json = await res.json();
            setCoupons(json.rows ?? []);
            setTotal(json.total ?? 0);
        } catch {
            setCoupons([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (hydratedFromServer.current) {
            hydratedFromServer.current = false;
            return;
        }
        fetchCoupons();
    }, [fetchCoupons]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight">Discounts</h1>
                    <InfoTip label="About Discounts">
                        Manage discount codes and promotions for your store.
                    </InfoTip>
                </div>
                <Button asChild size="sm" className="w-full sm:w-auto">
                    <Link href={to("/settings/discounts/new")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Discount
                    </Link>
                </Button>
            </div>

            <PointsSettingsCard />

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : coupons.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <Tag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        No discount codes yet. Create your first discount to get started.
                    </p>
                    <Button asChild size="sm" className="mt-4">
                        <Link href={to("/settings/discounts/new")}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Discount
                        </Link>
                    </Button>
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">Code</TableHead>
                                <TableHead className="px-4">Type</TableHead>
                                <TableHead className="px-4">Value</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Usage</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Status</TableHead>
                                <TableHead className="px-4 hidden lg:table-cell">Valid dates</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {coupons.map((coupon) => {
                                const status = getStatus(coupon);
                                return (
                                    <TableRow
                                        key={coupon.id}
                                        className="cursor-pointer transition-colors"
                                        onClick={() =>
                                            router.push(to(`/settings/discounts/${coupon.id}`))
                                        }
                                    >
                                        {/* Code */}
                                        <TableCell className="px-4 py-3">
                                            <div className="space-y-1">
                                                <span className="font-mono font-medium tracking-wide">
                                                    {coupon.code}
                                                </span>
                                                <div className="md:hidden">
                                                    <Badge variant={status.variant}>{status.label}</Badge>
                                                </div>
                                            </div>
                                        </TableCell>

                                        {/* Type */}
                                        <TableCell className="px-4">
                                            <Badge variant={typeBadgeVariant(coupon.discount_type)}>
                                                {typeBadgeLabel(coupon.discount_type)}
                                            </Badge>
                                        </TableCell>

                                        {/* Value */}
                                        <TableCell className="px-4 text-sm font-medium">
                                            {formatValue(coupon)}
                                        </TableCell>

                                        {/* Usage */}
                                        <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground">
                                            {coupon.usage_limit === null
                                                ? `${coupon.usage_count} / Unlimited`
                                                : `${coupon.usage_count} / ${coupon.usage_limit}`}
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell className="px-4 hidden md:table-cell">
                                            <Badge variant={status.variant}>{status.label}</Badge>
                                        </TableCell>

                                        {/* Valid dates — formatted in the viewer's timezone, which the server render cannot know. */}
                                        <TableCell
                                            className="px-4 hidden lg:table-cell text-sm text-muted-foreground"
                                            suppressHydrationWarning
                                        >
                                            {formatDateRange(coupon.starts_at, coupon.expires_at)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {total > 0 && (
                <p className="text-sm text-muted-foreground">
                    {total} discount code{total !== 1 ? "s" : ""} total
                </p>
            )}
        </div>
    );
}
