"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CircleCheck, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { InfoTip } from "@/components/ui/info-tip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_MODELS, aiModel, type AiModel } from "@/lib/ai/models";
import {
  AI_WRITING_KINDS,
  AI_WRITING_KIND_LABEL,
  aiUsageSummaryLine,
  formatUsageCost,
  type AiUsageThisMonth,
} from "@/lib/ai/usage";
import {
  AI_WRITING_DEFAULTS,
  AI_WRITING_EFFORT_LABEL,
  AI_WRITING_LIMIT_RANGE,
  aiWritingEffortsFor,
  type AiWritingEffort,
  type AiWritingSettings,
} from "@/lib/ai/writing-settings";

// PRD-campaign-email-editor slice 16: the owner sets AI writing's model and
// limits once, here; every ✨ call reads them on the server
// (/api/settings/ai-writing, lib/ai/settings.ts). The key is entered in the
// Claude API key card above (claude-key-section.tsx).

const tokens = (n: number) => n.toLocaleString("en-SG");

const price = (m: AiModel) => `US$${m.inputPerMillionUsd} in and US$${m.outputPerMillionUsd} out per million tokens.`;

/** The fields, status and read-out, without the loading. Exported for tests. */
export function AiWritingForm({
  value,
  onChange,
  configured,
  usage,
  saving,
  onSave,
}: {
  value: AiWritingSettings;
  onChange: (next: AiWritingSettings) => void;
  configured: boolean;
  usage: AiUsageThisMonth | null;
  saving: boolean;
  onSave: () => void;
}) {
  const model = aiModel(value.model) ?? AI_MODELS[0];
  const efforts = aiWritingEffortsFor(model);
  const set = (patch: Partial<AiWritingSettings>) => onChange({ ...value, ...patch });
  const setField = <K extends keyof AiWritingSettings>(field: K, v: AiWritingSettings[K]) => set({ [field]: v } as Partial<AiWritingSettings>);

  const pickModel = (id: string) => {
    const next = aiModel(id);
    if (!next) return;
    const offered = aiWritingEffortsFor(next);
    const keep = (e: AiWritingEffort, fallback: AiWritingEffort) =>
      offered.includes(e) ? e : offered.includes(fallback) ? fallback : (offered[0] ?? e);
    set({
      model: next.id as AiWritingSettings["model"],
      effortDraft: keep(value.effortDraft, AI_WRITING_DEFAULTS.effortDraft),
      effortQuick: keep(value.effortQuick, AI_WRITING_DEFAULTS.effortQuick),
    });
  };

  const effortSelect = (id: string, label: string, hint: string, field: "effortDraft" | "effortQuick") => (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value[field]} onValueChange={(v) => setField(field, v as AiWritingEffort)}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent sheetTitle={label}>
          {efforts.map((e) => (
            <SelectItem key={e} value={e}>
              {AI_WRITING_EFFORT_LABEL[e]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  const limitInput = (id: string, label: string, field: "limit10min" | "limitDay") => {
    const range = AI_WRITING_LIMIT_RANGE[field];
    return (
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          value={Number.isNaN(value[field]) ? "" : value[field]}
          // An emptied box is no number, which Save refuses, so what is typed next is the limit.
          onChange={(e) => setField(field, e.target.value === "" ? NaN : Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          {range.min} to {range.max}.
        </p>
      </div>
    );
  };

  const usedKinds = usage ? AI_WRITING_KINDS.filter((k) => usage.byKind[k].calls > 0) : [];

  return (
    <div className="grid min-w-0 gap-4">
      <p role="status" className="flex items-start gap-2 text-sm">
        {configured ? (
          <>
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Claude is configured
          </>
        ) : (
          <>
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            Add the Claude API key above to use AI writing
          </>
        )}
      </p>

      <div>
        <div className="flex items-center gap-2">
          <Switch id="ai-writing-enabled" checked={value.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          <Label htmlFor="ai-writing-enabled">AI writing</Label>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {value.enabled
            ? "On. Campaigns and products show the ✨ buttons."
            : "Off. Every ✨ button in campaigns and products is hidden."}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-1.5 sm:col-span-2">
          <Label htmlFor="ai-writing-model">Model</Label>
          <Select value={model.id} onValueChange={pickModel}>
            <SelectTrigger id="ai-writing-model" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent sheetTitle="Model">
              {AI_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{price(model)}</p>
        </div>
        {effortSelect("ai-writing-effort-draft", "Effort for whole drafts", "✨ Generate, ✨ Translate, and a product's ✨ Write and ✨ Generate SEO.", "effortDraft")}
        {effortSelect(
          "ai-writing-effort-quick",
          "Effort for quick actions",
          "Subject ideas, preview lines and rewriting a block.",
          "effortQuick",
        )}
        {limitInput("ai-writing-limit-10min", "Limit per Staff member, per 10 minutes", "limit10min")}
        {limitInput("ai-writing-limit-day", "Limit per Staff member, per day", "limitDay")}
      </div>

      <div className="min-w-0 border-t pt-4">
        <h3 className="text-sm font-medium">This month</h3>
        {usage ? (
          <>
            <p className="mt-1 text-sm">{aiUsageSummaryLine(usage)}</p>
            {usedKinds.length > 0 && (
              <div className="mt-3 min-w-0 overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="px-3 py-2 font-medium">Kind</th>
                      <th className="px-3 py-2 text-right font-medium">Calls</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens in</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens out</th>
                      <th className="px-3 py-2 text-right font-medium">Estimated cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...usedKinds.map((k) => [AI_WRITING_KIND_LABEL[k], usage.byKind[k]] as const), ["Total", usage.total] as const].map(
                      ([label, line]) => (
                        <tr key={label} className="border-b last:border-b-0">
                          <td className="px-3 py-2">{label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{tokens(line.calls)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{tokens(line.inputTokens)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{tokens(line.outputTokens)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatUsageCost(line.costUsd)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {usage.unlistedModelCalls > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {usage.unlistedModelCalls === 1 ? "1 call was" : `${tokens(usage.unlistedModelCalls)} calls were`} served by a
                model not in the list, and {usage.unlistedModelCalls === 1 ? "is" : "are"} priced as {AI_MODELS[0].label}.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              An estimate: the tokens recorded with each call since the 1st, at the model&apos;s list price. The
              Anthropic Console has the bill.
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Couldn&apos;t read this month&apos;s use. Reload to try again.</p>
        )}
      </div>

      <div>
        <Button type="button" size="sm" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save AI writing"}
        </Button>
      </div>
    </div>
  );
}

type LoadedState = { configured: boolean; usage: AiUsageThisMonth | null };

/** `configured`, when the page knows it, takes the place of what the section loaded, so a key saved above shows here at once. */
export function AiWritingSection({ configured }: { configured?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AiWritingSettings>(AI_WRITING_DEFAULTS);
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/ai-writing", { cache: "no-store" });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error ?? "Couldn't load the AI writing settings.");
        if (cancelled) return;
        setForm(payload.settings as AiWritingSettings);
        setLoaded({ configured: payload.configured === true, usage: (payload.usage ?? null) as AiUsageThisMonth | null });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load the AI writing settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai-writing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't save the AI writing settings.");
      setForm(payload.settings as AiWritingSettings);
      toast.success("AI writing saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the AI writing settings.");
    } finally {
      setSaving(false);
    }
  }, [form]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border p-4">
      <div className="flex items-center gap-1.5">
        <CollapsibleTrigger className="text-left">
          <h2 className="text-sm font-medium">AI writing</h2>
        </CollapsibleTrigger>
        <InfoTip label="About AI writing">
          The ✨ buttons in the campaign and product editors ask Claude to write. Set the model, how hard it
          thinks and how often each Staff member may ask. Review replies keep their own settings.
        </InfoTip>
        <CollapsibleTrigger aria-label="Toggle AI writing" className="flex flex-1 justify-end self-stretch">
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="pt-4">
        {loadError ? (
          <p className="text-xs text-destructive">{loadError}</p>
        ) : !loaded ? (
          <p className="text-xs text-muted-foreground">Loading AI writing settings…</p>
        ) : (
          <AiWritingForm
            value={form}
            onChange={setForm}
            configured={configured ?? loaded.configured}
            usage={loaded.usage}
            saving={saving}
            onSave={() => void save()}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
