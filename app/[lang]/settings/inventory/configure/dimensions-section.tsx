"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { SheetGrid, type SheetColumn, type SheetEdit } from "@/components/ui/sheet-grid";
import { LOFT_ALLOWANCE, PILLOW_DIMENSIONS, PILLOW_SIZES } from "@/lib/spatial-fillings/dimensions";
import {
  LOFT_ALLOWANCE_MAX_PCT,
  type CatalogSource,
  type DimensionsPayload,
  type NeckCatalogEntry,
  type PouchCatalogEntry,
} from "@/lib/spatial-fillings/dimension-overrides";
import { getApiErrorMessage } from "@/lib/utils";

const ROUTE = "/settings/product-builder/dimensions";

type Body = Record<string, unknown>;

export function DimensionsSection({ settingsPath }: { settingsPath: (path: string) => string }) {
  const [payload, setPayload] = useState<DimensionsPayload | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(settingsPath(ROUTE));
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Couldn't load dimensions."));
        return;
      }
      setPayload(data as DimensionsPayload);
    } catch {
      toast.error("Couldn't load dimensions.");
    }
  }, [settingsPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const request = useCallback(
    async (method: "POST" | "DELETE", body: Body) => {
      const res = await fetch(settingsPath(ROUTE), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Couldn't save dimensions."));
        return false;
      }
      return true;
    },
    [settingsPath],
  );

  const mutate = useCallback(
    async (method: "POST" | "DELETE", body: Body, done: string) => {
      const ok = await request(method, body);
      if (ok) {
        toast.success(done);
        await load();
      }
      return ok;
    },
    [request, load],
  );

  const saveAll = useCallback(
    async (kind: "pouch" | "neck", items: { id: string; body: Body }[], noun: string) => {
      const saved: string[] = [];
      for (const { id, body } of items) if (await request("POST", { kind, ...body })) saved.push(id);
      if (saved.length) toast.success(`${saved.length} ${noun} saved`);
      await load();
      return saved;
    },
    [request, load],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h3 className="text-base font-semibold tracking-tight">Dimensions</h3>
        <InfoTip label="About Dimensions">
          <p>
            What the x-ray draws and budgets with, in millimetres. Each entry ships with a
            code default; saving here overrides it for every x-ray on next load, and “Use
            default” puts the code value back. An <em>unmeasured</em> entry is drawn at a
            plausible fallback size until someone with a ruler fills it in. Pillow shapes,
            section widths and heights come from the drawings and are not editable.
          </p>
          <p>
            Enter pouch and neck support sizes as they sit in a <strong>size M</strong> pillow.
            The other sizes scale them by their own proportions (width by the pillow width,
            length by its length, thickness by its gusset height), so a filling keeps its
            place in every pillow from XS to XL.{" "}
            <a
              href={settingsPath("/settings/inventory/configure/calibration")}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Open the calibration sheet
            </a>{" "}
            to check these numbers against a real build.
          </p>
        </InfoTip>
      </div>
      {!payload ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <AllowanceEditor
            storedPct={payload.loftAllowancePct}
            allowance={payload.loftAllowance}
            onSave={(pct) => mutate("POST", { kind: "allowance", pct }, "Loft allowance saved")}
            onReset={() => mutate("DELETE", { kind: "allowance" }, "Loft allowance back to the code default")}
          />
          <DimensionSheet
            title="Filling pouches"
            blurb="Width runs across the section (left to right) and length along it (front to back). Thickness is measured relaxed and fully compressed, and minimum width when squeezed. Flat length and width are optional: the fabric’s own limit when it stops a spread before the fill is fully compressed."
            leadHead="Pouch"
            columns={POUCH_COLUMNS}
            entries={payload.pouches.map((row) => ({
              id: row.key,
              label: row.label,
              header: (
                <>
                  <div>{row.label}</div>
                  <code className="text-[10px] text-muted-foreground font-normal">{row.key}</code>
                </>
              ),
              initial: pouchDraft(row),
              source: row.source,
              measuredOn: row.measuredOn,
            }))}
            toBody={(key, d) => pouchBody(key, d as PouchDraft)}
            onSaveAll={(items) => saveAll("pouch", items, "pouch rows")}
            onReset={(key) => mutate("DELETE", { kind: "pouch", key }, "Pouch back to the code default")}
          />
          <DimensionSheet
            title="Cervical Neck Support"
            blurb="A roll, like a mini bolster: length end to end (left ↔ right), radius relaxed and fully squashed."
            leadHead="Size"
            columns={NECK_COLUMNS}
            entries={payload.neck.map((row) => ({
              id: row.size,
              label: `Neck support ${row.size}`,
              header: row.size,
              initial: neckDraft(row),
              source: row.source,
              measuredOn: row.measuredOn,
            }))}
            toBody={(size, d) => neckBody(size, d as NeckDraft)}
            onSaveAll={(items) => saveAll("neck", items, "neck support rows")}
            onReset={(size) => mutate("DELETE", { kind: "neck", size }, "Neck support back to the code default")}
          />
        </>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: CatalogSource }) {
  if (source === "configured") return <Badge className="text-xs">Configured</Badge>;
  if (source === "default") return <Badge variant="outline" className="text-xs">Default</Badge>;
  return (
    <Badge variant="secondary" className="text-xs text-amber-700 dark:text-amber-400">
      Unmeasured
    </Badge>
  );
}

function AllowanceEditor({
  storedPct,
  allowance,
  onSave,
  onReset,
}: {
  storedPct: number | null;
  allowance: number;
  onSave: (pct: number) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}) {
  const effectivePct = Math.round(allowance * 100);
  const [draft, setDraft] = useState(String(effectivePct));
  const draftPct = Number(draft);
  const valid = Number.isInteger(draftPct) && draftPct >= 0 && draftPct <= LOFT_ALLOWANCE_MAX_PCT;
  const dirty = valid && draftPct !== effectivePct;

  const heights = useMemo(() => {
    const k = 1 + (valid ? draftPct : allowance * 100) / 100;
    return PILLOW_SIZES.map((size) => {
      const g = PILLOW_DIMENSIONS[size].gusset;
      return `${size} ${Math.round(g.fullMm * k)} / ${Math.round(g.backMm * k)}`;
    }).join(", ");
  }, [draftPct, valid, allowance]);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="loft-allowance" className="text-sm font-medium">
          Loft allowance
        </label>
        <InfoTip label="About loft allowance">
          How much the drawn height and the loft budget exceed the drawing’s gusset, because the
          case is cloth and gives. Drawn side and centre heights in mm at this allowance: {heights}.
        </InfoTip>
        <div className="flex items-center gap-1">
          <div className="w-20">
            <Input
              id="loft-allowance"
              type="number"
              inputMode="numeric"
              min={0}
              max={LOFT_ALLOWANCE_MAX_PCT}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={!valid}
            />
          </div>
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <SourceBadge source={storedPct === null ? "default" : "configured"} />
        <Button type="button" size="sm" disabled={!dirty} onClick={() => void onSave(draftPct)}>
          Save
        </Button>
        {storedPct !== null && (
          <Button type="button" size="sm" variant="ghost" onClick={() => void onReset()}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Use default ({Math.round(LOFT_ALLOWANCE * 100)} %)
          </Button>
        )}
      </div>
    </div>
  );
}

