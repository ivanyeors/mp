"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PointsSummary } from "@/lib/points/server";
import type { PointsSettings } from "@/lib/points/settings";
import { formatPoints } from "@/lib/points/value";

/** "2026-11-01T00:00" in Singapore, for a datetime-local input. */
function toSgInput(iso: string | null): string {
    if (!iso) return "";
    const sg = new Date(Date.parse(iso) + 8 * 60 * 60 * 1000);
    return sg.toISOString().slice(0, 16);
}

/** The input's Singapore wall time as an ISO timestamp. */
function fromSgInput(value: string): string | null {
    return value ? new Date(`${value}:00+08:00`).toISOString() : null;
}

function NumberField({
    id,
    label,
    hint,
    value,
    onChange,
    step = 1,
}: {
    id: string;
    label: string;
    hint?: string;
    value: number;
    onChange: (n: number) => void;
    step?: number;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} type="number" step={step} min={0} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} />
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

/**
 * Discounts → Points (PRD-loyalty-points slice 02; ADR 0030): the programme's
 * settings and what it costs now. 100 points = S$1 is fixed in code. Turning
 * points on needs a launch date; only Orders paid from then earn.
 */
export function PointsSettingsCard() {
    const [settings, setSettings] = useState<PointsSettings | null>(null);
    const [summary, setSummary] = useState<PointsSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let live = true;
        fetch("/api/settings/discounts/points")
            .then((r) => r.json())
            .then((json) => {
                if (!live) return;
                if (json?.ok) {
                    setSettings(json.settings as PointsSettings);
                    setSummary(json.summary as PointsSummary);
                } else setError(json?.error ?? "Could not load the points settings.");
            })
            .catch(() => live && setError("Could not load the points settings."));
        return () => {
            live = false;
        };
    }, []);

    const set = <K extends keyof PointsSettings>(k: K, v: PointsSettings[K]) => setSettings((s) => (s ? { ...s, [k]: v } : s));

    const save = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            const res = await fetch("/api/settings/discounts/points", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                toast.error(json?.error ?? "Could not save the points settings.");
                return;
            }
            setSettings(json.settings as PointsSettings);
            toast.success("Points settings saved.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Coins className="h-4 w-4" />
                        Points
                    </CardTitle>
                    <InfoTip label="About points">
                        <p>
                            Customers earn points on what they pay and spend them as money off a shop order. 100 points
                            are S$1, always. Custom pillows earn points but can&apos;t take them, and points used are
                            never refunded.
                        </p>
                        <p>Partners neither earn nor spend points: they have their own milestone tiers.</p>
                    </InfoTip>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                {!settings ? (
                    !error ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null
                ) : (
                    <>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <Label htmlFor="points-enabled">Points are on</Label>
                                <p className="text-xs text-muted-foreground">
                                    Off: customers see nothing, and no order earns or spends.
                                </p>
                            </div>
                            <Switch id="points-enabled" checked={settings.enabled} onCheckedChange={(v) => set("enabled", v)} />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="points-launch">Launch (Singapore time)</Label>
                                <Input
                                    id="points-launch"
                                    type="datetime-local"
                                    value={toSgInput(settings.launchAt)}
                                    onChange={(e) => set("launchAt", fromSgInput(e.target.value))}
                                />
                                <p className="text-xs text-muted-foreground">Only orders paid from then earn points.</p>
                            </div>
                            <NumberField
                                id="points-earn"
                                label="Points per S$1 paid"
                                hint={`${settings.earnPerDollar} points per S$1 is ${settings.earnPerDollar}% back.`}
                                value={settings.earnPerDollar}
                                onChange={(n) => set("earnPerDollar", n)}
                                step={0.5}
                            />
                            <NumberField
                                id="points-min"
                                label="Fewest points used at once"
                                hint={formatPoints(settings.minRedeem)}
                                value={settings.minRedeem}
                                onChange={(n) => set("minRedeem", n)}
                                step={100}
                            />
                            <NumberField
                                id="points-share"
                                label="Most of the products' price paid in points (%)"
                                value={Math.round(settings.maxShare * 100)}
                                onChange={(n) => set("maxShare", n / 100)}
                                step={5}
                            />
                            <NumberField
                                id="points-expiry"
                                label="Points expire after (months without a purchase)"
                                value={settings.expiryMonths}
                                onChange={(n) => set("expiryMonths", n)}
                            />
                            <NumberField
                                id="points-bonus"
                                label="Claim bonus (points)"
                                hint={`${formatPoints(settings.claimBonus)}, once, for an imported customer who signs in.`}
                                value={settings.claimBonus}
                                onChange={(n) => set("claimBonus", n)}
                                step={100}
                            />
                            <NumberField
                                id="points-bonus-months"
                                label="Claim bonus window (months after our first email)"
                                value={settings.claimBonusMonths}
                                onChange={(n) => set("claimBonusMonths", n)}
                            />
                        </div>

                        <Button onClick={save} disabled={saving}>
                            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                            Save
                        </Button>
                    </>
                )}

                {summary ? (
                    <div className="space-y-1 border-t pt-4 text-sm">
                        <p className="font-medium">What points cost</p>
                        <p>Held by customers: {formatPoints(summary.outstanding)}</p>
                        <p>Pending, still in a return window: {formatPoints(summary.pending)}</p>
                        <p>
                            Used: {formatPoints(summary.spent)} ({formatPoints(summary.spentThisMonth)} this month)
                        </p>
                        <p>
                            Expired: {formatPoints(summary.expired)} ({formatPoints(summary.expiredThisMonth)} this month)
                        </p>
                        <p>
                            Taken back on refunds: {formatPoints(summary.clawedBack)} ({formatPoints(summary.clawedBackThisMonth)} this month)
                        </p>
                        <p>Claim bonuses given: {summary.claimBonuses.toLocaleString("en-SG")}</p>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
