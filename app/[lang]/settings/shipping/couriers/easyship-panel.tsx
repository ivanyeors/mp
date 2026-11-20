"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Loader2, PackageSearch, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/i18n/currencies";
import type { CourierRate, PackageType, ShippingSettings } from "@/lib/shipping/types";
import { InfoTip } from "@/components/ui/info-tip";
import { COUNTRIES, findCountry, usesPostalCode } from "@/lib/shipping/countries";

type EasyshipStatus = {
    tokenConfigured: boolean;
    environment: "sandbox" | "production" | null;
    webhookSecretConfigured: boolean;
    webhookUrl: string;
    hasSender: boolean;
    missingOrigin: string[];
};

type SettingsPayload = { ok: true; settings: ShippingSettings; easyship: EasyshipStatus };

type FormState = {
    incoterms: "DDU" | "DDP";
    insure_shipments: boolean;
    hs_code: string;
    item_category: string;
    handling_days: string;
    quote_ttl_minutes: string;
    estimate_declared_value: string;
};

type TestResult =
    | {
          ok: true;
          rates: CourierRate[];
          methods: Array<{
              method_id: string;
              slug: string;
              rate_source: string;
              available: boolean;
              price: number | null;
              courier: string | null;
              carrier_cost: number | null;
          }>;
      }
    | { ok: false; error: string };

function toForm(s: ShippingSettings): FormState {
    return {
        incoterms: s.incoterms,
        insure_shipments: s.insure_shipments,
        hs_code: s.hs_code,
        item_category: s.item_category,
        handling_days: String(s.handling_days),
        quote_ttl_minutes: String(s.quote_ttl_minutes),
        estimate_declared_value: String(s.estimate_declared_value),
    };
}

function toPayload(f: FormState) {
    const num = (v: string) => Number(v);
    return {
        incoterms: f.incoterms,
        insure_shipments: f.insure_shipments,
        hs_code: f.hs_code.trim(),
        item_category: f.item_category.trim(),
        handling_days: Math.round(num(f.handling_days)),
        quote_ttl_minutes: Math.round(num(f.quote_ttl_minutes)),
        estimate_declared_value: num(f.estimate_declared_value),
    };
}

