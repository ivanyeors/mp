"use client";

/**
 * Soft cut (ADR 0025): the Soft body tab of Configure. The cross-section draws
 * each filling as a soft pouch that settles inside the cloth case; the few
 * knobs here tune it for every cut, saved as one site setting. The preview
 * always draws the unsaved draft, on the sample recipes the testing preview
 * was approved on, so a value is seen before it is saved — side-on (the cut)
 * and from above (the x-ray), so the Ear Comfort Pad's well reads both ways.
 */

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { XRAY_VIEW } from "@/components/spatial/xray-assets";
import { CrossSectionSvg } from "@/components/spatial/xray-cross-section";
import { XrayPillow } from "@/components/spatial/xray-pillow";
import { XRAY_THEME } from "@/components/spatial/xray-theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import { SECTIONS, type Section } from "@/lib/spatial-fillings/core";
import type { DimensionsPayload } from "@/lib/spatial-fillings/dimension-overrides";
import { CODE_REGISTRY, PILLOW_SIZES, type DimensionRegistry, type PillowSize } from "@/lib/spatial-fillings/dimensions";
import { fitMessage, fitPillow } from "@/lib/spatial-fillings/fit";
import {
  DEFAULT_SAMPLE_RECIPE,
  recipePlacements,
  registryFromCatalog,
  sampleItemMaps,
  sampleRecipe,
  SOFT_BODY_RECIPES,
} from "@/lib/spatial-fillings/soft-body-preview";
import {
  SOFT_BODY_DEFAULTS,
  SOFT_BODY_RANGES,
  sameSoftBodySettings,
  softBodySettings,
  type SoftBodySettings,
} from "@/lib/spatial-fillings/soft-body-settings";
import { cn, getApiErrorMessage } from "@/lib/utils";

const ROUTE = "/settings/product-builder/soft-body";
const DIMENSIONS_ROUTE = "/settings/product-builder/dimensions";
/** The preview's pickers, per browser: a convenience, never a setting. */
const PREVIEW_KEY = "mp.settings.soft-body.preview";

type Payload = { settings: SoftBodySettings; stored: boolean; updatedAt: string | null; defaults: SoftBodySettings };

/** The route's answer, re-validated: a value out of range draws as its default, as it would on every cut. */
function toPayload(data: Record<string, unknown>): Payload {
  return {
    settings: softBodySettings(data.settings),
    stored: data.stored === true,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    defaults: data.defaults ? softBodySettings(data.defaults) : SOFT_BODY_DEFAULTS,
  };
}

async function loadPayload(url: string): Promise<Payload | { error: string }> {
  const fallback = "Couldn't load the soft body settings.";
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok || !data?.settings) return { error: getApiErrorMessage(data?.error, fallback) };
    return toPayload(data);
  } catch {
    return { error: fallback };
  }
}

const savedAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" });
};

type PreviewState = { recipe: string; size: PillowSize; section: Section; compare: boolean };
const PREVIEW_DEFAULT: PreviewState = { recipe: DEFAULT_SAMPLE_RECIPE, size: "M", section: "center", compare: false };

function readPreview(): PreviewState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREVIEW_KEY) ?? "null") as Partial<PreviewState> | null;
    if (!raw || typeof raw !== "object") return PREVIEW_DEFAULT;
    return {
      recipe: sampleRecipe(raw.recipe).key,
      size: PILLOW_SIZES.includes(raw.size as PillowSize) ? (raw.size as PillowSize) : PREVIEW_DEFAULT.size,
      section: SECTIONS.includes(raw.section as Section) ? (raw.section as Section) : PREVIEW_DEFAULT.section,
      compare: raw.compare === true,
    };
  } catch {
    return PREVIEW_DEFAULT;
  }
}

function writePreview(state: PreviewState) {
  try {
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the pickers just start from the defaults next time.
  }
}

const SECTION_LABEL: Record<Section, string> = { left: "Left", center: "Center", right: "Right" };

const rigidityWord = (v: number) => (v < 34 ? "soft" : v < 67 ? "firm" : "stiff");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Settle length in seconds at 60 fps: 24 → "0.4", 8 → "0.13". */
const seconds = (steps: number) => String(Number((steps / 60).toFixed(2)));