const POUCH_COLUMNS: SheetColumn[] = [
  { key: "width_mm", label: "Width" },
  { key: "length_mm", label: "Length" },
  { key: "thickness_mm", label: "Thickness" },
  { key: "min_thickness_mm", label: "Min thick." },
  { key: "min_width_mm", label: "Min width" },
  { key: "flat_length_mm", label: "Flat L", placeholder: "–" },
  { key: "flat_width_mm", label: "Flat W", placeholder: "–" },
];

const NECK_COLUMNS: SheetColumn[] = [
  { key: "length_mm", label: "Length" },
  { key: "radius_mm", label: "Radius" },
  { key: "min_radius_mm", label: "Min radius" },
];

type PouchDraft = {
  width_mm: string;
  length_mm: string;
  thickness_mm: string;
  min_thickness_mm: string;
  min_width_mm: string;
  flat_length_mm: string;
  flat_width_mm: string;
};

function pouchDraft(row: PouchCatalogEntry): PouchDraft {
  return {
    width_mm: String(row.dims.widthMm),
    length_mm: String(row.dims.lengthMm),
    thickness_mm: String(row.dims.thicknessMm),
    min_thickness_mm: String(row.dims.minThicknessMm),
    min_width_mm: String(row.dims.minWidthMm),
    flat_length_mm: row.dims.flatLengthMm ? String(row.dims.flatLengthMm) : "",
    flat_width_mm: row.dims.flatWidthMm ? String(row.dims.flatWidthMm) : "",
  };
}

