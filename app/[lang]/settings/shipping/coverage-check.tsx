"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Globe, Loader2, MinusCircle, Plus, Square, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCurrency } from "@/lib/i18n/currencies";
import { COUNTRIES, REGIONS, findCountry, type Country, type Region } from "@/lib/shipping/countries";
import type { CourierRate, PackageType } from "@/lib/shipping/types";
import { apiErrorMessage } from "./couriers/easyship-panel";
import type { ShippingMethod } from "./shipping-client";

/** One country's answer: couriers that quoted, none that did, or a request that failed. */
type CountryResult =
    | { status: "covered"; couriers: number; cheapest: CourierRate; fastest: CourierRate }
    | { status: "none" }
    | { status: "error"; message: string };

type Scope = Region | "all";
type Filter = "all" | "covered" | "none";

// Parallel quotes; low enough not to trip the courier API's rate limit.
const CONCURRENCY = 4;

/** Failures that are the same for every country: stop rather than repeat them 200 times. */
const ACCOUNT_FAILURES = new Set(["not_configured", "invalid_origin", "too_many_parcels"]);

function methodName(m: ShippingMethod): string {
    return m.content?.["en-US"]?.name ?? m.content?.en?.name ?? m.slug;
}

function days(rate: CourierRate): string {
    if (rate.min_days == null) return "—";
    const max = rate.max_days ?? rate.min_days;
    return max === rate.min_days ? `${max} days` : `${rate.min_days} to ${max} days`;
}

class AccountError extends Error {}

async function checkCountry(country: Country, profile: PackageType, signal: AbortSignal): Promise<CountryResult> {
    const res = await fetch("/api/shop/shipping/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            destination: { country: country.code, postal_code: country.postal ?? "", city: country.city },
            profile,
            quantity: 1,
        }),
        signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { status: "error", message: apiErrorMessage(json?.error, `Couldn't get a quote (${res.status}).`) };
    if (!json?.ok) {
        if (ACCOUNT_FAILURES.has(json?.reason)) throw new AccountError(json.error ?? "The courier account can't quote.");
        return { status: "error", message: json?.error ?? "The courier couldn't quote." };
    }
    const rates = (json.rates ?? []) as CourierRate[];
    if (rates.length === 0) return { status: "none" };
    const byTime = [...rates].sort((a, b) => (a.max_days ?? 99) - (b.max_days ?? 99) || a.total_charge - b.total_charge);
    return { status: "covered", couriers: rates.length, cheapest: rates[0], fastest: byTime[0] };
}

/**
 * Settings → Shipping "Coverage": quotes one boxed item to every country in a
 * region (or the world) with today's courier rates, so Staff can see where the
 * courier account actually delivers before offering a country — and add the
 * covered ones to a live method in one step. Nothing is saved until then.
 */
