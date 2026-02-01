"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Step = "welcome" | "height" | "sleep-position" | "case-type" | "summary";
type HeightUnit = "cm" | "m";
type SleepPosition = "side" | "stomach" | "other";
type CaseType = "camel" | "light-green" | "light-blue";

type State = {
  step: Step;
  heightUnit: HeightUnit;
  heightCm: string; // canonical storage in cm (string for easy input)
  sleepPosition: SleepPosition | null;
  caseType: CaseType | null;
};

const STORAGE_KEY = "mbolster_config_v1";

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toDisplayHeight(state: Pick<State, "heightUnit" | "heightCm">): string {
  const cm = toNumber(state.heightCm);
  if (cm === null) return "";
  if (state.heightUnit === "cm") return String(Math.round(cm));
  const meters = cm / 100;
  return String(Math.round(meters * 100) / 100);
}

function toCmValue(unit: HeightUnit, raw: string): string {
  const n = toNumber(raw);
  if (n === null) return raw.trim() ? raw : "";
  const cm = unit === "cm" ? n : n * 100;
  // guardrails for typos
  const clamped = clampNumber(cm, 80, 250);
  return String(Math.round(clamped * 10) / 10);
}

function recommendSizeFromHeightCm(heightCm: number | null): { size: "S" | "M" | "L"; reason: string } {
  if (!heightCm) return { size: "M", reason: "Missing height → defaulting to Size M" };
  const meters = heightCm / 100;
  if (meters < 1.5) return { size: "S", reason: `Height ${meters.toFixed(2)}m → Size S` };
  if (meters <= 1.8) return { size: "M", reason: `Height ${meters.toFixed(2)}m → Size M` };
  return { size: "L", reason: `Height ${meters.toFixed(2)}m → Size L` };
}

function labelForSleepPosition(v: SleepPosition): string {
  if (v === "side") return "Side sleeper";
  if (v === "stomach") return "Stomach sleeper";
  return "Other / mixed";
}

function labelForCaseType(v: CaseType): string {
  if (v === "camel") return "Bolster + Inner Protector + Camel Case";
  if (v === "light-green") return "Bolster + Inner Protector + Light Green Case";
  return "Bolster + Inner Protector + Light Blue Case";
}

function stepIndex(step: Step): number {
  return ["welcome", "height", "sleep-position", "case-type", "summary"].indexOf(step);
}

