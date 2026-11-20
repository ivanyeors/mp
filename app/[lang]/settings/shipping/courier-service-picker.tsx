"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/i18n/currencies";
import { findCountry } from "@/lib/shipping/countries";
import type { CourierRate } from "@/lib/shipping/types";
import { apiErrorMessage } from "./couriers/easyship-panel";

function transit(r: CourierRate): string | null {
    if (r.min_days == null) return null;
    const max = r.max_days ?? r.min_days;
    return max === r.min_days ? `${max} ${max === 1 ? "day" : "days"}` : `${r.min_days}–${max} days`;
}

export function CourierServicePicker({
    value,
    onChange,
    country,
}: {
    value: string;
    onChange: (id: string) => void;
    country: string;
}) {
    const [loading, setLoading] = useState(false);
    const [rates, setRates] = useState<CourierRate[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const target = findCountry(country) ?? findCountry("SG")!;

    const find = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/shop/shipping/settings/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    destination: { country: target.code, postal_code: target.postal ?? "", city: target.city },
                    profile: "pillow",
                    quantity: 1,
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setRates(null);
                setError(apiErrorMessage(json?.error, "Couldn't get today's couriers."));
                return;
            }
            setRates((json.rates ?? []) as CourierRate[]);
        } catch {
            setError("Couldn't reach the server. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="easyship_courier_service_id">Courier service</Label>
                    <Input
                        id="easyship_courier_service_id"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Find couriers, or paste a service id"
                        className="text-base md:text-sm"
                    />
                </div>
                <Button type="button" variant="outline" onClick={find} disabled={loading} className="max-md:min-h-11">
                    {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
                    Find couriers
                </Button>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {rates && rates.length === 0 && (
                <p className="text-xs text-muted-foreground">No courier quoted a pillow to {target.name} today.</p>
            )}

            {rates && rates.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                        Today&apos;s couriers for one pillow to {target.name}, at our cost before markup:
                    </p>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                        {rates.map((r) => {
                            const chosen = r.courier_service_id === value;
                            const days = transit(r);
                            return (
                                <label
                                    key={r.courier_service_id}
                                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 text-sm transition-colors ${
                                        chosen ? "border-primary bg-primary/5" : "border-input hover:bg-accent/50"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="pinned_courier"
                                        value={r.courier_service_id}
                                        checked={chosen}
                                        onChange={() => onChange(r.courier_service_id)}
                                        className="mt-0.5 accent-primary"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words font-medium">{r.courier_name}</span>
                                        {days && <span className="block text-xs text-muted-foreground">{days}</span>}
                                    </span>
                                    <span className="shrink-0 tabular-nums">{formatCurrency(r.total_charge, r.currency)}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                The method is hidden for addresses this courier does not serve.
            </p>
        </div>
    );
}