export function CoverageCheck({
    open,
    onOpenChange,
    methods,
    environment,
    onMethodsChanged,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    methods: ShippingMethod[];
    environment: "sandbox" | "production" | null;
    onMethodsChanged: () => Promise<void> | void;
}) {
    const [scope, setScope] = useState<Scope>("all");
    const [profile, setProfile] = useState<PackageType>("pillow");
    const [results, setResults] = useState<Record<string, CountryResult>>({});
    const [queue, setQueue] = useState<string[]>([]);
    const [done, setDone] = useState(0);
    const [running, setRunning] = useState(false);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("all");
    const liveMethods = methods.filter((m) => m.rate_source === "easyship");
    const [targetId, setTargetId] = useState<string>("");
    const [adding, setAdding] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const run = async (codes: string[]) => {
        const countries = codes.map((c) => findCountry(c)).filter((c): c is Country => Boolean(c));
        const controller = new AbortController();
        abortRef.current = controller;
        setQueue(countries.map((c) => c.code));
        setDone(0);
        setAccountError(null);
        setRunning(true);
        setResults((prev) => {
            const next = { ...prev };
            for (const c of countries) delete next[c.code];
            return next;
        });

        let index = 0;
        const worker = async () => {
            while (index < countries.length && !controller.signal.aborted) {
                const country = countries[index++];
                try {
                    const result = await checkCountry(country, profile, controller.signal);
                    setResults((prev) => ({ ...prev, [country.code]: result }));
                } catch (err) {
                    if (controller.signal.aborted) return;
                    if (err instanceof AccountError) {
                        setAccountError(err.message);
                        controller.abort();
                        return;
                    }
                    setResults((prev) => ({
                        ...prev,
                        [country.code]: { status: "error", message: err instanceof Error ? err.message : "Couldn't reach the server." },
                    }));
                }
                setDone((n) => n + 1);
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, countries.length) }, worker));
        setRunning(false);
    };

    const scopeCodes = (scope === "all" ? COUNTRIES : COUNTRIES.filter((c) => c.region === scope)).map((c) => c.code);
    const checked = COUNTRIES.filter((c) => results[c.code]);
    const covered = checked.filter((c) => results[c.code].status === "covered").map((c) => c.code);
    const failed = checked.filter((c) => results[c.code].status === "error").map((c) => c.code);
    const offeredBy = (code: string) => methods.filter((m) => m.is_active && m.countries?.includes(code));
    const target = liveMethods.find((m) => m.id === targetId) ?? liveMethods[0] ?? null;
    const toAdd = target ? covered.filter((c) => !target.countries?.includes(c)) : [];
    const rows = checked.filter((c) => {
        const s = results[c.code].status;
        return filter === "all" || (filter === "covered" ? s === "covered" : s !== "covered");
    });

    const addToMethod = async () => {
        if (!target || toAdd.length === 0) return;
        setAdding(true);
        try {
            const countries = [...(target.countries ?? []), ...toAdd];
            const res = await fetch(`/api/shop/shipping/${target.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ countries }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) {
                toast.error(apiErrorMessage(json?.error, "Couldn't update the method."));
                return;
            }
            toast.success(`${toAdd.length} ${toAdd.length === 1 ? "country" : "countries"} added to ${methodName(target)}`);
            await onMethodsChanged();
        } catch {
            toast.error("Couldn't reach the server. Try again.");
        } finally {
            setAdding(false);
        }
    };

    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) abortRef.current?.abort();
                onOpenChange(next);
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Courier coverage
                    </SheetTitle>
                    <SheetDescription>
                        Quotes one boxed item to each country&apos;s main city with today&apos;s courier rates, to show where
                        your courier account delivers. Nothing changes until you add countries to a method.
                    </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                    {!environment ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            Couriers aren&apos;t connected, so there&apos;s nothing to check. Set up the connection on the Couriers page.
                        </div>
                    ) : (
                        <>
                            {environment === "sandbox" && (
                                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                                    Sandbox account: these are test rates. Re-check after switching to the production token.
                                </p>
                            )}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
                                <div className="space-y-1.5">
                                    <Label>Countries</Label>
                                    <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                                        <SelectTrigger className="w-full" disabled={running}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Worldwide ({COUNTRIES.length})</SelectItem>
                                            {REGIONS.map((r) => (
                                                <SelectItem key={r.key} value={r.key}>
                                                    {r.label} ({COUNTRIES.filter((c) => c.region === r.key).length})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Item</Label>
                                    <Select
                                        value={profile}
                                        onValueChange={(v) => {
                                            // Results for another item would read as this one's.
                                            setProfile(v as PackageType);
                                            setResults({});
                                            setQueue([]);
                                            setDone(0);
                                        }}
                                    >
                                        <SelectTrigger className="w-full" disabled={running}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pillow">Pillow</SelectItem>
                                            <SelectItem value="bolster">Bolster</SelectItem>
                                            <SelectItem value="accessory">Accessory</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                {running ? (
                                    <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                                        <Square className="mr-2 h-4 w-4" />
                                        Stop
                                    </Button>
                                ) : (
                                    <Button onClick={() => run(scopeCodes)}>Check {scopeCodes.length} countries</Button>
                                )}
                            </div>

                            {(running || done > 0) && queue.length > 0 && (
                                <div className="space-y-1.5">
                                    <Progress value={(done / queue.length) * 100} />
                                    <p className="text-xs text-muted-foreground">
                                        {running ? `Checking ${done} of ${queue.length}…` : `Checked ${done} of ${queue.length}.`}
                                    </p>
                                </div>
                            )}

                            {accountError && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                    {accountError}
                                </div>
                            )}

                            {checked.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm">
                                            <span className="font-medium">{covered.length}</span> of {checked.length} countries have a
                                            courier
                                            {failed.length > 0 && <span className="text-muted-foreground">, {failed.length} failed</span>}
                                        </p>
                                        <div className="flex gap-2">
                                            {failed.length > 0 && !running && (
                                                <Button size="sm" variant="outline" onClick={() => run(failed)}>
                                                    Retry failed
                                                </Button>
                                            )}
                                            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                                                <SelectTrigger className="h-8 w-36">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All checked</SelectItem>
                                                    <SelectItem value="covered">Has a courier</SelectItem>
                                                    <SelectItem value="none">No courier or failed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {!running && covered.length > 0 && (
                                        <div className="space-y-2 rounded-lg border p-3">
                                            {liveMethods.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Add a method priced by live courier rate to offer these countries: a flat rate
                                                    would charge every one of them the same.
                                                </p>
                                            ) : (
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                        <Label>Offer the covered countries with</Label>
                                                        <Select value={target?.id ?? ""} onValueChange={setTargetId}>
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {liveMethods.map((m) => (
                                                                    <SelectItem key={m.id} value={m.id}>
                                                                        {methodName(m)}
                                                                        {!m.is_active && " (inactive)"}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <Button onClick={addToMethod} disabled={adding || toAdd.length === 0}>
                                                        {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                                        {toAdd.length === 0
                                                            ? "Already offered"
                                                            : `Add ${toAdd.length} ${toAdd.length === 1 ? "country" : "countries"}`}
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="overflow-x-auto rounded-lg border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                                                <tr>
                                                    <th className="px-3 py-2 font-medium">Country</th>
                                                    <th className="px-3 py-2 font-medium">Cheapest (cost to us)</th>
                                                    <th className="px-3 py-2 font-medium">Fastest</th>
                                                    <th className="px-3 py-2 font-medium">Offered by</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {rows.map((c) => {
                                                    const r = results[c.code];
                                                    const offered = offeredBy(c.code);
                                                    return (
                                                        <tr key={c.code}>
                                                            <td className="px-3 py-2">
                                                                <div className="flex items-start gap-2">
                                                                    {r.status === "covered" ? (
                                                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                                                    ) : r.status === "none" ? (
                                                                        <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                                                    ) : (
                                                                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium">{c.name}</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {r.status === "covered"
                                                                                ? `${r.couriers} courier${r.couriers === 1 ? "" : "s"}`
                                                                                : r.status === "none"
                                                                                  ? "No courier"
                                                                                  : r.message}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                {r.status === "covered" ? (
                                                                    <>
                                                                        <p className="whitespace-nowrap">
                                                                            {formatCurrency(r.cheapest.total_charge, r.cheapest.currency)}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {r.cheapest.courier_name}, {days(r.cheapest)}
                                                                        </p>
                                                                    </>
                                                                ) : (
                                                                    "—"
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                {r.status === "covered" ? (
                                                                    <>
                                                                        <p className="whitespace-nowrap">{days(r.fastest)}</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {r.fastest.courier_name},{" "}
                                                                            {formatCurrency(r.fastest.total_charge, r.fastest.currency)}
                                                                        </p>
                                                                    </>
                                                                ) : (
                                                                    "—"
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 text-xs">
                                                                {offered.length > 0 ? offered.map(methodName).join(", ") : (
                                                                    <span className="text-muted-foreground">Not offered</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Costs are before your method&apos;s markup and handling days. A country can still be refused
                                        for a particular address; the checkout quotes every address live.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
