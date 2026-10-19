"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { displayHeight, normalizeHeightDraft, type HeightUnit } from "@/lib/configurator/height-draft";
import { soleCaseId } from "@/lib/configurator/preference-policy";
import type { PairedMbolsterDraft } from "@/lib/configurator/paired-mbolster";
import { isBolsterLength } from "@/lib/results/composed-sellable";
import type { ComponentOption } from "@/lib/types/customization";

/** "1 Mpillow · 2 Mbolster (optional)" — where a Paired build's shopper is. */
export function PairedStepper({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Mpillow" },
    { n: 2, label: "Mbolster", note: "optional" },
  ] as const;
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Your order">
      {steps.map((s, i) => {
        const current = s.n === step;
        const done = s.n < step;
        return (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="h-px w-6 bg-border" /> : null}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                current && "border-primary bg-primary text-primary-foreground",
                done && "border-primary text-primary",
              )}
            >
              {done ? <Check className="size-3.5" /> : s.n}
            </span>
            <span className={cn(current ? "font-medium" : "text-muted-foreground")}>
              {s.label}
              {"note" in s ? <span className="text-muted-foreground"> ({s.note})</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Step 2 of a Paired build (ADR 0026): the one thing the Mbolster flow needs that
 * the pillow did not — height — then its recommended length, price and case.
 * The configurator owns the actions (Back, Skip, Add) in its own action bar.
 */
export function PairedMbolsterStep({
  draft,
  onDraftChange,
  reason,
  sleepPosition,
  currency,
}: {
  draft: PairedMbolsterDraft;
  onDraftChange: (update: (d: PairedMbolsterDraft) => PairedMbolsterDraft) => void;
  /** The fired route's reason, from the Rule graph. */
  reason: string;
  /** The pillow's answer, carried over rather than asked again. */
  sleepPosition: string;
  currency: string;
}) {
  const [heightUnit, setHeightUnit] = useState<HeightUnit>("in");
  const [heightDraft, setHeightDraft] = useState(() =>
    draft.heightCm ? displayHeight("in", draft.heightCm) : "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommend = async (heightCm: string) => {
    if (heightCm === draft.heightCm && draft.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "ballpark",
          bolster_preferences: { height_cm: Number(heightCm), sleep_position: sleepPosition },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getApiErrorMessage(data.error, "Could not size your Mbolster"));
      const length = String(data.bolster_variant ?? "");
      const cases = (data.components?.cases ?? []) as ComponentOption[];
      onDraftChange((d) => ({
        ...d,
        heightCm,
        length: isBolsterLength(length) ? length : null,
        price: data.variant?.price ?? null,
        cases,
        // Keep the shopper's pick while it is still cut for this length.
        caseId: cases.some((c) => c.item_id === d.caseId) ? d.caseId : soleCaseId(cases),
        recommendationRecord: data.recommendation_record ?? null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not size your Mbolster");
    } finally {
      setLoading(false);
    }
  };

  const commitHeight = () => {
    const heightCm = normalizeHeightDraft(heightUnit, heightDraft);
    if (heightCm === null) {
      if (heightDraft.trim()) setError("Enter your height to size the Mbolster.");
      return;
    }
    setHeightDraft(displayHeight(heightUnit, heightCm));
    void recommend(heightCm);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Add an Mbolster</h2>
        <p className="text-sm text-muted-foreground">
          {reason} It ships with your Mpillow on the same card authorisation, and you can
          still remove it when you review the final builds. Or skip it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="paired-height" className="text-base font-semibold">
          Your height
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="paired-height"
            value={heightDraft}
            onChange={(e) => setHeightDraft(e.target.value)}
            onBlur={commitHeight}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitHeight();
            }}
            inputMode="decimal"
            placeholder={heightUnit === "in" ? "e.g. 66" : "e.g. 168"}
            className="h-12 text-lg"
          />
          <Tabs
            value={heightUnit}
            onValueChange={(v) => {
              const next = v as HeightUnit;
              const heightCm = normalizeHeightDraft(heightUnit, heightDraft) ?? draft.heightCm;
              setHeightUnit(next);
              if (heightCm) setHeightDraft(displayHeight(next, heightCm));
            }}
          >
            <TabsList className="h-12">
              <TabsTrigger value="in" className="px-4">
                in
              </TabsTrigger>
              <TabsTrigger value="cm" className="px-4">
                cm
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-xs text-muted-foreground">Height decides the Mbolster length.</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Finding your length…</p> : null}

      {!loading && draft.length ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
          <span>
            Recommended length:{" "}
            <span className="font-medium capitalize">{draft.length}</span>
          </span>
          {draft.price != null ? (
            <span className="tabular-nums">
              {currency} {draft.price.toFixed(2)}
            </span>
          ) : null}
        </div>
      ) : null}

      {!loading && draft.length && draft.cases.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Case</Label>
          <div className="space-y-2">
            {draft.cases.map((c) => {
              const selected = c.item_id === draft.caseId;
              return (
                <button
                  key={c.item_id}
                  type="button"
                  onClick={() => onDraftChange((d) => ({ ...d, caseId: c.item_id }))}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border-2 p-3 text-left transition-all hover:border-primary/50",
                    selected ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
