const r1 = (n: number) => Math.round(n * 10) / 10;

export const SNAP_WORDS = { home: "home", centred: "centred", "front edge": "flush front", "back edge": "flush back" } as const;

export function landingText(startMm: number, endMm: number, snap?: keyof typeof SNAP_WORDS | null): string {
  return `${Math.round(startMm)}–${Math.round(endMm)} mm${snap ? ` · ${SNAP_WORDS[snap]}` : ""}`;
}

export function acrossText(mm: number): string {
  const r = Math.round(mm);
  return r === 0 ? "" : `${Math.abs(r)} mm ${r < 0 ? "left" : "right"}`;
}

export function badgeWidth(text: string, font: number): number {
  return text.length * font * 0.58 + font * 1.2;
}

export function DragBadge({
  text,
  x = 0,
  y,
  font,
  within,
}: {
  text: string;
  x?: number;
  y: number;
  font: number;
  within?: readonly [number, number];
}) {
  const w = badgeWidth(text, font);
  const h = font * 1.7;
  const at = within ? Math.min(Math.max(x, within[0] + w / 2), Math.max(within[0] + w / 2, within[1] - w / 2)) : x;
  return (
    <g transform={`translate(${r1(at)} ${r1(y)})`} pointerEvents="none" data-xray-drag-badge>
      <rect x={r1(-w / 2)} y={r1(-h / 2)} width={r1(w)} height={r1(h)} rx={r1(h / 2)} fill="rgba(2,6,23,0.82)" />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={600} fill="white" className="select-none tabular-nums">
        {text}
      </text>
    </g>
  );
}
