"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { AxisBottom } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { scaleLinear, scaleOrdinal } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { useTooltip } from "@visx/tooltip";
import { localPoint } from "@visx/event";
import { Button } from "@/components/ui/button";

type ItemCost = { id: number; cost: number | null };

type PillowProductRowDb = {
  id: number | string;
  kind: string | null;
  size: string | null;
  is_active: boolean | number | null;
};

type BomLineRowDb = {
  product_id: number | string;
  item_id: number | string;
  quantity: number | string | null;
};

type ProductPriceRowDb = {
  product_id: number | string;
  msrp: number | string | null;
  currency: string | null;
};

type BomTemplateRowDb = {
  id: number | string;
  kind: "pillow" | "bolster" | string;
  key: string | null;
  name: string | null;
  pillow_kind: "basic" | "premium" | null;
  pillow_variant: string | null;
};

type BomTemplateLineRowDb = {
  template_id: number | string;
  item_id: number | string;
  quantity: number | string | null;
};

type DrillKind = "basic" | "premium";
type DrillLevel = "kind" | "size" | "template";

type MetricRow = {
  label: string;
  costValue: number;
  msrpValue: number;
  meta: {
    level: DrillLevel;
    kind?: DrillKind;
    size?: string;
    templateId?: number;
    buildable?: number;
    unitCost?: number;
    unitMsrp?: number | null;
  };
};

type TooltipDatum = {
  label: string;
  segment: "Cost value" | "MSRP value";
  costValue: number;
  msrpValue: number;
  costLabel: string;
  msrpLabel: string;
  impliedMarginLabel: string;
  insight: string;
  buildable?: number;
  unitCost?: number;
  unitMsrp?: number | null;
};

const seriesKeys = ["costValue", "msrpValue"] as const;
type SeriesKey = (typeof seriesKeys)[number];

const legend = [
  { key: "costValue" as const, label: "Cost value", color: "var(--chart-2)" },
  { key: "msrpValue" as const, label: "MSRP value", color: "var(--chart-1)" },
];

const formatCompactCurrency = (() => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    });
  } catch {
    return null;
  }
})();

function asMoney(value: number) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "$0";
  return formatCompactCurrency ? formatCompactCurrency.format(n) : String(n.toFixed(0));
}

function insightFor(row: MetricRow) {
  const impliedMarginValue = Math.max(0, row.msrpValue - row.costValue);
  const marginPct = row.msrpValue > 0 ? (impliedMarginValue / row.msrpValue) * 100 : null;
  if (row.meta.buildable !== undefined && row.meta.buildable <= 0) return "No units sold in the selected date range.";
  if (row.meta.unitMsrp === null) return "Missing MSRP for this product price.";
  if (row.msrpValue <= 0) return "No priced value computed yet.";
  if (marginPct === null) return "Missing pricing inputs.";
  if (marginPct < 25) return "Low product margin: review BOM costs and MSRP.";
  if (marginPct < 40) return "Below 40% target: cost or price adjustments needed.";
  return "Healthy product margin at current pricing.";
}

const defaultMargin = { top: 16, right: 20, bottom: 32, left: 190 };

