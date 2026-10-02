"use client";

/**
 * X-ray pillow UX slice 12 (ADR 0019): the Dimensions section of Product
 * Visualize. Loft allowance, filling pouch and Neck support dimensions are
 * editable here as overrides of the code defaults — a row wins, "Use default"
 * deletes it. Pillow geometry is the drawing and is not on this page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(settingsPath(ROUTE));
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to load dimensions"));
        return;
      }
      setPayload(data as DimensionsPayload);
    } catch {
      toast.error("Failed to load dimensions");
    } finally {
      setLoading(false);
    }
  }, [settingsPath]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (method: "POST" | "DELETE", body: Body, done: string) => {
      const res = await fetch(settingsPath(ROUTE), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to save dimensions"));
        return false;
      }
      toast.success(done);
      await load();
      return true;
    },
    [settingsPath, load],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Dimensions</h3>
        <p className="text-muted-foreground text-sm mt-1">
          What the x-ray draws and budgets with, in millimetres. Each entry ships with a
          code default; saving here overrides it for every x-ray on next load, and “Use
          default” puts the code value back. An <em>unmeasured</em> entry is drawn at a
          plausible fallback size until someone with a ruler fills it in. Pillow shapes,
          section widths and heights come from the drawings and are not editable.
          Enter pouch and Neck support sizes as they sit in a <strong>Size M</strong> pillow:
          the other Sizes scale them by their own proportions (width by the pillow width,
          length by its length, thickness by its gusset height), so a filling keeps its
          place in every pillow from XS to XL.{" "}
          <a
            href={settingsPath("/settings/products/calibration")}
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open the calibration sheet
          </a>{" "}
          to check these numbers against a real build.
        </p>
      </div>
      {loading || !payload ? (
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
          <PouchTable
            rows={payload.pouches}
            onSave={(row) => mutate("POST", { kind: "pouch", ...row }, "Pouch dimensions saved")}
            onReset={(key) => mutate("DELETE", { kind: "pouch", key }, "Pouch back to the code default")}
          />
          <NeckTable
            rows={payload.neck}
            onSave={(row) => mutate("POST", { kind: "neck", ...row }, "Neck support dimensions saved")}
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
    }).join(" · ");
  }, [draftPct, valid, allowance]);

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="loft-allowance" className="text-sm font-medium">
          Loft allowance
        </label>
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
      <p className="text-xs text-muted-foreground">
        How much the drawn height and the loft budget exceed the drawing’s gusset, because the
        case is cloth and gives. Drawn side / centre heights in mm at this allowance: {heights}.
      </p>
    </div>
  );
}

type PouchDraft = {
  width_mm: string;
  length_mm: string;
  thickness_mm: string;
  min_thickness_mm: string;
  min_width_mm: string;
  orientation: "across" | "along";
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
    orientation: row.dims.orientation,
    flat_length_mm: row.dims.flatLengthMm ? String(row.dims.flatLengthMm) : "",
    flat_width_mm: row.dims.flatWidthMm ? String(row.dims.flatWidthMm) : "",
  };
}

function toMm(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The row's draft as a request body, or the reason it cannot be saved. */
function pouchBody(key: string, d: PouchDraft): { body: Body } | { error: string } {
  const width_mm = toMm(d.width_mm);
  const length_mm = toMm(d.length_mm);
  const thickness_mm = toMm(d.thickness_mm);
  const min_thickness_mm = toMm(d.min_thickness_mm);
  const min_width_mm = toMm(d.min_width_mm);
  if (!width_mm || !length_mm || !thickness_mm || !min_thickness_mm || !min_width_mm) {
    return { error: "Every measurement must be a whole number of millimetres" };
  }
  if (min_thickness_mm > thickness_mm) return { error: "Min thickness cannot exceed thickness" };
  if (min_width_mm > width_mm) return { error: "Min width cannot exceed width" };
  const flat_length_mm = d.flat_length_mm.trim() === "" ? null : toMm(d.flat_length_mm);
  const flat_width_mm = d.flat_width_mm.trim() === "" ? null : toMm(d.flat_width_mm);
  if (flat_length_mm === null && d.flat_length_mm.trim() !== "") return { error: "Flat length must be a whole number" };
  if (flat_width_mm === null && d.flat_width_mm.trim() !== "") return { error: "Flat width must be a whole number" };
  return {
    body: {
      key,
      width_mm,
      length_mm,
      thickness_mm,
      min_thickness_mm,
      min_width_mm,
      orientation: d.orientation,
      flat_length_mm,
      flat_width_mm,
    },
  };
}

