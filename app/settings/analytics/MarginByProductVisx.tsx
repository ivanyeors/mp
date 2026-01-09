"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Group } from "@visx/group";
import { BarGroupHorizontal, Bar } from "@visx/shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { scaleBand, scaleLinear, scaleOrdinal } from "@visx/scale";
import { ParentSize } from "@visx/responsive";
import { useTooltip } from "@visx/tooltip";

type ItemCost = { id: number; cost: number | null };

type ProductRow = {
  productId: number;
  kind: string | null;
  size: string | null;
  buildable: number;
  unitCost: number;
  unitMsrp: number | null;
  costValue: number;
  msrpValue: number;
  label: string;
};

type TooltipDatum = {
  label: string;
  segment: "Cost value" | "MSRP value";
  buildable: number;
  unitCost: number;
  unitMsrp: number | null;
  costValue: number;
  msrpValue: number;
  costLabel: string;
  msrpLabel: string;
  impliedMarginLabel: string;
  insight: string;
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

function insightFor(row: ProductRow) {
  if (row.buildable <= 0) return "No buildable units from current inventory.";
  if (row.unitMsrp === null) return "Missing MSRP for this product price.";
  if (row.msrpValue <= 0) return "No priced value computed yet.";
  const impliedMarginValue = Math.max(0, row.msrpValue - row.costValue);
  const marginPct = row.msrpValue > 0 ? (impliedMarginValue / row.msrpValue) * 100 : null;
  if (marginPct === null) return "Missing pricing inputs.";
  if (marginPct < 25) return "Low product margin: review BOM costs and MSRP.";
  if (marginPct < 40) return "Below 40% target: cost or price adjustments needed.";
  return "Healthy product margin at current pricing.";
}

const defaultMargin = { top: 16, right: 20, bottom: 32, left: 190 };

function Chart({ width, height, rows }: { width: number; height: number; rows: ProductRow[] }) {
  const margin = defaultMargin;
  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = Math.max(10, height - margin.top - margin.bottom);

  const { tooltipData, tooltipLeft, tooltipTop, tooltipOpen, showTooltip, hideTooltip } =
    useTooltip<TooltipDatum>();

  const xDomainMax = useMemo(() => {
    const max = Math.max(...rows.map((d) => Math.max(d.costValue, d.msrpValue)), 0);
    return Math.max(1, max * 1.08);
  }, [rows]);

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: rows.map((d) => d.label),
        range: [0, innerHeight],
        padding: 0.2,
      }),
    [innerHeight, rows]
  );

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
      <svg width={width} height={height} style={{ width: "100%", height: "100%" }}>
        <Group top={margin.top} left={margin.left}>
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke="var(--border)"
            strokeOpacity={0.6}
            strokeDasharray="3 3"
          />

          {/* 2 bars per product row: cost vs MSRP (stacked vertically within the row) */}
          {(() => {
            const y0Scale = yScale;
            const y1Scale = scaleBand<string>({
              domain: seriesKeys as unknown as string[],
              range: [0, y0Scale.bandwidth()],
              padding: 0.18,
            });

            return (
              <BarGroupHorizontal
                data={rows as any}
                keys={seriesKeys as unknown as string[]}
                width={innerWidth}
                y0={(d: any) => d.label}
                y0Scale={y0Scale}
                y1Scale={y1Scale}
                xScale={xScale}
                color={(key) => colorScale(key as SeriesKey)}
              >
                {(barGroups) =>
                  barGroups.map((barGroup) => (
                    <Group key={`bar-group-${barGroup.index}-${barGroup.y0}`} top={barGroup.y0}>
                      {barGroup.bars.map((bar) => {
                        const row = rows[barGroup.index];
                        const segment = bar.key === "costValue" ? ("Cost value" as const) : ("MSRP value" as const);
                        const impliedMarginValue = Math.max(0, row.msrpValue - row.costValue);
                        return (
                          <Bar
                            key={`${barGroup.index}-${bar.index}-${bar.key}`}
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={bar.height}
                            fill={bar.color}
                            rx={8}
                            onMouseMove={(evt) => {
                              const el = evt.currentTarget as unknown as Element;
                              const bounds = el.getBoundingClientRect();
                              const left = Math.min(window.innerWidth - 16, bounds.right + 12);
                              const top = Math.min(window.innerHeight - 16, Math.max(16, bounds.top + bounds.height / 2));

                              showTooltip({
                                tooltipData: {
                                  label: row.label,
                                  segment,
                                  buildable: row.buildable,
                                  unitCost: row.unitCost,
                                  unitMsrp: row.unitMsrp,
                                  costValue: row.costValue,
                                  msrpValue: row.msrpValue,
                                  costLabel: asMoney(row.costValue),
                                  msrpLabel: asMoney(row.msrpValue),
                                  impliedMarginLabel: asMoney(impliedMarginValue),
                                  insight: insightFor(row),
                                },
                                tooltipLeft: left,
                                tooltipTop: top,
                              });
                            }}
                            onMouseLeave={() => hideTooltip()}
                          />
                        );
                      })}
                    </Group>
                  ))
                }
              </BarGroupHorizontal>
            );
          })()}

          <AxisLeft
            scale={yScale}
            hideAxisLine
            hideTicks
            tickLabelProps={() => ({
              fill: "var(--foreground)",
              fontSize: 12,
              fontFamily: "ui-sans-serif, system-ui",
              textAnchor: "end",
              dx: "-0.4em",
              dy: "0.33em",
            })}
          />

          <AxisBottom
            top={innerHeight}
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
                <span style={{ color: "var(--muted-foreground)" }}>Buildable:</span>{" "}
                <span style={{ fontWeight: 600 }}>{tooltipData.buildable}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Unit cost:</span>{" "}
                <span style={{ fontWeight: 600 }}>{asMoney(tooltipData.unitCost)}</span>
              </div>
              <div>
                <span style={{ color: "var(--muted-foreground)" }}>Unit MSRP:</span>{" "}
                <span style={{ fontWeight: 600 }}>
                  {tooltipData.unitMsrp === null ? "—" : asMoney(tooltipData.unitMsrp)}
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
  height = 320,
}: {
  itemCosts: ItemCost[];
  height?: number;
}) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const costByItemId = useMemo(() => new Map(itemCosts.map((i) => [i.id, i.cost])), [itemCosts]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [{ data: products, error: pErr }, { data: buildableRows, error: bErr }, { data: bomLines, error: blErr }, { data: prices, error: prErr }] =
          await Promise.all([
            supabaseClient.from("pillow_products").select("id,kind,size,is_active").eq("is_active", true),
            supabaseClient.from("product_buildable").select("product_id,kind,size,buildable"),
            supabaseClient.from("bom_lines").select("product_id,item_id,quantity"),
            supabaseClient.from("product_prices").select("product_id,msrp,currency").eq("kind", "pillow"),
          ]);
        if (pErr) throw new Error(pErr.message);
        if (bErr) throw new Error(bErr.message);
        if (blErr) throw new Error(blErr.message);
        if (prErr) throw new Error(prErr.message);

        const buildableById = new Map<number, number>();
        (buildableRows ?? []).forEach((r: any) => buildableById.set(Number(r.product_id), Math.max(0, Number(r.buildable ?? 0))));

        const msrpById = new Map<number, number | null>();
        (prices ?? []).forEach((r: any) => {
          const id = Number(r.product_id);
          const msrp = r.msrp === null || r.msrp === undefined ? null : Number(r.msrp);
          if (Number.isFinite(id) && id > 0) msrpById.set(id, Number.isFinite(msrp as number) ? (msrp as number) : null);
        });

        const linesByProductId = new Map<number, Array<{ item_id: number; quantity: number }>>();
        (bomLines ?? []).forEach((l: any) => {
          const pid = Number(l.product_id);
          const iid = Number(l.item_id);
          const qty = Number(l.quantity);
          if (!Number.isFinite(pid) || pid <= 0) return;
          if (!Number.isFinite(iid) || iid <= 0) return;
          if (!Number.isFinite(qty) || qty <= 0) return;
          const arr = linesByProductId.get(pid) ?? [];
          arr.push({ item_id: iid, quantity: qty });
          linesByProductId.set(pid, arr);
        });

        const next: ProductRow[] = (products ?? []).map((p: any) => {
          const id = Number(p.id);
          const kind = (p.kind ?? "basic") as string;
          const size = (p.size ?? null) as string | null;
          const buildable = buildableById.get(id) ?? 0;
          const unitMsrp = msrpById.get(id) ?? null;
          const lines = linesByProductId.get(id) ?? [];
          const unitCost = lines.reduce((sum, line) => {
            const cost = costByItemId.get(line.item_id);
            const c = cost === null || cost === undefined ? 0 : Number(cost);
            return sum + (Number.isFinite(c) ? c : 0) * line.quantity;
          }, 0);
          const costValue = unitCost * buildable;
          const msrpValue = unitMsrp === null ? 0 : unitMsrp * buildable;
          const label = `Pillow · ${kind.toUpperCase()} · ${size ?? "?"}`;
          return {
            productId: id,
            kind,
            size,
            buildable,
            unitCost,
            unitMsrp,
            costValue,
            msrpValue,
            label,
          };
        });

        // Show the most "material" products first.
        next.sort((a, b) => b.msrpValue - a.msrpValue);

        if (!cancelled) setRows(next.slice(0, 10));
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

  if (loading) {
    return <div className="h-[320px] w-full animate-pulse rounded-xl bg-muted" />;
  }

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>;
  }

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No product rows found yet.</div>;
  }

  return (
    <div className="w-full space-y-3">
      <div className="h-[320px] w-full">
        <ParentSize>
          {({ width }) => (width < 10 ? null : <Chart width={width} height={height} rows={rows} />)}
        </ParentSize>
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

