"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/i18n/currencies";
import type { WelcomeVoucherSummary } from "@/lib/customer-migration/welcome-voucher";
import {
  DEFAULT_VALID_DAYS,
  MAX_VALID_DAYS,
  type WelcomeVoucherIssuing,
  type WelcomeVoucherSettingKey,
  type WelcomeVoucherTerms,
  type WelcomeVoucherType,
} from "@/lib/customer-migration/welcome-voucher-terms";

/** Exactly what `GET /api/settings/discounts/welcome-voucher` returns. */
export type WelcomeVoucherCardData = {
  terms: WelcomeVoucherTerms;
  malformed: WelcomeVoucherSettingKey[];
  issuing: WelcomeVoucherIssuing;
  /** Null when the figures could not be read. */
  summary: WelcomeVoucherSummary | null;
};

const sgd = (v: number) => formatCurrency(v, "SGD");

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Pure — what a Claim made now would do, in a sentence. */
export function welcomeVoucherIssuingText(issuing: WelcomeVoucherIssuing): string {
  if (issuing.issuing) return `Each Claim issues one voucher, until ${formatDay(issuing.until)}.`;
  switch (issuing.reason) {
    case "off":
      return "Issuing is off: a Claim issues no voucher.";
    case "ended":
      return "Issuing has ended: the last day to issue has passed.";
    case "malformed":
      return "A stored term can't be read, so a Claim issues no voucher. Save the terms again.";
    default:
      return "Issuing is on, but the terms are incomplete, so a Claim issues no voucher.";
  }
}

type Form = {
  enabled: boolean;
  type: WelcomeVoucherType | "";
  value: string;
  minOrder: string;
  validDays: string;
  issueUntil: string;
};

const toForm = (t: WelcomeVoucherTerms): Form => ({
  enabled: t.enabled,
  type: t.type ?? "",
  value: t.value == null ? "" : String(t.value),
  minOrder: t.minOrder == null ? "" : String(t.minOrder),
  validDays: String(t.validDays),
  issueUntil: t.issueUntil ?? "",
});

const toNumber = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/**
 * Discounts → Welcome-back voucher (PRD-shopify-customer-migration slice 06):
 * the owner's terms for the voucher a Claim issues (decision 2), and what the
 * vouchers cost. Behind `discounts`, like the rest of this page.
 */
export function WelcomeVoucherSettingsCard({ initialData }: { initialData?: WelcomeVoucherCardData }) {
  const ids = useId();
  const [data, setData] = useState<WelcomeVoucherCardData | null>(initialData ?? null);
  const [form, setForm] = useState<Form | null>(initialData ? toForm(initialData.terms) : null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/discounts/welcome-voucher");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load");
        if (cancelled) return;
        setData(json as WelcomeVoucherCardData);
        setForm(toForm(json.terms));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/discounts/welcome-voucher", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          type: form.type || null,
          value: form.type === "fixed_amount" ? toNumber(form.value) : null,
          minOrder: toNumber(form.minOrder),
          validDays: Number(form.validDays || DEFAULT_VALID_DAYS),
          issueUntil: form.issueUntil || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to save");
      setData((d) => (d ? { ...d, terms: json.terms, malformed: json.malformed, issuing: json.issuing } : d));
      setForm(toForm(json.terms));
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Gift className="h-4 w-4" />
          Welcome-back voucher
          <InfoTip label="About the welcome-back voucher">
            <p>
              Each Customer imported from Shopify is issued one voucher the first time they sign in (their
              Claim). It is bound to their account, so a forwarded code is refused at checkout. It applies to
              shop orders, not to custom builds.
            </p>
            <p>
              These terms apply to Claims from now on. A voucher already issued keeps its own. A Claim happens
              once: someone who signs in while issuing is off is never issued one later.
            </p>
            <p>Each voucher is listed under Discounts when account-bound vouchers are shown.</p>
          </InfoTip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!data || !form ? (
          loadError ? (
            <p className="text-sm text-destructive">Could not load the voucher terms: {loadError}</p>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )
        ) : (
          <>
            <p className="text-sm" role="status">
              {welcomeVoucherIssuingText(data.issuing)}
            </p>

            {data.summary ? <CostFigures summary={data.summary} /> : (
              <p className="text-sm text-muted-foreground">Could not load what the vouchers cost.</p>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${ids}-enabled`}>Issue a voucher at each Claim</Label>
                <Switch
                  id={`${ids}-enabled`}
                  checked={form.enabled}
                  onCheckedChange={(v) => set("enabled", v)}
                  disabled={saving}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-type`}>Type</Label>
                  <Select value={form.type} onValueChange={(v) => set("type", v as WelcomeVoucherType)}>
                    <SelectTrigger id={`${ids}-type`} className="w-full">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_amount">Fixed amount off</SelectItem>
                      <SelectItem value="free_shipping">Free shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.type === "fixed_amount" && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`${ids}-value`}>Value (SGD off)</Label>
                    <Input
                      id={`${ids}-value`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={form.value}
                      onChange={(e) => set("value", e.target.value)}
                      disabled={saving}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-min`}>Minimum spend (SGD)</Label>
                  <Input
                    id={`${ids}-min`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="None"
                    value={form.minOrder}
                    onChange={(e) => set("minOrder", e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Above the value, so the voucher cannot zero out a small accessory.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-days`}>Valid for (days after the Claim)</Label>
                  <Input
                    id={`${ids}-days`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_VALID_DAYS}
                    step={1}
                    value={form.validDays}
                    onChange={(e) => set("validDays", e.target.value)}
                    disabled={saving}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${ids}-until`}>Last day to issue (Singapore)</Label>
                  <Input
                    id={`${ids}-until`}
                    type="date"
                    value={form.issueUntil}
                    onChange={(e) => set("issueUntil", e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Claims after this day issue nothing, which caps the liability.
                  </p>
                </div>
              </div>

              <Button type="button" onClick={() => void save()} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save terms
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Live liability beside the realised cost. */
function CostFigures({ summary }: { summary: WelcomeVoucherSummary }) {
  const n = (v: number) => v.toLocaleString("en-SG");
  const cells = [
    {
      label: "Live liability",
      value: sgd(summary.valueOutstanding),
      detail: `${n(summary.outstanding)} issued, unused and still valid`,
    },
    {
      label: "Realised cost",
      value: sgd(summary.valueRedeemed),
      detail: `${n(summary.redeemed)} redeemed`,
    },
    {
      label: "Issued",
      value: n(summary.issued),
      detail: `${sgd(summary.valueIssued)} at face value · ${n(summary.expired)} expired unused`,
    },
  ];
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{cell.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{cell.value}</dd>
            <dd className="text-xs text-muted-foreground">{cell.detail}</dd>
          </div>
        ))}
      </dl>
      {summary.freeShipping > 0 && (
        <p className="text-xs text-muted-foreground">
          {n(summary.freeShipping)} free-shipping voucher{summary.freeShipping === 1 ? " is" : "s are"} counted
          but not valued: an order does not record the shipping it waives.
        </p>
      )}
    </div>
  );
}
