"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, Loader2, PackageSearch, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type EasyshipStatus = {
    tokenConfigured: boolean;
    environment: "sandbox" | "production" | null;
    webhookSecretConfigured: boolean;
    webhookUrl: string;
    missingOrigin: string[];
};

type SettingsPayload = { ok: true; settings: ShippingSettings; easyship: EasyshipStatus };

/** Number inputs are edited as strings so a half-typed value is not coerced to 0. */
type PackageForm = Record<"length_cm" | "width_cm" | "height_cm" | "weight_grams", string>;

type FormState = {
    easyship_enabled: boolean;
    origin: Record<OriginField, string>;
    packages: Record<PackageType, PackageForm>;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ORIGIN_FIELDS = [
    { key: "contact_name", label: "Contact name", required: true },
    { key: "company_name", label: "Company", required: false },
    { key: "contact_phone", label: "Phone", required: true },
    { key: "contact_email", label: "Email", required: true },
    { key: "line_1", label: "Address line 1", required: true },
    { key: "line_2", label: "Address line 2", required: false },
    { key: "city", label: "City", required: true },
    { key: "state", label: "State / region", required: false },
    { key: "postal_code", label: "Postal code", required: true },
    { key: "country_alpha2", label: "Country (ISO code)", required: true },
] as const;

type OriginField = (typeof ORIGIN_FIELDS)[number]["key"];

const PACKAGE_LABELS: Record<PackageType, { title: string; hint: string }> = {
    pillow: { title: "Pillow", hint: "One box per pillow (bundles box as a pillow)" },
    bolster: { title: "Bolster", hint: "One box per bolster" },
    accessory: { title: "Accessories", hint: "Ride in the first box, or share this one" },
};

const TEST_COUNTRIES = ["SG", "MY", "ID", "TH", "PH", "BN", "VN", "HK", "AU"];

/** Most couriers bill the larger of actual and volumetric weight (L × W × H ÷ 5000). */
const VOLUMETRIC_DIVISOR = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toForm(s: ShippingSettings): FormState {
    const origin = Object.fromEntries(
        ORIGIN_FIELDS.map((f) => [f.key, String(s.origin_address[f.key] ?? "")]),
    ) as Record<OriginField, string>;
    if (!origin.country_alpha2) origin.country_alpha2 = "SG";
    const pkg = (p: ShippingSettings["packages"][PackageType]): PackageForm => ({
        length_cm: String(p.length_cm),
        width_cm: String(p.width_cm),
        height_cm: String(p.height_cm),
        weight_grams: String(p.weight_grams),
    });
    return {
        easyship_enabled: s.easyship_enabled,
        origin,
        packages: { pillow: pkg(s.packages.pillow), bolster: pkg(s.packages.bolster), accessory: pkg(s.packages.accessory) },
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
    const pkg = (p: PackageForm) => ({
        length_cm: num(p.length_cm),
        width_cm: num(p.width_cm),
        height_cm: num(p.height_cm),
        weight_grams: Math.round(num(p.weight_grams)),
    });
    const origin = Object.fromEntries(
        Object.entries(f.origin)
            .map(([k, v]) => [k, v.trim()])
            .filter(([k, v]) => v !== "" || ORIGIN_FIELDS.find((o) => o.key === k)?.required),
    );
    return {
        easyship_enabled: f.easyship_enabled,
        origin_address: origin,
        packages: { pillow: pkg(f.packages.pillow), bolster: pkg(f.packages.bolster), accessory: pkg(f.packages.accessory) },
        incoterms: f.incoterms,
        insure_shipments: f.insure_shipments,
        hs_code: f.hs_code.trim(),
        item_category: f.item_category.trim(),
        handling_days: Math.round(num(f.handling_days)),
        quote_ttl_minutes: Math.round(num(f.quote_ttl_minutes)),
        estimate_declared_value: num(f.estimate_declared_value),
    };
}

/** A zod `flatten()` body, or a plain string, as one line for a person. */
export function apiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string") return error;
    const e = error as { formErrors?: string[]; fieldErrors?: Record<string, string[] | undefined> } | null;
    const field = Object.entries(e?.fieldErrors ?? {}).find(([, v]) => v && v.length > 0);
    if (field) return `${field[0].replace(/_/g, " ")}: ${field[1]![0]}`;
    return e?.formErrors?.[0] ?? fallback;
}

function volumetricKg(p: PackageForm): number | null {
    const v = (Number(p.length_cm) * Number(p.width_cm) * Number(p.height_cm)) / VOLUMETRIC_DIVISOR;
    return Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function EasyshipPanel() {
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
                    setLoadError(apiErrorMessage(json?.error, "Could not load shipping settings."));
                    return;
                }
                apply(json as SettingsPayload);
            })
            .catch(() => !cancelled && setLoadError("Network error. Please reload."));
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

    const setOrigin = (key: OriginField, value: string) =>
        setForm((prev) => (prev ? { ...prev, origin: { ...prev.origin, [key]: value } } : prev));
    const setPackage = (type: PackageType, key: keyof PackageForm, value: string) =>
        setForm((prev) =>
            prev
                ? { ...prev, packages: { ...prev.packages, [type]: { ...prev.packages[type], [key]: value } } }
                : prev,
        );
    const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

    const missingOrigin = ORIGIN_FIELDS.filter((f) => f.required && !form.origin[f.key].trim()).map((f) => f.label);
    const canEnable = status.tokenConfigured && missingOrigin.length === 0;

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
                toast.error(apiErrorMessage(json?.error, "Could not save shipping settings."));
                return;
            }
            apply(json as SettingsPayload);
            toast.success("Shipping settings saved");
        } catch {
            toast.error("Network error. Please try again.");
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
                setTestResult({ ok: false, error: apiErrorMessage(json?.error, "The test quote failed.") });
                return;
            }
            setTestResult(json as TestResult);
        } catch {
            setTestResult({ ok: false, error: "Network error. Please try again." });
        } finally {
            setTesting(false);
        }
    };

    const copy = (value: string, what: string) => {
        navigator.clipboard?.writeText(value).then(
            () => toast.success(`${what} copied`),
            () => toast.error("Could not copy"),
        );
    };

    return (
        <div className="space-y-6">
            {/* Connection */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        Courier connection
                        {status.environment && (
                            <Badge variant={status.environment === "production" ? "default" : "secondary"}>
                                {status.environment === "production" ? "Production" : "Sandbox"}
                            </Badge>
                        )}
                    </CardTitle>
                    <CardDescription>
                        Live courier rates at checkout and one-click labels from each order. The API token and
                        webhook secret are environment variables; they are never stored in the database.
                    </CardDescription>
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
                                        className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                                    >
                                        {status.webhookUrl}
                                        <Copy className="h-3 w-3" />
                                    </button>
                                </>
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
                        <div className="space-y-0.5">
                            <Label htmlFor="easyship_enabled" className="font-medium">
                                Live rates for shoppers
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {canEnable || form.easyship_enabled
                                    ? "Methods set to “Live courier rate” quote the courier price for each cart and address. Off: they charge their fallback rate."
                                    : !status.tokenConfigured
                                      ? "Connect the courier account first (API token)."
                                      : `Complete the ship-from address first: ${missingOrigin.join(", ")}.`}
                            </p>
                        </div>
                        <Switch
                            id="easyship_enabled"
                            checked={form.easyship_enabled}
                            disabled={!canEnable && !form.easyship_enabled}
                            onCheckedChange={(v) => setField("easyship_enabled", v)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Ship-from */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ship-from address</CardTitle>
                    <CardDescription>Where couriers collect parcels. Used for every quote and label.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {ORIGIN_FIELDS.map((f) => (
                            <div key={f.key} className="space-y-1.5">
                                <Label htmlFor={`origin-${f.key}`}>
                                    {f.label}
                                    {f.required && <span className="text-destructive"> *</span>}
                                </Label>
                                <Input
                                    id={`origin-${f.key}`}
                                    value={form.origin[f.key]}
                                    onChange={(e) =>
                                        setOrigin(
                                            f.key,
                                            f.key === "country_alpha2" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value,
                                        )
                                    }
                                    className="text-base md:text-sm"
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Packaging */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Packaging</CardTitle>
                    <CardDescription>
                        Box size and packed weight per product type. A variant&apos;s own weight wins over the box
                        weight. Couriers bill the larger of actual and volumetric weight, so measure the real box.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {(Object.keys(PACKAGE_LABELS) as PackageType[]).map((type) => {
                        const p = form.packages[type];
                        const vol = volumetricKg(p);
                        const actual = Number(p.weight_grams) / 1000;
                        return (
                            <div key={type} className="rounded-lg border p-4">
                                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium">{PACKAGE_LABELS[type].title}</p>
                                        <p className="text-xs text-muted-foreground">{PACKAGE_LABELS[type].hint}</p>
                                    </div>
                                    {vol != null && (
                                        <p className="text-xs text-muted-foreground">
                                            Billed as ≈{" "}
                                            <span className="font-medium text-foreground">
                                                {Math.max(vol, Number.isFinite(actual) ? actual : 0).toFixed(1)} kg
                                            </span>{" "}
                                            ({vol.toFixed(1)} kg volumetric)
                                        </p>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {(
                                        [
                                            ["length_cm", "Length (cm)"],
                                            ["width_cm", "Width (cm)"],
                                            ["height_cm", "Height (cm)"],
                                            ["weight_grams", "Weight (g)"],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <div key={key} className="space-y-1.5">
                                            <Label htmlFor={`pkg-${type}-${key}`} className="text-xs">
                                                {label}
                                            </Label>
                                            <Input
                                                id={`pkg-${type}-${key}`}
                                                type="number"
                                                min="1"
                                                step={key === "weight_grams" ? "10" : "0.5"}
                                                value={p[key]}
                                                onChange={(e) => setPackage(type, key, e.target.value)}
                                                className="text-base md:text-sm"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            {/* Customs & quotes */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Customs &amp; quotes</CardTitle>
                    <CardDescription>How cross-border parcels are declared and how quotes are shown.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label>Duties &amp; taxes (incoterms)</Label>
                        <Select value={form.incoterms} onValueChange={(v) => setField("incoterms", v as "DDU" | "DDP")}>
                            <SelectTrigger className="w-full min-w-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DDU">DDU — receiver pays on delivery</SelectItem>
                                <SelectItem value="DDP">DDP — included in the shipping rate</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3 sm:mt-6">
                        <Label htmlFor="insure_shipments" className="font-medium">
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
                            className="font-mono text-base md:text-sm"
                        />
                        <p className="text-xs text-muted-foreground">9404.90 covers pillows and cushions.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="item_category">Courier item category</Label>
                        <Input
                            id="item_category"
                            value={form.item_category}
                            onChange={(e) => setField("item_category", e.target.value)}
                            className="font-mono text-base md:text-sm"
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

            {/* Test a quote */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <PackageSearch className="h-4 w-4" />
                        Test a quote
                    </CardTitle>
                    <CardDescription>
                        Today&apos;s courier rates for a sample parcel, using the settings above (saved or not).
                        Copy a courier service id to pin it on a method.
                    </CardDescription>
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
                                    {TEST_COUNTRIES.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {c}
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
                                placeholder="e.g. 018989"
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
                        disabled={testing || !status.tokenConfigured || testPostal.trim().length < 2}
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
                                                        {r.min_days != null ? `${r.min_days}–${r.max_days ?? r.min_days} days` : "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => copy(r.courier_service_id, "Service id")}
                                                            className="inline-flex max-w-[14rem] items-center gap-1 truncate font-mono text-xs text-primary hover:underline"
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
                                                <span className="font-mono text-xs">{m.slug}</span>
                                                <span>
                                                    {!m.available
                                                        ? "Not offered — no matching courier"
                                                        : m.price == null
                                                          ? "—"
                                                          : `${formatCurrency(m.price, "SGD")}${
                                                                m.courier ? ` via ${m.courier}` : " (flat)"
                                                            }${
                                                                m.carrier_cost != null
                                                                    ? ` · costs us ${formatCurrency(m.carrier_cost, "SGD")}`
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
