"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import { PageActions, pageActionClassName } from "@/components/ui/page-actions";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  READJUSTMENT_POLICY_LIMITS,
  SERVICE_KEYS,
  SERVICE_LABELS,
  isValidReadjustmentFeeCents,
  type ReadjustmentPolicy,
  type ServiceKey,
  type ServicePrices,
} from "@/lib/pricing/service-prices";
import { cn } from "@/lib/utils";

type Initial = { services: ServicePrices; readjustmentPolicy: ReadjustmentPolicy };

/** When each fee is charged — the operator's reminder of what the number does. */
const CHARGED_WHEN: Record<ServiceKey, string> = {
  measurement_premium: "staff measure a Premium Mpillow customer.",
  measurement_basic: "staff measure a Basic Mpillow customer. Mbolster has no measurement fee.",
  readjustment: "a re-adjustment is booked and isn't complimentary.",
};

type Draft = {
  services: Record<ServiceKey, { msrp: string; cost: string }>;
  freeVisits: string;
  freeWindowDays: string;
};

const money = (n: number | null) => (n == null ? "" : n.toFixed(2));

function toDraft(initial: Initial): Draft {
  const services = {} as Draft["services"];
  for (const key of SERVICE_KEYS) {
    services[key] = {
      msrp: money(initial.services[key].msrp),
      cost: money(initial.services[key].costPrice),
    };
  }
  return {
    services,
    freeVisits: String(initial.readjustmentPolicy.freeVisits),
    freeWindowDays: String(initial.readjustmentPolicy.freeWindowDays),
  };
}

/** "50" / "50.5" / "50.50" → 5050 cents; anything else → null. */
function toCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number.parseFloat(trimmed) * 100);
}

function toCount(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n <= max ? n : null;
}

