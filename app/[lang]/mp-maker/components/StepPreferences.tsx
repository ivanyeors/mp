"use client";

import { useState, useCallback } from "react";
import { Moon, User, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { cn, getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useBuilder } from "./BuilderProvider";
import type { CustomerPreferences } from "@/lib/types/customization";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// ─── Pillow option data ──────────────────────────────────────

const SLEEP_POSITIONS: {
  value: CustomerPreferences["sleep_position"];
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  { value: "side", label: "Side", icon: <Moon className="size-6" />, description: "I sleep on my side most nights" },
  { value: "back", label: "Back", icon: <User className="size-6" />, description: "I sleep flat on my back" },
  { value: "stomach", label: "Stomach", icon: <Moon className="size-6 rotate-180" />, description: "I sleep face-down" },
  { value: "mixed", label: "Mixed", icon: <ArrowRight className="size-6" />, description: "I change positions often" },
];

const BODY_TYPES = [
  { value: "petite" as const, label: "Petite" },
  { value: "average" as const, label: "Average" },
  { value: "large" as const, label: "Large" },
];

const FIRMNESS_LEVELS = [
  { value: "soft" as const, label: "Soft" },
  { value: "medium-soft" as const, label: "Medium-Soft" },
  { value: "medium" as const, label: "Medium" },
  { value: "medium-firm" as const, label: "Medium-Firm" },
  { value: "firm" as const, label: "Firm" },
];

// ─── Component ───────────────────────────────────────────────

export function StepPreferences() {
  const builder = useBuilder();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;

  // Pillow state
  const [sleepPosition, setSleepPosition] = useState<CustomerPreferences["sleep_position"] | null>(null);
  const [bodyType, setBodyType] = useState<CustomerPreferences["body_type"] | null>(null);
  const [firmness, setFirmness] = useState<CustomerPreferences["firmness"]>("medium");
  const [notes, setNotes] = useState("");

  // Bolster state
  const [heightUnit, setHeightUnit] = useState<"cm" | "m">("cm");
  const [heightValue, setHeightValue] = useState("");
  const [bolsterSleepPos, setBolsterSleepPos] = useState<"side" | "stomach" | "other" | null>(null);

  const [loading, setLoading] = useState(false);

  const handleGetPillowRecommendation = useCallback(async () => {
    if (!sleepPosition || !bodyType) {
      toast.error("Please select your sleep position and body type");
      return;
    }

    const prefs: CustomerPreferences = {
      sleep_position: sleepPosition,
      body_type: bodyType,
      firmness,
      notes: notes || undefined,
    };

    setLoading(true);
    builder.setIsLoadingRecommendation(true);
    builder.setPillowPreferences(prefs);

    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: prefs }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to get recommendation"));
        return;
      }

      builder.setRecommendation(data);

      // Pre-select default cover/case
      const defaultCover = data.components?.covers?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      const defaultCase = data.components?.cases?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);

      builder.goNext();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      builder.setIsLoadingRecommendation(false);
    }
  }, [sleepPosition, bodyType, firmness, notes, builder]);

  const handleGetBolsterRecommendation = useCallback(async () => {
    if (!bolsterSleepPos || !heightValue) {
      toast.error("Please enter your height and sleep position");
      return;
    }

    const heightCm = heightUnit === "m"
      ? Math.round(parseFloat(heightValue) * 100)
      : parseInt(heightValue, 10);

    if (isNaN(heightCm) || heightCm < 80 || heightCm > 250) {
      toast.error("Please enter a valid height (80-250 cm)");
      return;
    }

    setLoading(true);
    builder.setIsLoadingRecommendation(true);
    builder.setBolsterPreferences({ height_cm: heightCm, sleep_position: bolsterSleepPos });

    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bolster_preferences: { height_cm: heightCm, sleep_position: bolsterSleepPos } }),
      });
      const data = await res.json();

      if (!data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to get recommendation"));
        return;
      }

      builder.setRecommendation(data);

      const defaultCover = data.components?.covers?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      const defaultCase = data.components?.cases?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);

      builder.goNext();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      builder.setIsLoadingRecommendation(false);
    }
  }, [bolsterSleepPos, heightValue, heightUnit, builder]);

  // ─── Pillow form ───────────────────────────────────────────

  if (builder.productType === "pillow") {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Tell us about your sleep</h2>
          <p className="text-muted-foreground">We&apos;ll recommend the perfect pillow for you.</p>
        </div>

        {/* Sleep position */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Sleep Position</Label>
          <div className="grid grid-cols-2 gap-3">
            {SLEEP_POSITIONS.map((pos) => (
              <button
                key={pos.value}
                type="button"
                onClick={() => setSleepPosition(pos.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all",
                  "hover:border-primary/50",
                  sleepPosition === pos.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                {pos.icon}
                <span className="font-medium text-sm">{pos.label}</span>
                <span className="text-xs text-muted-foreground text-center">{pos.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body type */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Body Type</Label>
          <div className="grid grid-cols-3 gap-3">
            {BODY_TYPES.map((bt) => (
              <button
                key={bt.value}
                type="button"
                onClick={() => setBodyType(bt.value)}
                className={cn(
                  "rounded-lg border-2 p-3 text-sm font-medium transition-all",
                  "hover:border-primary/50",
                  bodyType === bt.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                {bt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Firmness */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Firmness Preference</Label>
          <div className="flex gap-2 flex-wrap">
            {FIRMNESS_LEVELS.map((fl) => (
              <button
                key={fl.value}
                type="button"
                onClick={() => setFirmness(fl.value)}
                className={cn(
                  "rounded-full border-2 px-4 py-2 text-sm font-medium transition-all",
                  "hover:border-primary/50",
                  firmness === fl.value
                    ? "border-primary bg-primary/5"
                    : "border-border"
                )}
              >
                {fl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label className="text-sm">Additional notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any specific needs or preferences..."
            rows={3}
          />
        </div>

        {/* Measurement link */}
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <p className="text-muted-foreground">
            Want a more precise recommendation?{" "}
            <Link
              href={withLocale(`/mp-config?returnTo=${encodeURIComponent(withLocale("/mp-maker", locale))}`, locale)}
              className="text-primary font-medium underline underline-offset-2"
            >
              Take our measurement quiz →
            </Link>
          </p>
        </div>

        {/* Submit */}
        <Button
          size="lg"
          className="w-full"
          onClick={handleGetPillowRecommendation}
          disabled={loading || !sleepPosition || !bodyType}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Getting your recommendation...
            </>
          ) : (
            <>
              Get My Recommendation
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    );
  }

  // ─── Bolster form ──────────────────────────────────────────

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Build your Mbolster</h2>
        <p className="text-muted-foreground">Tell us a bit about yourself for the perfect fit.</p>
      </div>

      {/* Height */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Your Height</Label>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              type="number"
              value={heightValue}
              onChange={(e) => setHeightValue(e.target.value)}
              placeholder={heightUnit === "cm" ? "170" : "1.70"}
              className="text-lg h-12"
            />
          </div>
          <Tabs value={heightUnit} onValueChange={(v) => setHeightUnit(v as "cm" | "m")}>
            <TabsList>
              <TabsTrigger value="cm">cm</TabsTrigger>
              <TabsTrigger value="m">m</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Sleep position */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Sleep Position</Label>
        <div className="grid grid-cols-3 gap-3">
          {(["side", "stomach", "other"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setBolsterSleepPos(pos)}
              className={cn(
                "rounded-lg border-2 p-4 text-center transition-all",
                "hover:border-primary/50",
                bolsterSleepPos === pos
                  ? "border-primary bg-primary/5"
                  : "border-border"
              )}
            >
              <span className="font-medium text-sm capitalize">{pos === "other" ? "Other / Mixed" : pos}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Submit */}
      <Button
        size="lg"
        className="w-full"
        onClick={handleGetBolsterRecommendation}
        disabled={loading || !bolsterSleepPos || !heightValue}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Getting your recommendation...
          </>
        ) : (
          <>
            Get My Recommendation
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </div>
  );
}