export function SoftBodySection({ settingsPath }: { settingsPath: (path: string) => string }) {
  const [saved, setSaved] = useState<Payload | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<SoftBodySettings>(SOFT_BODY_DEFAULTS);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);

  // Bumped by "Try again".
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void loadPayload(settingsPath(ROUTE)).then((result) => {
      if (!live) return;
      if ("error" in result) {
        toast.error(result.error);
        setLoadFailed(true);
        return;
      }
      setSaved(result);
      setDraft(result.settings);
    });
    return () => {
      live = false;
    };
  }, [settingsPath, attempt]);

  const send = useCallback(
    async (method: "POST" | "DELETE", done: string) => {
      const fallback = method === "POST" ? "Couldn't save the soft body settings." : "Couldn't reset the soft body settings.";
      setBusy(method === "POST" ? "save" : "reset");
      try {
        const res = await fetch(settingsPath(ROUTE), {
          method,
          headers: { "Content-Type": "application/json" },
          ...(method === "POST" ? { body: JSON.stringify({ settings: draft }) } : {}),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.settings) {
          toast.error(getApiErrorMessage(data?.error, fallback));
          return;
        }
        const next = toPayload(data);
        setSaved(next);
        setDraft(next.settings);
        toast.success(done);
      } catch {
        toast.error(fallback);
      } finally {
        setBusy(null);
      }
    },
    [settingsPath, draft],
  );

  const dirty = saved !== null && !sameSoftBodySettings(draft, saved.settings);
  const set = <K extends keyof SoftBodySettings>(key: K, value: SoftBodySettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-semibold tracking-tight">Soft body</h3>
        <InfoTip label="About Soft body">
          <p>
            How the cross-section draws the fillings of one section, front to back: each pouch is a
            soft body that settles into the cloth case under its own weight, instead of a rounded
            slab. Only the drawing changes. The fit, the loft and the pack list stay the same.
          </p>
          <p>
            Saving applies to every cross-section (the staff x-ray, the configurator and the result
            page) on next load. “Reset to defaults” puts back the values the testing preview
            settled on.
          </p>
        </InfoTip>
      </div>
      {!saved ? (
        loadFailed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
            Couldn&apos;t load the soft body settings.
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setLoadFailed(false);
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-5 rounded-lg border p-4">
            <div className="space-y-3">
              <SaveState saved={saved} dirty={dirty} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={!dirty || busy !== null} onClick={() => void send("POST", "Soft body settings saved")}>
                  {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
                {dirty && (
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setDraft(saved.settings)}>
                    Discard changes
                  </Button>
                )}
                {saved.stored && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => void send("DELETE", "Soft body back to the defaults")}
                  >
                    {busy === "reset" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Reset to defaults
                  </Button>
                )}
              </div>
            </div>
            <SoftBodyControls draft={draft} defaults={saved.defaults} set={set} />
          </div>
          <SoftBodyPreview draft={draft} settingsPath={settingsPath} />
        </div>
      )}
    </div>
  );
}

function SaveState({ saved, dirty }: { saved: Payload; dirty: boolean }) {
  if (dirty) {
    return (
      <Badge variant="secondary" className="text-xs text-amber-700 dark:text-amber-400">
        Unsaved changes
      </Badge>
    );
  }
  if (saved.stored) {
    return <Badge className="text-xs">{saved.updatedAt ? `Saved ${savedAt(saved.updatedAt)}` : "Saved"}</Badge>;
  }
  return (
    <Badge variant="outline" className="text-xs">
      Default values
    </Badge>
  );
}

// --- Controls -------------------------------------------------------------------