export function apiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string") return error;
    const e = error as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | null;
    const field = Object.entries(e?.fieldErrors ?? {}).find(([, v]) => v && v.length > 0);
    if (field) return `${field[0].replace(/_/g, " ")}: ${field[1]![0]}`;
    return e?.formErrors?.[0] ?? fallback;
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: ReactNode }) {
    return (
        <div className="flex items-start gap-2 text-sm">
            {ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
                <p className="font-medium">{label}</p>
                {detail && <div className="text-xs text-muted-foreground break-words">{detail}</div>}
            </div>
        </div>
    );
}

export function EasyshipPanel({ onShowAddresses }: { onShowAddresses: () => void }) {
    const [status, setStatus] = useState<EasyshipStatus | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const [testCountry, setTestCountry] = useState("SG");
    const [testPostal, setTestPostal] = useState("");
    const [testProfile, setTestProfile] = useState<PackageType>("pillow");
    const [testQty, setTestQty] = useState("1");
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult | null>(null);

    const apply = useCallback((payload: SettingsPayload) => {
        setStatus(payload.easyship);
        setForm(toForm(payload.settings));
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/shop/shipping/settings")
            .then(async (res) => {
                const json = await res.json().catch(() => null);
                if (cancelled) return;
                if (!res.ok || !json?.ok) {
                    setLoadError(apiErrorMessage(json?.error, "Couldn't load shipping settings."));
                    return;
                }
                apply(json as SettingsPayload);
            })
            .catch(() => !cancelled && setLoadError("Couldn't reach the server. Reload the page."));
        return () => {
            cancelled = true;
        };
    }, [apply]);

    if (loadError) {
        return (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loadError}
            </div>
        );
    }
    if (!form || !status) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch("/api/shop/shipping/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toPayload(form)),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                toast.error(apiErrorMessage(json?.error, "Couldn't save shipping settings."));
                return;
            }
            apply(json as SettingsPayload);
            toast.success("Shipping settings saved");
        } catch {
            toast.error("Couldn't reach the server. Try again.");
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch("/api/shop/shipping/settings/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    destination: { country: testCountry, postal_code: testPostal.trim() },
                    profile: testProfile,
                    quantity: Math.max(1, Math.min(10, Number(testQty) || 1)),
                    settings: toPayload(form),
                }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) {
                setTestResult({ ok: false, error: apiErrorMessage(json?.error, "Couldn't get a test quote.") });
                return;
            }
            setTestResult(json as TestResult);
        } catch {
            setTestResult({ ok: false, error: "Couldn't reach the server. Try again." });
        } finally {
            setTesting(false);
        }
    };

    const copy = (value: string, what: string) => {
        navigator.clipboard?.writeText(value).then(
            () => toast.success(`${what} copied`),
            () => toast.error("Couldn't copy."),
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        Courier connection
                        <InfoTip label="About courier connection">
                            Live courier rates at checkout and one-click labels from each order. The API token and
                            webhook secret are environment variables; they are never stored in the database.
                        </InfoTip>
                        {status.environment && (
                            <Badge variant={status.environment === "production" ? "default" : "secondary"}>
                                {status.environment === "production" ? "Production" : "Sandbox"}
                            </Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <StatusRow
                            ok={status.tokenConfigured}
                            label="API token"
                            detail={
                                status.tokenConfigured
                                    ? "EASYSHIP_API_TOKEN is set."
                                    : "Set EASYSHIP_API_TOKEN (in your Easyship dashboard: Connect → API Integrations), then redeploy."
                            }
                        />
                        <StatusRow
                            ok={status.webhookSecretConfigured}
                            label="Tracking webhooks"
                            detail={
                                <>
                                    {status.webhookSecretConfigured
                                        ? "EASYSHIP_WEBHOOK_SECRET is set."
                                        : "Set EASYSHIP_WEBHOOK_SECRET to receive label and delivery updates."}{" "}
                                    <button
                                        type="button"
                                        onClick={() => copy(status.webhookUrl, "Webhook URL")}
                                        className="inline-flex items-center gap-1 text-primary hover:underline active:opacity-60"
                                    >
                                        {status.webhookUrl}
                                        <Copy className="h-3 w-3" />
                                    </button>
                                </>
                            }
                        />
                        <StatusRow
                            ok={status.hasSender && status.missingOrigin.length === 0}
                            label={status.hasSender ? "Sender address" : "No default sender address"}
                            detail={
                                <>
                                    {status.hasSender
                                        ? status.missingOrigin.length === 0
                                            ? "Quotes and labels ship from the default sender address."
                                            : `Missing: ${status.missingOrigin.join(", ")}.`
                                        : "Live methods are not quoted until one is set."}{" "}
                                    <button
                                        type="button"
                                        onClick={onShowAddresses}
                                        className="text-primary hover:underline active:opacity-60"
                                    >
                                        Open Addresses
                                    </button>
                                </>
                            }
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-1.5">
                        <CardTitle className="text-base">Customs &amp; quotes</CardTitle>
                        <InfoTip label="About customs & quotes">How cross-border parcels are declared and how quotes are shown.</InfoTip>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Duties &amp; taxes (incoterms)</Label>
                        <Select value={form.incoterms} onValueChange={(v) => setField("incoterms", v as "DDU" | "DDP")}>
                            <SelectTrigger className="w-full min-w-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DDU">DDU: receiver pays on delivery</SelectItem>
                                <SelectItem value="DDP">DDP: included in the shipping rate</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 sm:mt-6">
                        <Label htmlFor="insure_shipments" className="cursor-pointer font-medium max-md:-my-3 max-md:min-h-11 max-md:flex-1 max-md:active:opacity-60">
                            Insure shipments
                        </Label>
                        <Switch
                            id="insure_shipments"
                            checked={form.insure_shipments}
                            onCheckedChange={(v) => setField("insure_shipments", v)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="hs_code">HS code</Label>
                        <Input
                            id="hs_code"
                            value={form.hs_code}
                            onChange={(e) => setField("hs_code", e.target.value.replace(/\D/g, ""))}
                            className="text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">9404.90 covers pillows and cushions.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="item_category">Courier item category</Label>
                        <Input
                            id="item_category"
                            value={form.item_category}
                            onChange={(e) => setField("item_category", e.target.value)}
                            className="text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Used only when the HS code is empty.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="handling_days">Handling days</Label>
                        <Input
                            id="handling_days"
                            type="number"
                            min="0"
                            max="30"
                            value={form.handling_days}
                            onChange={(e) => setField("handling_days", e.target.value)}
                            className="text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Added to courier transit times shown to shoppers (packing, customisation).
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="quote_ttl_minutes">Quote valid for (minutes)</Label>
                        <Input
                            id="quote_ttl_minutes"
                            type="number"
                            min="5"
                            max="1440"
                            value={form.quote_ttl_minutes}
                            onChange={(e) => setField("quote_ttl_minutes", e.target.value)}
                            className="text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            A shopper who pays within this window is charged exactly the rate they saw.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="estimate_declared_value">Estimator item value (SGD)</Label>
                        <Input
                            id="estimate_declared_value"
                            type="number"
                            min="1"
                            step="1"
                            value={form.estimate_declared_value}
                            onChange={(e) => setField("estimate_declared_value", e.target.value)}
                            className="text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Declared value for delivery estimates made without a cart.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {saving ? "Saving…" : "Save connection settings"}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-1.5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <PackageSearch className="h-4 w-4" />
                            Test a quote
                        </CardTitle>
                        <InfoTip label="About testing a quote">
                            Today&apos;s courier rates for a sample parcel, using the settings above (saved or not) and the saved boxes.
                            Copy a courier service id to pin it on a method.
                        </InfoTip>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div className="space-y-1.5">
                            <Label>Country</Label>
                            <Select value={testCountry} onValueChange={setTestCountry}>
                                <SelectTrigger className="w-full min-w-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {COUNTRIES.map((c) => (
                                        <SelectItem key={c.code} value={c.code}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="test-postal">Postal code</Label>
                            <Input
                                id="test-postal"
                                value={testPostal}
                                onChange={(e) => setTestPostal(e.target.value)}
                                placeholder={findCountry(testCountry)?.postal ?? "Not used there"}
                                className="text-base md:text-sm"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Product</Label>
                            <Select value={testProfile} onValueChange={(v) => setTestProfile(v as PackageType)}>
                                <SelectTrigger className="w-full min-w-0">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pillow">Pillow</SelectItem>
                                    <SelectItem value="bolster">Bolster</SelectItem>
                                    <SelectItem value="accessory">Accessory</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="test-qty">Quantity</Label>
                            <Input
                                id="test-qty"
                                type="number"
                                min="1"
                                max="10"
                                value={testQty}
                                onChange={(e) => setTestQty(e.target.value)}
                                className="text-base md:text-sm"
                            />
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={handleTest}
                        disabled={
                            testing || !status.tokenConfigured || (usesPostalCode(testCountry) && testPostal.trim().length < 2)
                        }
                    >
                        {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Get live rates
                    </Button>

                    {testResult && !testResult.ok && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {testResult.error}
                        </div>
                    )}

                    {testResult?.ok && (
                        <div className="space-y-4">
                            {testResult.rates.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No couriers quoted for this destination and parcel.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2 font-medium">Courier</th>
                                                <th className="px-3 py-2 font-medium">Cost to us</th>
                                                <th className="px-3 py-2 font-medium">Transit</th>
                                                <th className="px-3 py-2 font-medium">Service id</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {testResult.rates.map((r) => (
                                                <tr key={r.courier_service_id}>
                                                    <td className="px-3 py-2">
                                                        <p className="font-medium">{r.courier_name}</p>
                                                        {r.umbrella_name && (
                                                            <p className="text-xs text-muted-foreground">{r.umbrella_name}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {formatCurrency(r.total_charge, r.currency)}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {r.min_days != null ? `${r.min_days} to ${r.max_days ?? r.min_days} days` : "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => copy(r.courier_service_id, "Service id")}
                                                            className="inline-flex max-w-[14rem] items-center gap-1 truncate text-xs text-primary hover:underline"
                                                        >
                                                            <span className="truncate">{r.courier_service_id}</span>
                                                            <Copy className="h-3 w-3 shrink-0" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {testResult.methods.length > 0 && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        What shoppers would be charged (before free-shipping thresholds)
                                    </p>
                                    <ul className="space-y-1 text-sm">
                                        {testResult.methods.map((m) => (
                                            <li key={m.method_id} className="flex flex-wrap justify-between gap-2">
                                                <span className="text-xs">{m.slug}</span>
                                                <span>
                                                    {!m.available
                                                        ? "Not offered: no matching courier"
                                                        : m.price == null
                                                          ? "—"
                                                          : `${formatCurrency(m.price, "SGD")}${
                                                                m.courier ? ` via ${m.courier}` : " (flat)"
                                                            }${
                                                                m.carrier_cost != null
                                                                    ? `, costs us ${formatCurrency(m.carrier_cost, "SGD")}`
                                                                    : ""
                                                            }`}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
