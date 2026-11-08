/**
 * Where a held filling would land, in a pill over it (precise by default,
 * 8-11-2026): millimetres from the Section's front and the snap that put it
 * there, drawn above the pouch so a finger on a phone never covers it. Both
 * x-ray views draw it, in their own view units.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** What a snap says on the badge and in the line under the cut. */
export const SNAP_WORDS = { home: "home", centred: "centred", "front edge": "flush front", "back edge": "flush back" } as const;

/** "85–165 mm · centred": where it lands front ↔ back, mm from the Section's front. */
export function landingText(startMm: number, endMm: number, snap?: keyof typeof SNAP_WORDS | null): string {
  return `${Math.round(startMm)}–${Math.round(endMm)} mm${snap ? ` · ${SNAP_WORDS[snap]}` : ""}`;
}

export function DragBadge({ text, x = 0, y, font }: { text: string; x?: number; y: number; font: number }) {
  const w = text.length * font * 0.58 + font * 1.2;
  const h = font * 1.7;
  return (
    <g transform={`translate(${r1(x)} ${r1(y)})`} pointerEvents="none" data-xray-drag-badge>
      <rect x={r1(-w / 2)} y={r1(-h / 2)} width={r1(w)} height={r1(h)} rx={r1(h / 2)} fill="rgba(2,6,23,0.82)" />
      <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={font} fontWeight={600} fill="white" className="select-none tabular-nums">
        {text}
      </text>
    </g>
  );
}