export default function MbolsterConfigPage() {
  const [state, setState] = React.useState<State>({
    step: "welcome",
    heightUnit: "m",
    heightCm: "",
    sleepPosition: null,
    caseType: null,
  });

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<State> | null;
      if (!parsed) return;
      setState((prev) => ({
        ...prev,
        ...parsed,
        step: (parsed.step as Step) ?? prev.step,
        heightUnit: (parsed.heightUnit as HeightUnit) ?? prev.heightUnit,
        heightCm: typeof parsed.heightCm === "string" ? parsed.heightCm : prev.heightCm,
        sleepPosition: (parsed.sleepPosition as SleepPosition) ?? prev.sleepPosition,
        caseType: (parsed.caseType as CaseType) ?? prev.caseType,
      }));
    } catch {
      // best-effort; ignore malformed state
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // best-effort only
    }
  }, [state]);

  const heightNum = toNumber(state.heightCm);
  const recommendation = React.useMemo(() => recommendSizeFromHeightCm(heightNum), [heightNum]);

  const progressValue = React.useMemo(() => {
    const idx = stepIndex(state.step);
    return idx <= 0 ? 0 : Math.round((idx / 4) * 100);
  }, [state.step]);

  const goNext = () => {
    setState((s) => {
      const order: Step[] = ["welcome", "height", "sleep-position", "case-type", "summary"];
      const idx = order.indexOf(s.step);
      const next = idx < order.length - 1 ? order[idx + 1] : s.step;
      return { ...s, step: next };
    });
  };

  const goBack = () => {
    setState((s) => {
      const order: Step[] = ["welcome", "height", "sleep-position", "case-type", "summary"];
      const idx = order.indexOf(s.step);
      const prev = idx > 0 ? order[idx - 1] : s.step;
      return { ...s, step: prev };
    });
  };

  const reset = () => {
    setState({
      step: "welcome",
      heightUnit: "m",
      heightCm: "",
      sleepPosition: null,
      caseType: null,
    });
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 md:px-6">
        {state.step !== "welcome" ? (
          <div className="mb-6">
            <Progress value={progressValue} aria-label="Mbolster customisation progress" />
          </div>
        ) : null}

        {state.step === "welcome" ? (
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-muted-foreground">Mbolster</div>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Customise your Mbolster</h1>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                Answer a few quick questions to get a recommended size (S/M/L), then proceed to purchase or book an
                appointment.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={goNext}>
                Get started
              </Button>
              <Button variant="secondary" size="lg" asChild>
                <Link href="/mbolster">Learn more</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {state.step === "height" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Step 1</div>
              <h2 className="text-2xl font-semibold tracking-tight">Your height</h2>
              <p className="text-sm text-muted-foreground">
                We use height to recommend a Mbolster size, based on the mpillow.com sizing guidance.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Input
                  value={toDisplayHeight(state)}
                  onChange={(e) => {
                    const nextCm = toCmValue(state.heightUnit, e.target.value);
                    setState((s) => ({ ...s, heightCm: nextCm }));
                  }}
                  inputMode="decimal"
                  placeholder={state.heightUnit === "m" ? "e.g. 1.68" : "e.g. 168"}
                  className="h-12 text-lg"
                  autoFocus
                />
                <Tabs
                  value={state.heightUnit}
                  onValueChange={(v) => setState((s) => ({ ...s, heightUnit: v as HeightUnit, heightCm: toCmValue(v as HeightUnit, toDisplayHeight(s)) }))}
                >
                  <TabsList className="h-12">
                    <TabsTrigger value="m" className="px-4">
                      m
                    </TabsTrigger>
                    <TabsTrigger value="cm" className="px-4">
                      cm
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Recommendation preview</div>
                <div className="mt-1">
                  <span className="font-medium text-foreground">Size {recommendation.size}</span>{" "}
                  <span className="text-muted-foreground">({recommendation.reason})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button onClick={goNext} disabled={!toNumber(state.heightCm)}>
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "sleep-position" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Step 2</div>
              <h2 className="text-2xl font-semibold tracking-tight">Sleep position</h2>
              <p className="text-sm text-muted-foreground">This helps us tailor the guidance (and appointment advice).</p>
            </div>

            <div className="grid gap-3">
              {(["side", "stomach", "other"] as const).map((v) => {
                const selected = state.sleepPosition === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, sleepPosition: v }))}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      selected ? "bg-primary/10 border-primary/30" : "bg-background/50 hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold text-foreground">{labelForSleepPosition(v)}</div>
                    <div className="text-sm text-muted-foreground">
                      {v === "side"
                        ? "Most common use-case for Mbolster."
                        : v === "stomach"
                          ? "Consider the duo face cover option."
                          : "We’ll keep the recommendation flexible."}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button onClick={goNext} disabled={!state.sleepPosition}>
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "case-type" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Step 3</div>
              <h2 className="text-2xl font-semibold tracking-tight">Case type</h2>
              <p className="text-sm text-muted-foreground">Select one of the available case type bundles.</p>
            </div>

            <div className="grid gap-3">
              {(
                [
                  { id: "camel", label: "Bolster + Inner Protector + Camel Case" },
                  { id: "light-green", label: "Bolster + Inner Protector + Light Green Case" },
                  { id: "light-blue", label: "Bolster + Inner Protector + Light Blue Case" },
                ] as const
              ).map((opt) => {
                const selected = state.caseType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setState((s) => ({ ...s, caseType: opt.id }))}
                    className={[
                      "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                      selected ? "bg-primary/10 border-primary/30" : "bg-background/50 hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <div className="text-sm font-semibold text-foreground">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">You can adjust firmness later with modular fillings.</div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button onClick={goNext} disabled={!state.caseType}>
                Continue
              </Button>
            </div>
          </Card>
        ) : null}

        {state.step === "summary" ? (
          <Card className="bg-card/80 backdrop-blur-sm p-6 md:p-8 gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-muted-foreground">Summary</div>
              <h2 className="text-2xl font-semibold tracking-tight">Your Mbolster recommendation</h2>
              <p className="text-sm text-muted-foreground">Review your selections and proceed.</p>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/50 p-4">
                  <div className="text-xs text-muted-foreground">Recommended size</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">Size {recommendation.size}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{recommendation.reason}</div>
                </div>
                <div className="rounded-xl border bg-background/50 p-4">
                  <div className="text-xs text-muted-foreground">Height</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {toDisplayHeight(state)} {state.heightUnit}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-background/50 p-4">
                <div className="text-xs text-muted-foreground">Sleep position</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {state.sleepPosition ? labelForSleepPosition(state.sleepPosition) : "—"}
                </div>
              </div>

              <div className="rounded-xl border bg-background/50 p-4">
                <div className="text-xs text-muted-foreground">Case type</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {state.caseType ? labelForCaseType(state.caseType) : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Note: Bolster case is optional on mpillow.com; availability may vary.
                </div>
              </div>
            </div>

            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <Button asChild className="h-auto py-4">
                <Link href="https://www.mpillow.com/products/bolsters" target="_blank" rel="noopener noreferrer">
                  Continue to purchase
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-auto py-4">
                <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                  Book an appointment
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={goBack}>
                Back
              </Button>
              <Button variant="ghost" onClick={reset}>
                Start over
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Sizing logic duplicated from{" "}
              <Link
                href="https://www.mpillow.com/products/bolsters"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                mpillow.com product page
              </Link>
              .
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