function SoftBodyControls({
  draft,
  defaults,
  set,
}: {
  draft: SoftBodySettings;
  defaults: SoftBodySettings;
  set: <K extends keyof SoftBodySettings>(key: K, value: SoftBodySettings[K]) => void;
}) {
  const off = !draft.enabled;
  return (
    <div className="space-y-5">
      <SwitchRow
        label="Soft cut"
        tip="Draws each filling as a soft pouch settling in a cloth case. Off draws the rounded slabs every cut used before."
        checked={draft.enabled}
        onChange={(v) => set("enabled", v)}
      />
      {off && (
        <p className="text-xs text-muted-foreground">
          Soft cut is off: every cross-section draws rounded slabs. The values below are kept for
          when it is turned back on.
        </p>
      )}
      <div className={cn("space-y-5", off && "opacity-60")}>
        <SliderRow
          label="Rigidity"
          tip="How firmly a pouch keeps its cushion shape when pressed."
          rangeKey="rigidity"
          value={draft.rigidity}
          defaultValue={defaults.rigidity}
          display={(v) => `${rigidityWord(v)} (${v})`}
          disabled={off}
          onChange={(v) => set("rigidity", v)}
        />
        <SliderRow
          label="Neck firmness"
          tip="How little a neck support gives where it rests and where a pouch presses on it. Firm, it stays nearly round; soft, it shares a crowded cell with the pouches, squashing toward its fully squashed size."
          rangeKey="neckFirmness"
          value={draft.neckFirmness}
          defaultValue={defaults.neckFirmness}
          display={(v) => `${v < 34 ? "soft" : v < 67 ? "medium" : "firm"} (${v})`}
          disabled={off}
          onChange={(v) => set("neckFirmness", v)}
        />
        <SliderRow
          label="Ear pad firmness"
          tip="How firmly an Ear Comfort Pad keeps its shape, its rim and its well, where it rests and where a pouch presses on it. Soft, it gives a crowded cell some of its thickness."
          rangeKey="earFirmness"
          value={draft.earFirmness}
          defaultValue={defaults.earFirmness}
          display={(v) => `${v < 34 ? "soft" : v < 67 ? "medium" : "firm"} (${v})`}
          disabled={off}
          onChange={(v) => set("earFirmness", v)}
        />
        <SliderRow
          label="Pouch volume"
          tip="How full each pouch is compared with its relaxed size; above 1 it fills the space it is given."
          rangeKey="volumePct"
          value={draft.volumePct}
          defaultValue={defaults.volumePct}
          display={(v) => `× ${(v / 100).toFixed(2)}`}
          disabled={off}
          onChange={(v) => set("volumePct", v)}
        />
        <SliderRow
          label="Empty case height"
          tip="How high the case stands with nothing in it, since cloth sags."
          rangeKey="emptyCasePct"
          value={draft.emptyCasePct}
          defaultValue={defaults.emptyCasePct}
          display={(v) => `${v} %`}
          disabled={off}
          onChange={(v) => set("emptyCasePct", v)}
        />
        <SliderRow
          label="Smoothing"
          tip="Rounds off small ripples in the drawn outlines; 0 shows the raw settle."
          rangeKey="smoothing"
          value={draft.smoothing}
          defaultValue={defaults.smoothing}
          display={(v) => plural(v, "pass", "passes")}
          disabled={off}
          onChange={(v) => set("smoothing", v)}
        />
        <SliderRow
          label="Space between pieces"
          tip="Space kept between pieces so each stays countable, in pixels of the full-width cut (a phone's smaller cut scales it down)."
          rangeKey="gap"
          value={draft.gap}
          defaultValue={defaults.gap}
          display={(v) => `${v} px`}
          disabled={off}
          onChange={(v) => set("gap", v)}
        />
        <SliderRow
          label="Settle length"
          tip="How long the pieces get to settle into place, in steps of 1/60 s: more settles deeper, and the animation plays for that long."
          rangeKey="steps"
          value={draft.steps}
          defaultValue={defaults.steps}
          display={(v) => `${plural(v, "step", "steps")} (${seconds(v)} s)`}
          disabled={off}
          onChange={(v) => set("steps", v)}
        />
        <SwitchRow
          label="Animate settle"
          tip="Plays the settle when the recipe changes; otherwise the cut draws already settled. Never animates for anyone whose device asks for reduced motion."
          checked={draft.animate}
          disabled={off}
          onChange={(v) => set("animate", v)}
        />
      </div>
      <div className="space-y-5 border-t pt-4">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-semibold">Ear Comfort Pad</h4>
          <InfoTip label="About the Ear Comfort Pad">
            <p>
              A square cushion with a sewn well in its middle, where the ear rests. Placed in a
              filling template, the x-ray draws the well as a ring from above, and the cut draws it
              as a dip between two rims.
            </p>
            <p>
              Its size and thickness are on the Dimensions tab. Pick the “Ear pad mix” recipe in the
              preview to see it.
            </p>
          </InfoTip>
        </div>
        <SliderRow
          label="Well size"
          tip="How wide the sewn well is, as a share of the pad's width. Drawn with the soft cut on or off."
          rangeKey="earWellPct"
          value={draft.earWellPct}
          defaultValue={defaults.earWellPct}
          display={(v) => `${v} % of the width`}
          onChange={(v) => set("earWellPct", v)}
        />
        <SliderRow
          label="Well depth"
          tip="How far the well dips, as a share of the pad's thickness; 0 draws a flat cushion. Drawn with the soft cut on or off."
          rangeKey="earWellDepthPct"
          value={draft.earWellDepthPct}
          defaultValue={defaults.earWellDepthPct}
          display={(v) => `${v} % of the thickness`}
          onChange={(v) => set("earWellDepthPct", v)}
        />
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  tip,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  tip: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <InfoTip label={`About ${label}`}>{tip}</InfoTip>
      <span className="ml-auto text-sm text-muted-foreground" aria-hidden>
        {checked ? "On" : "Off"}
      </span>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({
  label,
  tip,
  rangeKey,
  value,
  defaultValue,
  display,
  disabled,
  onChange,
}: {
  label: string;
  tip: ReactNode;
  rangeKey: keyof typeof SOFT_BODY_RANGES;
  value: number;
  defaultValue: number;
  display: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const { min, max, step } = SOFT_BODY_RANGES[rangeKey];
  const text = display(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <InfoTip label={`About ${label}`}>
          <p>{tip}</p>
          <p className="text-muted-foreground">Default: {display(defaultValue)}.</p>
        </InfoTip>
        <output className="ml-auto text-sm tabular-nums text-muted-foreground" aria-hidden>
          {text}
        </output>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => {
          if (v !== undefined) onChange(Number(v.toFixed(3)));
        }}
        className="py-2"
        thumbProps={{ "aria-labelledby": `${id}-label`, "aria-valuetext": text }}
      />
    </div>
  );
}

// --- Preview --------------------------------------------------------------------

function SoftBodyPreview({ draft, settingsPath }: { draft: SoftBodySettings; settingsPath: (path: string) => string }) {
  const isMobile = useIsMobile();
  // The slider stays responsive while the solver catches up with the last value.
  const settings = useDeferredValue(draft);
  const slabSettings = useMemo(() => ({ ...settings, enabled: false }), [settings]);
  const [preview, setPreview] = useState<PreviewState>(() => (typeof window === "undefined" ? PREVIEW_DEFAULT : readPreview()));
  const [replay, setReplay] = useState(0);
  const [registry, setRegistry] = useState<DimensionRegistry>(CODE_REGISTRY);
  const [dimsFailed, setDimsFailed] = useState(false);

  useEffect(() => writePreview(preview), [preview]);

  // Settings › Dimensions rows, so a measured pouch draws at its measured size; the code defaults until (or unless) they load.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(settingsPath(DIMENSIONS_ROUTE));
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(getApiErrorMessage(data.error, "Failed to load dimensions"));
        if (live) setRegistry(registryFromCatalog(data as DimensionsPayload));
      } catch {
        if (live) setDimsFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [settingsPath]);

  const { itemSubtypes, itemSizes, itemDims } = useMemo(() => sampleItemMaps(registry), [registry]);
  const recipe = sampleRecipe(preview.recipe);
  const placements = useMemo(() => recipePlacements(recipe, preview.section), [recipe, preview.section]);
  const fit = useMemo(
    () => fitPillow(placements, { size: preview.size, dims: itemDims, loftAllowance: registry.loftAllowance }),
    [placements, preview.size, itemDims, registry.loftAllowance],
  );
  const cut = useMemo(() => ({ section: preview.section }), [preview.section]);
  const update = (patch: Partial<PreviewState>) => setPreview((p) => ({ ...p, ...patch }));

  const compare = preview.compare && draft.enabled;
  const problems = fit.cells.filter((c) => c.section === preview.section && c.status !== "ok");
  const worst = fit.sections[preview.section].status;
  const drawing = (softBody: SoftBodySettings) => (
    <CrossSectionSvg
      fit={fit}
      cut={cut}
      itemSubtypes={itemSubtypes}
      itemSizes={itemSizes}
      compact={isMobile}
      softBody={softBody}
      softReplay={replay}
    />
  );

  return (
    <div className="min-w-0 space-y-4 rounded-lg border p-4 lg:sticky lg:top-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <h4 className="text-sm font-semibold">Preview</h4>
        <InfoTip label="About the preview">
          <p>
            Draws the values on the left as you move them, before they are saved, on the sample
            recipes the soft cut was approved on: {SOFT_BODY_RECIPES.map((r) => r.name).join(", ")}.
            The recipe fills the chosen section; the cut is its side view, front to back, and the
            x-ray below it the same pillow from above.
          </p>
          <p>
            Pouches are sized from the Dimensions tab where a row exists, or else from the code
            defaults. Every x-ray uses the same numbers.
          </p>
        </InfoTip>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={!draft.enabled}
          onClick={() => setReplay((n) => n + 1)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay settle
        </Button>
      </div>

      <div className="space-y-3">
        <Choice
          label="Recipe"
          value={recipe.key}
          options={SOFT_BODY_RECIPES.map((r) => ({ value: r.key, label: r.name }))}
          onChange={(v) => update({ recipe: v })}
        />
        <Choice label="Size" value={preview.size} options={PILLOW_SIZES.map((s) => ({ value: s, label: s }))} onChange={(v) => update({ size: v })} />
        <Choice
          label="Section"
          value={preview.section}
          options={SECTIONS.map((s) => ({ value: s, label: SECTION_LABEL[s] }))}
          onChange={(v) => update({ section: v })}
        />
        <SwitchRow
          label="Compare with slabs"
          tip="Draws the same cut as rounded slabs too, as it was before the soft cut, to see what the soft body changes."
          checked={compare}
          disabled={!draft.enabled}
          onChange={(v) => update({ compare: v })}
        />
      </div>

      <div className={cn("grid gap-3", compare && "2xl:grid-cols-2")}>
        {compare && <CutFigure caption="Slabs">{drawing(slabSettings)}</CutFigure>}
        <CutFigure caption={draft.enabled ? "Soft cut" : "Slabs (soft cut is off)"}>{drawing(settings)}</CutFigure>
      </div>

      <CutFigure caption="From above">
        <div className="relative w-full" style={{ aspectRatio: `${XRAY_VIEW.width} / ${XRAY_VIEW.height}` }}>
          <XrayPillow
            placements={placements}
            itemSubtypes={itemSubtypes}
            itemSizes={itemSizes}
            itemDims={itemDims}
            pillowSize={preview.size}
            loftAllowance={registry.loftAllowance}
            fit={fit}
            softBody={settings}
            className="absolute inset-0"
          />
        </div>
      </CutFigure>

      <div className="space-y-1 text-xs" role="status" aria-live="polite">
        {problems.length === 0 ? (
          <p className="text-muted-foreground">
            {SECTION_LABEL[preview.section]} section fits at size {preview.size}.
          </p>
        ) : (
          problems.map((c) => (
            <p
              key={c.subSection}
              className="text-amber-600 dark:text-amber-400"
            >
              {fitMessage(c, fit.size)}
            </p>
          ))
        )}
        {worst === "over" && <p className="text-muted-foreground">A stack that cannot close draws out of the case.</p>}
        {dimsFailed && <p className="text-muted-foreground">Couldn&apos;t load dimensions, so pouches are drawn at the code defaults.</p>}
      </div>
    </div>
  );
}

function CutFigure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className={cn("min-w-0 space-y-1 rounded-lg p-2", XRAY_THEME)}>
      <figcaption className="px-1 text-[11px] font-medium text-[color:var(--xray-shell,rgba(255,255,255,0.9))]">{caption}</figcaption>
      {children}
    </figure>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div id={id} className="text-xs text-muted-foreground">
        {label}
      </div>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={o.value === value ? "default" : "outline"}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