function PouchTable({
  rows,
  onSave,
  onReset,
}: {
  rows: PouchCatalogEntry[];
  onSave: (body: Body) => Promise<boolean>;
  onReset: (key: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Filling pouches</h4>
      <p className="text-xs text-muted-foreground">
        Width is the long axis, length the short one; thickness relaxed and fully compressed;
        minimum width when squeezed. Orientation says whether the long axis lies across the
        section (left ↔ right) or along it (front ↔ back). Flat length / width are optional: the
        fabric’s own limit when it stops a spread before the fill is fully compressed.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pouch</TableHead>
            <TableHead>Width</TableHead>
            <TableHead>Length</TableHead>
            <TableHead>Thickness</TableHead>
            <TableHead>Min thick.</TableHead>
            <TableHead>Min width</TableHead>
            <TableHead>Orientation</TableHead>
            <TableHead>Flat L</TableHead>
            <TableHead>Flat W</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <PouchRow
              // remount on a saved change so the draft resets to the effective values
              key={`${row.key}-${row.source}-${row.measuredOn ?? ""}-${row.dims.widthMm}-${row.dims.thicknessMm}`}
              row={row}
              onSave={onSave}
              onReset={onReset}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MmInput({
  value,
  onChange,
  label,
  optional,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  optional?: boolean;
}) {
  // The number Input wraps itself in a size-contained container, which adds
  // nothing to a table cell's intrinsic width — so the width lives on a plain
  // block around it, or the cells shrink under the inputs and they overlap.
  return (
    <div className="w-16">
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={optional ? "–" : undefined}
      />
    </div>
  );
}

function PouchRow({
  row,
  onSave,
  onReset,
}: {
  row: PouchCatalogEntry;
  onSave: (body: Body) => Promise<boolean>;
  onReset: (key: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<PouchDraft>(() => pouchDraft(row));
  const set = (field: keyof PouchDraft) => (v: string) => setDraft((d) => ({ ...d, [field]: v }));
  const initial = pouchDraft(row);
  const dirty = (Object.keys(draft) as (keyof PouchDraft)[]).some((k) => draft[k] !== initial[k]);
  const result = pouchBody(row.key, draft);
  const error = "error" in result ? result.error : null;

  return (
    <TableRow>
      <TableCell className="font-medium whitespace-nowrap">
        <div>{row.label}</div>
        <code className="text-[10px] text-muted-foreground">{row.key}</code>
      </TableCell>
      <TableCell className="px-1"><MmInput value={draft.width_mm} onChange={set("width_mm")} label={`${row.label} width mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.length_mm} onChange={set("length_mm")} label={`${row.label} length mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.thickness_mm} onChange={set("thickness_mm")} label={`${row.label} thickness mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.min_thickness_mm} onChange={set("min_thickness_mm")} label={`${row.label} minimum thickness mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.min_width_mm} onChange={set("min_width_mm")} label={`${row.label} minimum width mm`} /></TableCell>
      <TableCell className="px-1">
        <select
          value={draft.orientation}
          onChange={(e) => setDraft((d) => ({ ...d, orientation: e.target.value as "across" | "along" }))}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          aria-label={`${row.label} orientation`}
        >
          <option value="across">across</option>
          <option value="along">along</option>
        </select>
      </TableCell>
      <TableCell className="px-1"><MmInput value={draft.flat_length_mm} onChange={set("flat_length_mm")} label={`${row.label} flat length mm`} optional /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.flat_width_mm} onChange={set("flat_width_mm")} label={`${row.label} flat width mm`} optional /></TableCell>
      <TableCell>
        <SourceBadge source={row.source} />
        {row.measuredOn && <div className="text-[10px] text-muted-foreground mt-1">{row.measuredOn}</div>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || !!error}
            title={error ?? undefined}
            onClick={() => {
              if ("body" in result) void onSave(result.body);
            }}
          >
            Save
          </Button>
          {row.source === "configured" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void onReset(row.key)} aria-label={`Reset ${row.label} to the code default`}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Use default
            </Button>
          )}
        </div>
        {dirty && error && <div className="text-[10px] text-destructive mt-1 text-right">{error}</div>}
      </TableCell>
    </TableRow>
  );
}

type NeckDraft = { width_mm: string; length_mm: string; thickness_mm: string; min_thickness_mm: string };

function neckDraft(row: NeckCatalogEntry): NeckDraft {
  return {
    width_mm: String(row.dims.widthMm),
    length_mm: String(row.dims.lengthMm),
    thickness_mm: String(row.dims.thicknessMm),
    min_thickness_mm: String(row.dims.minThicknessMm),
  };
}

function neckBody(size: string, d: NeckDraft): { body: Body } | { error: string } {
  const width_mm = toMm(d.width_mm);
  const length_mm = toMm(d.length_mm);
  const thickness_mm = toMm(d.thickness_mm);
  const min_thickness_mm = toMm(d.min_thickness_mm);
  if (!width_mm || !length_mm || !thickness_mm || !min_thickness_mm) {
    return { error: "Every measurement must be a whole number of millimetres" };
  }
  if (min_thickness_mm > thickness_mm) return { error: "Min thickness cannot exceed thickness" };
  return { body: { size, width_mm, length_mm, thickness_mm, min_thickness_mm } };
}

function NeckTable({
  rows,
  onSave,
  onReset,
}: {
  rows: NeckCatalogEntry[];
  onSave: (body: Body) => Promise<boolean>;
  onReset: (size: string) => Promise<boolean>;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Cervical Neck support</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Size</TableHead>
            <TableHead>Width</TableHead>
            <TableHead>Length</TableHead>
            <TableHead>Thickness</TableHead>
            <TableHead>Min thick.</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <NeckRow
              key={`${row.size}-${row.source}-${row.measuredOn ?? ""}-${row.dims.widthMm}-${row.dims.thicknessMm}`}
              row={row}
              onSave={onSave}
              onReset={onReset}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NeckRow({
  row,
  onSave,
  onReset,
}: {
  row: NeckCatalogEntry;
  onSave: (body: Body) => Promise<boolean>;
  onReset: (size: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<NeckDraft>(() => neckDraft(row));
  const set = (field: keyof NeckDraft) => (v: string) => setDraft((d) => ({ ...d, [field]: v }));
  const initial = neckDraft(row);
  const dirty = (Object.keys(draft) as (keyof NeckDraft)[]).some((k) => draft[k] !== initial[k]);
  const result = neckBody(row.size, draft);
  const error = "error" in result ? result.error : null;

  return (
    <TableRow>
      <TableCell className="font-medium">{row.size}</TableCell>
      <TableCell className="px-1"><MmInput value={draft.width_mm} onChange={set("width_mm")} label={`Neck support ${row.size} width mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.length_mm} onChange={set("length_mm")} label={`Neck support ${row.size} length mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.thickness_mm} onChange={set("thickness_mm")} label={`Neck support ${row.size} thickness mm`} /></TableCell>
      <TableCell className="px-1"><MmInput value={draft.min_thickness_mm} onChange={set("min_thickness_mm")} label={`Neck support ${row.size} minimum thickness mm`} /></TableCell>
      <TableCell>
        <SourceBadge source={row.source} />
        {row.measuredOn && <div className="text-[10px] text-muted-foreground mt-1">{row.measuredOn}</div>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            disabled={!dirty || !!error}
            title={error ?? undefined}
            onClick={() => {
              if ("body" in result) void onSave(result.body);
            }}
          >
            Save
          </Button>
          {row.source === "configured" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => void onReset(row.size)} aria-label={`Reset Neck support ${row.size} to the code default`}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Use default
            </Button>
          )}
        </div>
        {dirty && error && <div className="text-[10px] text-destructive mt-1 text-right">{error}</div>}
      </TableCell>
    </TableRow>
  );
}