function toMm(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function pouchBody(key: string, d: PouchDraft): { body: Body } | { error: string } {
  const width_mm = toMm(d.width_mm);
  const length_mm = toMm(d.length_mm);
  const thickness_mm = toMm(d.thickness_mm);
  const min_thickness_mm = toMm(d.min_thickness_mm);
  const min_width_mm = toMm(d.min_width_mm);
  if (!width_mm || !length_mm || !thickness_mm || !min_thickness_mm || !min_width_mm) {
    return { error: "Every measurement must be a whole number of millimetres." };
  }
  if (min_thickness_mm > thickness_mm) return { error: "Min thickness can't be more than thickness." };
  if (min_width_mm > width_mm) return { error: "Min width can't be more than width." };
  const flat_length_mm = d.flat_length_mm.trim() === "" ? null : toMm(d.flat_length_mm);
  const flat_width_mm = d.flat_width_mm.trim() === "" ? null : toMm(d.flat_width_mm);
  if (flat_length_mm === null && d.flat_length_mm.trim() !== "") return { error: "Flat length must be a whole number." };
  if (flat_width_mm === null && d.flat_width_mm.trim() !== "") return { error: "Flat width must be a whole number." };
  return {
    body: {
      key,
      width_mm,
      length_mm,
      thickness_mm,
      min_thickness_mm,
      min_width_mm,
      flat_length_mm,
      flat_width_mm,
    },
  };
}

type NeckDraft = { length_mm: string; radius_mm: string; min_radius_mm: string };

function neckDraft(row: NeckCatalogEntry): NeckDraft {
  return {
    length_mm: String(row.dims.lengthMm),
    radius_mm: String(row.dims.radiusMm),
    min_radius_mm: String(row.dims.minRadiusMm),
  };
}

function neckBody(size: string, d: NeckDraft): { body: Body } | { error: string } {
  const length_mm = toMm(d.length_mm);
  const radius_mm = toMm(d.radius_mm);
  const min_radius_mm = toMm(d.min_radius_mm);
  if (!length_mm || !radius_mm || !min_radius_mm) {
    return { error: "Every measurement must be a whole number of millimetres." };
  }
  if (min_radius_mm > radius_mm) return { error: "Min radius can't be more than radius." };
  return { body: { size, length_mm, radius_mm, min_radius_mm } };
}


type Draft = Record<string, string>;
type BodyResult = { body: Body } | { error: string };
type SheetEntry = {
  id: string;
  label: string;
  header: ReactNode;
  initial: Draft;
  source: CatalogSource;
  measuredOn: string | null;
};

function DimensionSheet({
  title,
  blurb,
  leadHead,
  columns,
  entries,
  toBody,
  onSaveAll,
  onReset,
}: {
  title: string;
  blurb: ReactNode;
  leadHead: string;
  columns: SheetColumn[];
  entries: SheetEntry[];
  toBody: (id: string, draft: Draft) => BodyResult;
  onSaveAll: (items: { id: string; body: Body }[]) => Promise<string[]>;
  onReset: (id: string) => Promise<boolean>;
}) {
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);

  const value = (id: string, col: string) => edits[id]?.[col] ?? byId.get(id)?.initial[col] ?? "";
  const isDirty = (id: string, col: string) => {
    const v = edits[id]?.[col];
    return v !== undefined && v !== byId.get(id)?.initial[col];
  };
  const dirty = entries.filter((e) => columns.some((c) => isDirty(e.id, c.key)));
  const results = new Map(dirty.map((e) => [e.id, toBody(e.id, { ...e.initial, ...edits[e.id] })]));
  const errorCount = [...results.values()].filter((r) => "error" in r).length;

  const drop = (ids: string[]) =>
    setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));

  const onChange = (changes: SheetEdit[]) =>
    setEdits((prev) => {
      const next = { ...prev };
      for (const { rowId, colKey, value: v } of changes) next[rowId] = { ...next[rowId], [colKey]: v };
      return next;
    });

  const save = async () => {
    const items = [...results].flatMap(([id, r]) => ("body" in r ? [{ id, body: r.body }] : []));
    setSaving(true);
    try {
      drop(await onSaveAll(items));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-semibold">{title}</h4>
          <InfoTip label={`About ${title}`}>{blurb}</InfoTip>
        </div>
        <div className="flex items-center gap-2">
          {dirty.length > 0 && (
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => setEdits({})}>
              Discard
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={saving || dirty.length === 0 || errorCount === dirty.length}
            title={errorCount ? `${errorCount} row(s) have errors and won't be saved` : undefined}
            onClick={() => void save()}
          >
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save{dirty.length ? ` ${dirty.length - errorCount} row${dirty.length - errorCount === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </div>
      <SheetGrid
        label={title}
        leadHead={leadHead}
        columns={columns}
        rows={entries.map((entry) => ({
          ...entry,
          header: (
            <>
              {entry.header}
              <div className="mt-1 flex items-center gap-1 md:hidden">
                <SourceBadge source={entry.source} />
                {entry.source === "configured" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="-my-2 size-11"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={async () => {
                      if (await onReset(entry.id)) drop([entry.id]);
                    }}
                    aria-label={`Reset ${entry.label} to the code default`}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                )}
              </div>
              {(() => {
                const result = results.get(entry.id);
                return result && "error" in result ? (
                  <div className="mt-1 text-[10px] font-normal text-destructive md:hidden">{result.error}</div>
                ) : null;
              })()}
            </>
          ),
        }))}
        value={value}
        isDirty={isDirty}
        onChange={onChange}
        trailingHeads={
          <>
            <th className="border-b border-l px-3 py-2 text-left font-medium text-muted-foreground max-md:hidden">Status</th>
            <th className="border-b px-3 py-2 text-right font-medium text-muted-foreground max-md:hidden">Actions</th>
          </>
        }
        renderTrailing={(id) => {
          const entry = byId.get(id)!;
          const result = results.get(id);
          return (
            <>
              <td className="border-l px-3 py-1.5 whitespace-nowrap max-md:hidden">
                <SourceBadge source={entry.source} />
                {entry.measuredOn && <div className="text-[10px] text-muted-foreground mt-1">{entry.measuredOn}</div>}
                {result && "error" in result && <div className="text-[10px] text-destructive mt-1">{result.error}</div>}
              </td>
              <td className="px-3 py-1.5 text-right max-md:hidden">
                {entry.source === "configured" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (await onReset(id)) drop([id]);
                    }}
                    aria-label={`Reset ${entry.label} to the code default`}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Use default
                  </Button>
                )}
              </td>
            </>
          );
        }}
      />
    </div>
  );
}