export default function ServiceFeesClient({
  initial,
  loadError,
}: {
  initial: Initial | null;
  loadError: string | null;
}) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;

  const [saved, setSaved] = useState<Draft | null>(initial ? toDraft(initial) : null);
  const [draft, setDraft] = useState<Draft | null>(saved);
  const [saving, setSaving] = useState(false);

  const isDirty = useMemo(
    () => !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  );

  // Field-level validation — the route re-validates, this only keeps Save honest.
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    if (!draft) return out;
    for (const key of SERVICE_KEYS) {
      const msrp = toCents(draft.services[key].msrp);
      if (msrp == null) out[`${key}.msrp`] = "Enter a price, e.g. 50.00";
      else if (key === "readjustment" && !isValidReadjustmentFeeCents(msrp)) {
        out[`${key}.msrp`] = "Enter $0, or $0.50 or more. Card payments can't be smaller.";
      }
      const cost = draft.services[key].cost.trim();
      if (cost !== "" && toCents(cost) == null) out[`${key}.cost`] = "Enter a cost or leave it empty";
    }
    if (toCount(draft.freeVisits, READJUSTMENT_POLICY_LIMITS.freeVisits) == null) {
      out.freeVisits = `Enter 0 to ${READJUSTMENT_POLICY_LIMITS.freeVisits}.`;
    }
    if (toCount(draft.freeWindowDays, READJUSTMENT_POLICY_LIMITS.freeWindowDays) == null) {
      out.freeWindowDays = `Enter 0 to ${READJUSTMENT_POLICY_LIMITS.freeWindowDays} days.`;
    }
    return out;
  }, [draft]);
  const valid = Object.keys(errors).length === 0;

  async function save() {
    if (!draft || !valid || saving) return;
    setSaving(true);
    try {
      const res = await fetch(withLocale("/settings/costings/save", locale), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [],
          services: SERVICE_KEYS.map((key) => ({
            key,
            msrpCents: toCents(draft.services[key].msrp),
            costCents: draft.services[key].cost.trim() === "" ? null : toCents(draft.services[key].cost),
          })),
          readjustmentPolicy: {
            freeVisits: toCount(draft.freeVisits, READJUSTMENT_POLICY_LIMITS.freeVisits),
            freeWindowDays: toCount(draft.freeWindowDays, READJUSTMENT_POLICY_LIMITS.freeWindowDays),
          },
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.services) throw new Error(body?.error ?? "Couldn't save service fees.");
      const next = toDraft({ services: body.services, readjustmentPolicy: body.readjustmentPolicy });
      setSaved(next);
      setDraft(next);
      toast.success("Service fees saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save service fees.");
    } finally {
      setSaving(false);
    }
  }

  const setService = (key: ServiceKey, field: "msrp" | "cost", value: string) =>
    setDraft((d) => (d ? { ...d, services: { ...d.services, [key]: { ...d.services[key], [field]: value } } } : d));

  return (
    <div className={isDirty ? `space-y-6 ${mobileStickyActionBarSpacerClassName}` : "space-y-6"}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1.5">
          <h1>Service fees</h1>
          <InfoTip label="About Service fees">
            What customers pay for measurement and re-adjustment, set like everything else in{" "}
            <Link href={withLocale("/settings/costings", locale)} className="underline underline-offset-4">
              Costings
            </Link>
            . Changes apply from the next quote.
          </InfoTip>
        </div>
        <PageActions>
          <Button
            className={cn(pageActionClassName, "hidden md:inline-flex")}
            onClick={() => void save()}
            disabled={!isDirty || !valid || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </PageActions>
      </div>

      {loadError || !draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Service fees could not be loaded</CardTitle>
            <CardDescription>{loadError ?? "Unknown error"}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Nothing is shown rather than defaults, so a save can never overwrite the real prices. Reload the
            page; if it persists, check that the <code>service_prices</code> migration has been applied.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Services</CardTitle>
                <InfoTip label="About Services">
                  Fees are added to a total automatically. Staff never type them, and customers never choose them in
                  a cart.
                </InfoTip>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {SERVICE_KEYS.map((key) => (
                <div
                  key={key}
                  className="grid gap-3 border-b pb-5 last:border-b-0 last:pb-0 md:grid-cols-[1fr_9rem_9rem] md:items-start"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="font-medium">{SERVICE_LABELS[key]}</div>
                    <InfoTip label={`About ${SERVICE_LABELS[key]}`}>Charged when {CHARGED_WHEN[key]}</InfoTip>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:contents">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${key}-msrp`}>MSRP (SGD)</Label>
                      <Input
                        id={`${key}-msrp`}
                        inputMode="decimal"
                        value={draft.services[key].msrp}
                        onChange={(e) => setService(key, "msrp", e.target.value)}
                        aria-invalid={!!errors[`${key}.msrp`]}
                        className="tabular-nums"
                      />
                      {errors[`${key}.msrp`] ? (
                        <p className="text-xs text-destructive">{errors[`${key}.msrp`]}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${key}-cost`}>Cost (SGD)</Label>
                      <Input
                        id={`${key}-cost`}
                        inputMode="decimal"
                        placeholder="Optional"
                        value={draft.services[key].cost}
                        onChange={(e) => setService(key, "cost", e.target.value)}
                        aria-invalid={!!errors[`${key}.cost`]}
                        className="tabular-nums"
                      />
                      {errors[`${key}.cost`] ? (
                        <p className="text-xs text-destructive">{errors[`${key}.cost`]}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-base">Complimentary re-adjustment</CardTitle>
                <InfoTip label="About Complimentary re-adjustment">
                  Premium Mpillow only. Basic Mpillow and Mbolster always pay the re-adjustment fee. Counted per pillow,
                  from the purchase date, in Singapore calendar days.
                </InfoTip>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <Input
                  id="free-visits"
                  aria-label="Free visits per pillow"
                  inputMode="numeric"
                  className="w-20 tabular-nums"
                  value={draft.freeVisits}
                  onChange={(e) => setDraft((d) => (d ? { ...d, freeVisits: e.target.value } : d))}
                  aria-invalid={!!errors.freeVisits}
                />
                <span>free visit(s) per pillow within</span>
                <Input
                  id="free-window-days"
                  aria-label="Days after purchase"
                  inputMode="numeric"
                  className="w-24 tabular-nums"
                  value={draft.freeWindowDays}
                  onChange={(e) => setDraft((d) => (d ? { ...d, freeWindowDays: e.target.value } : d))}
                  aria-invalid={!!errors.freeWindowDays}
                />
                <span>days of purchase</span>
              </div>
              {errors.freeVisits || errors.freeWindowDays ? (
                <p className="mt-2 text-xs text-destructive">
                  {[errors.freeVisits && `Free visits: ${errors.freeVisits}`, errors.freeWindowDays && `Window: ${errors.freeWindowDays}`]
                    .filter(Boolean)
                    .join(" ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}

      {isDirty ? (
        <MobileStickyActionBar>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Unsaved changes</div>
              <div className="truncate text-xs text-muted-foreground">
                {valid ? "Edits stay in the form until you save." : "Fix the highlighted fields to save."}
              </div>
            </div>
            <Button size="lg" className="shrink-0" onClick={() => void save()} disabled={saving || !valid}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </MobileStickyActionBar>
      ) : null}
    </div>
  );
}