function Chart({
  width,
  height,
  rows,
  onTickClick,
}: {
  width: number;
  height: number;
  rows: MetricRow[];
  onTickClick?: (label: string) => void;
}) {
  const margin = defaultMargin;
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const BAR_HEIGHT = 16;
  const BAR_RADIUS = 2;
  const INNER_BAR_GAP = 4;
  const ROW_GAP = 10;
  const groupHeight = BAR_HEIGHT * 2 + INNER_BAR_GAP;
  const rowStep = groupHeight + ROW_GAP;
  const contentInnerHeight =
    rows.length > 0 ? Math.max(10, rows.length * rowStep - ROW_GAP) : Math.max(10, height - margin.top - margin.bottom);
  const svgHeight = Math.max(height, contentInnerHeight + margin.top + margin.bottom);

  const [hoveredTick, setHoveredTick] = useState<string | null>(null);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<TooltipDatum>();

  const showRowTooltip = (
    evt: React.MouseEvent<SVGElement, MouseEvent>,
    row: MetricRow,
    segment: TooltipDatum["segment"]
  ) => {
    const impliedMarginValue = Math.max(0, row.msrpValue - row.costValue);
    showTooltip({
      tooltipData: {
        label: row.label,
        segment,
        buildable: row.meta.buildable,
        unitCost: row.meta.unitCost,
        unitMsrp: row.meta.unitMsrp ?? null,
        costValue: row.costValue,
        msrpValue: row.msrpValue,
        costLabel: asMoney(row.costValue),
        msrpLabel: asMoney(row.msrpValue),
        impliedMarginLabel: asMoney(impliedMarginValue),
        insight: insightFor(row),
      },
      tooltipLeft: evt.clientX + 12,
      tooltipTop: evt.clientY + 12,
    });
  };

  const xDomainMax = useMemo(() => {
    const max = Math.max(...rows.map((d) => Math.max(d.costValue, d.msrpValue)), 0);
    return Math.max(1, max * 1.08);
  }, [rows]);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, xDomainMax],
        range: [0, innerWidth],
        nice: true,
      }),
    [innerWidth, xDomainMax]
  );

  const colorScale = useMemo(
    () =>
      scaleOrdinal<SeriesKey, string>({
        domain: seriesKeys as unknown as SeriesKey[],
        range: ["var(--chart-2)", "var(--chart-1)"],
      }),
    []
  );

  return (
    <div className="relative" onMouseLeave={() => hideTooltip()}>
      <svg width={width} height={svgHeight} style={{ width: "100%", height: "100%" }}>
        <Group top={margin.top} left={margin.left}>
          <GridColumns
            scale={xScale}
            height={contentInnerHeight}
            stroke="var(--border)"
            strokeOpacity={0.6}
            strokeDasharray="3 3"
          />

          {rows.map((row, rowIndex) => {
            const rowY = rowIndex * rowStep;
            const values: Array<{ key: SeriesKey; label: TooltipDatum["segment"]; value: number }> = [
              { key: "costValue", label: "Cost value", value: row.costValue },
              { key: "msrpValue", label: "MSRP value", value: row.msrpValue },
            ];

            return (
              <Group key={`row-${rowIndex}-${row.label}`} top={rowY}>
                {values.map((v, idx) => {
                  const impliedMarginValue = Math.max(0, row.msrpValue - row.costValue);
                  const barY = idx * (BAR_HEIGHT + INNER_BAR_GAP);
                  return (
                    <Bar
                      key={`${rowIndex}-${v.key}`}
                      x={0}
                      y={barY}
                      width={xScale(Math.max(0, v.value))}
                      height={BAR_HEIGHT}
                      fill={colorScale(v.key)}
                      rx={BAR_RADIUS}
                      onMouseMove={(evt) => showRowTooltip(evt, row, v.label)}
                      onMouseLeave={() => hideTooltip()}
                    />
                  );
                })}
              </Group>
            );
          })}

          {rows.map((row, rowIndex) => {
            const label = row.label;
            const clickable = Boolean(onTickClick);
            const isHovered = hoveredTick === label;
            const fill = isHovered ? "var(--foreground)" : "var(--muted-foreground)";
            return (
              <text
                key={`tick-${rowIndex}-${label}`}
                x={-8}
                y={rowIndex * rowStep + groupHeight / 2}
                dy="0.33em"
                textAnchor="end"
                fill={fill}
                fontSize={12}
                fontFamily="ui-sans-serif, system-ui"
                style={{
                  cursor: clickable ? "pointer" : "default",
                  textDecoration: clickable && isHovered ? "underline" : "none",
                  userSelect: "none",
                }}
                onMouseEnter={() => {
                  if (!clickable) return;
                  setHoveredTick(label);
                }}
                onMouseLeave={() => setHoveredTick(null)}
                onClick={() => {
                  if (!clickable) return;
                  onTickClick?.(label);
                }}
              >
                {label}
              </text>
            );
          })}

          <AxisBottom
            top={contentInnerHeight}
            scale={xScale}
            hideAxisLine
            tickStroke="var(--border)"
            stroke="var(--border)"
            tickFormat={(v) => asMoney(Number(v))}
            tickLabelProps={() => ({
              fill: "var(--muted-foreground)",
              fontSize: 11,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "middle",
              dy: "0.6em",
            })}
          />

          {/* Hover capture for empty areas (row-level tooltips). */}
          <rect
            x={0}
            y={0}
            width={innerWidth}
            height={contentInnerHeight}
            fill="transparent"
            onMouseLeave={() => hideTooltip()}
            onMouseMove={(evt) => {
              const p = localPoint(evt);
              if (!p) return;
              const x = p.x - margin.left;
              const y = p.y - margin.top;
              if (x < 0 || y < 0 || x > innerWidth || y > contentInnerHeight) {
                hideTooltip();
                return;
              }

              if (rows.length === 0) return;
              const idx = Math.max(0, Math.min(rows.length - 1, Math.floor(y / rowStep)));
              const row = rows[idx];
              if (!row) return;
              const yInRow = y - idx * rowStep;
              if (yInRow < 0 || yInRow > groupHeight) {
                hideTooltip();
                return;
              }

              const mid = BAR_HEIGHT + INNER_BAR_GAP / 2;
              const segment: TooltipDatum["segment"] = yInRow < mid ? "Cost value" : "MSRP value";
              showRowTooltip(evt, row, segment);
            }}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <div
          style={{
            position: "fixed",
            left: tooltipLeft,
            top: tooltipTop,
            transform: "translateY(-50%)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div
          style={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            borderRadius: 10,
            padding: "10px 12px",
            maxWidth: 340,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>{tooltipData.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{tooltipData.insight}</div>
            <div style={{ display: "grid", gap: 2, fontSize: 12 }}>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Units:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.buildable ?? "—"}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Unit cost:</span>{" "}
                <span style={{ fontWeight: 600 }}>
                  {tooltipData.unitCost === undefined ? "—" : asMoney(tooltipData.unitCost)}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Unit MSRP:</span>{" "}
                <span style={{ fontWeight: 600 }}>
                  {tooltipData.unitMsrp == null ? "—" : asMoney(tooltipData.unitMsrp)}
                </span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Cost value:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.costLabel}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>MSRP value:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.msrpLabel}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Implied margin:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.impliedMarginLabel}</span>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MarginByProductVisx({
  itemCosts,
  pillowUnitsByKindSize,
  pillowUnitsByTemplateId,
  height = 0,
}: {
  itemCosts: ItemCost[];
  pillowUnitsByKindSize: Record<string, number>;
  pillowUnitsByTemplateId: Record<string, number>;
  height?: number;
}) {
  const [baseProducts, setBaseProducts] = useState<
    Array<{
      productId: number;
      kind: DrillKind;
      size: string;
      unitCost: number;
      unitMsrp: number | null;
    }>
  >([]);
  const [templates, setTemplates] = useState<BomTemplateRowDb[]>([]);
  const [templateLines, setTemplateLines] = useState<BomTemplateLineRowDb[]>([]);
  const [selectedKind, setSelectedKind] = useState<DrillKind | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const costByItemId = useMemo(() => new Map(itemCosts.map((i) => [i.id, i.cost])), [itemCosts]);
  const unitsByKindSize = useMemo(() => {
    const m = new Map<string, number>();
    Object.entries(pillowUnitsByKindSize ?? {}).forEach(([k, v]) => {
      const n = Number(v ?? 0);
      if (!Number.isFinite(n) || n <= 0) return;
      m.set(k, n);
    });
    return m;
  }, [pillowUnitsByKindSize]);
  const unitsByTemplateId = useMemo(() => {
    const m = new Map<number, number>();
    Object.entries(pillowUnitsByTemplateId ?? {}).forEach(([k, v]) => {
      const id = Number(k);
      const n = Number(v ?? 0);
      if (!Number.isFinite(id) || id <= 0) return;
      if (!Number.isFinite(n) || n <= 0) return;
      m.set(id, n);
    });
    return m;
  }, [pillowUnitsByTemplateId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [
          { data: products, error: pErr },
          { data: bomLines, error: blErr },
          { data: prices, error: prErr },
          { data: templateRows, error: tErr },
          { data: templateLineRows, error: tlErr },
        ] = await Promise.all([
          supabaseClient.from("pillow_products").select("id,kind,size,is_active").eq("is_active", true),
          supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
          supabaseClient.from("product_prices").select("product_id,msrp,currency").eq("kind", "pillow"),
          supabaseClient
            .from("bom_templates")
            .select("id,kind,key,name,pillow_kind,pillow_variant")
            .eq("kind", "pillow"),
          supabaseClient.from("bom_template_lines").select("template_id,item_id,quantity"),
        ]);
        if (pErr) throw new Error(pErr.message);
        if (blErr) throw new Error(blErr.message);
        if (prErr) throw new Error(prErr.message);
        if (tErr) throw new Error(tErr.message);
        if (tlErr) throw new Error(tlErr.message);

        const msrpById = new Map<number, number | null>();
        (prices ?? []).forEach((r: ProductPriceRowDb) => {
          const id = Number(r.product_id);
          const msrp = r.msrp === null || r.msrp === undefined ? null : Number(r.msrp);
          if (!Number.isFinite(id) || id <= 0) return;
          msrpById.set(id, msrp !== null && Number.isFinite(msrp) ? msrp : null);
        });

        const linesByProductId = new Map<number, Array<{ item_id: number; quantity: number }>>();
        (bomLines ?? []).forEach((l: BomLineRowDb) => {
          const pid = Number(l.product_id);
          const iid = Number(l.item_id);
          const qty = l.quantity === null || l.quantity === undefined ? NaN : Number(l.quantity);
          if (!Number.isFinite(pid) || pid <= 0) return;
          if (!Number.isFinite(iid) || iid <= 0) return;
          if (!Number.isFinite(qty) || qty <= 0) return;
          const arr = linesByProductId.get(pid) ?? [];
          arr.push({ item_id: iid, quantity: qty });
          linesByProductId.set(pid, arr);
        });

        const next = (products ?? []).flatMap((p: PillowProductRowDb) => {
          const id = Number(p.id);
          const kindRaw = String(p.kind ?? "basic").toLowerCase();
          const kind: DrillKind | null = kindRaw === "premium" ? "premium" : kindRaw === "basic" ? "basic" : null;
          const size = (p.size ?? null) as string | null;
          if (!kind || !size) return [];
          const unitMsrp = msrpById.get(id) ?? null;
          const lines = linesByProductId.get(id) ?? [];
          const unitCost = lines.reduce((sum, line) => {
            const cost = costByItemId.get(line.item_id);
            const c = cost === null || cost === undefined ? 0 : Number(cost);
            return sum + (Number.isFinite(c) ? c : 0) * line.quantity;
          }, 0);
          return [{
            productId: id,
            kind,
            size,
            unitCost,
            unitMsrp,
          }];
        });

        next.sort((a, b) => b.size.localeCompare(a.size));

        if (cancelled) return;
        setBaseProducts(next);
        setTemplates((templateRows ?? []) as unknown as BomTemplateRowDb[]);
        setTemplateLines((templateLineRows ?? []) as unknown as BomTemplateLineRowDb[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load product analytics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [costByItemId]);

  const unitMsrpByKindSize = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const row of baseProducts) {
      m.set(`${row.kind}:${row.size}`, row.unitMsrp);
    }
    return m;
  }, [baseProducts]);

  const linesByTemplateId = useMemo(() => {
    const m = new Map<number, Array<{ itemId: number; quantity: number }>>();
    for (const row of templateLines) {
      const tid = Number(row.template_id);
      const iid = Number(row.item_id);
      const qty = row.quantity === null || row.quantity === undefined ? NaN : Number(row.quantity);
      if (!Number.isFinite(tid) || tid <= 0) continue;
      if (!Number.isFinite(iid) || iid <= 0) continue;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const arr = m.get(tid) ?? [];
      arr.push({ itemId: iid, quantity: qty });
      m.set(tid, arr);
    }
    return m;
  }, [templateLines]);

  const productsWithValues = useMemo(() => {
    return baseProducts.map((row) => {
      const units = unitsByKindSize.get(`${row.kind}:${row.size}`) ?? 0;
      const costValue = row.unitCost * units;
      const msrpValue = row.unitMsrp === null ? 0 : row.unitMsrp * units;
      return {
        productId: row.productId,
        kind: row.kind,
        size: row.size,
        units,
        unitCost: row.unitCost,
        unitMsrp: row.unitMsrp,
        costValue,
        msrpValue,
      };
    });
  }, [baseProducts, unitsByKindSize]);

  const kindRows = useMemo<MetricRow[]>(() => {
    const byKind = new Map<DrillKind, { cost: number; msrp: number }>();
    for (const row of productsWithValues) {
      const current = byKind.get(row.kind) ?? { cost: 0, msrp: 0 };
      current.cost += row.costValue;
      current.msrp += row.msrpValue;
      byKind.set(row.kind, current);
    }
    return (["basic", "premium"] as const)
      .map((kind) => {
        const agg = byKind.get(kind) ?? { cost: 0, msrp: 0 };
        return {
          label: kind === "basic" ? "Basic" : "Premium",
          costValue: agg.cost,
          msrpValue: agg.msrp,
          meta: { level: "kind" as const, kind },
        };
      })
      .filter((r) => r.costValue > 0 || r.msrpValue > 0);
  }, [productsWithValues]);

  const sizeRows = useMemo<MetricRow[]>(() => {
    if (!selectedKind) return [];
    const rows = productsWithValues
      .filter((r) => r.kind === selectedKind)
      .map((r) => ({
        label: r.size,
        costValue: r.costValue,
        msrpValue: r.msrpValue,
        meta: {
          level: "size" as const,
          kind: selectedKind,
          size: r.size,
          buildable: r.units,
          unitCost: r.unitCost,
          unitMsrp: r.unitMsrp,
        },
      }));
    rows.sort((a, b) => b.msrpValue - a.msrpValue || a.label.localeCompare(b.label));
    return rows;
  }, [productsWithValues, selectedKind]);

  const templateRows = useMemo<MetricRow[]>(() => {
    if (!selectedKind || !selectedSize) return [];
    const key = selectedSize;
    const kind = selectedKind;
    const msrp = unitMsrpByKindSize.get(`${kind}:${key}`) ?? null;

    const relevantTemplates = templates
      .filter((t) => String(t.kind) === "pillow")
      .filter((t) => (t.pillow_kind ?? "basic") === kind)
      .filter((t) => String(t.key ?? "") === key);

    const out: MetricRow[] = relevantTemplates.map((t) => {
      const templateId = Number(t.id);
      const lines = linesByTemplateId.get(templateId) ?? [];

      const unitCost = lines.reduce((sum, line) => {
        const cost = costByItemId.get(line.itemId);
        const c = cost === null || cost === undefined ? 0 : Number(cost);
        return sum + (Number.isFinite(c) ? c : 0) * line.quantity;
      }, 0);

      const units =
        (Number.isFinite(templateId) ? unitsByTemplateId.get(templateId) : undefined) ??
        (unitsByKindSize.get(`${kind}:${key}`) ?? 0);

      const costValue = unitCost * units;
      const msrpValue = msrp === null ? 0 : msrp * units;

      const variant = kind === "premium" && t.pillow_variant ? ` · ${t.pillow_variant}` : "";
      const templateName = String(t.name ?? "Template");
      const label = `Pillow · ${kind.toUpperCase()} · ${key}${variant} — ${templateName}`;

      return {
        label,
        costValue,
        msrpValue,
        meta: {
          level: "template" as const,
          kind,
          size: key,
          templateId: Number.isFinite(templateId) ? templateId : undefined,
          buildable: units,
          unitCost,
          unitMsrp: msrp,
        },
      };
    });

    out.sort((a, b) => b.msrpValue - a.msrpValue || a.label.localeCompare(b.label));
    return out;
  }, [
    selectedKind,
    selectedSize,
    templates,
    linesByTemplateId,
    costByItemId,
    unitMsrpByKindSize,
    unitsByKindSize,
    unitsByTemplateId,
  ]);

  const level: DrillLevel = selectedKind ? (selectedSize ? "template" : "size") : "kind";
  const chartRows = level === "kind" ? kindRows : level === "size" ? sizeRows : templateRows;

  const headerText =
    level === "kind"
      ? "Click Basic or Premium to drill down."
      : level === "size"
        ? `Click a size to view BOM templates for ${selectedKind?.toUpperCase() ?? ""}.`
        : `Templates for ${selectedKind?.toUpperCase() ?? ""} · ${selectedSize ?? ""}`;

  if (loading) {
    return <div className="h-[320px] w-full animate-pulse rounded-xl bg-muted" />;
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (baseProducts.length === 0) {
    return <div className="text-sm text-muted-foreground">No product rows found yet.</div>;
  }

  const chartHeight = (() => {
    const margin = defaultMargin;
    const BAR_HEIGHT = 16;
    const INNER_BAR_GAP = 4;
    const ROW_GAP = 10;
    const groupHeight = BAR_HEIGHT * 2 + INNER_BAR_GAP;
    const rowStep = groupHeight + ROW_GAP;
    const contentInnerHeight = chartRows.length > 0 ? Math.max(10, chartRows.length * rowStep - ROW_GAP) : 180;
    return Math.max(height, contentInnerHeight + margin.top + margin.bottom);
  })();

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{headerText}</div>
        <div className="flex items-center gap-2">
          {selectedSize && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedSize(null);
              }}
            >
              Back to sizes
            </Button>
          )}
          {selectedKind && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedSize(null);
                setSelectedKind(null);
              }}
            >
              Back to kind
            </Button>
          )}
        </div>
      </div>
      <div className="w-full" style={{ height: chartHeight }}>
        {chartRows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            {level === "template"
              ? "No BOM templates found for this kind and size yet."
              : "No product margin data available yet."}
          </div>
        ) : (
          <ParentSize>
            {({ width }) =>
              width < 10 ? null : (
                <Chart
                  width={width}
                  height={chartHeight}
                  rows={chartRows}
                  onTickClick={
                    level === "kind"
                      ? (label) => {
                          const normalized = label.trim().toLowerCase();
                          if (normalized === "basic") setSelectedKind("basic");
                          if (normalized === "premium") setSelectedKind("premium");
                        }
                      : level === "size"
                        ? (label) => {
                            setSelectedSize(label);
                          }
                        : undefined
                  }
                />
              )
            }
          </ParentSize>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {legend.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ background: l.color }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

