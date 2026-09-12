"use client";

import { useMemo } from "react";

import { qrMatrix } from "@/lib/qr/qr-matrix";

/**
 * QR of a short URL as an inline SVG — no dependency, no external service, so
 * it renders on a studio machine behind a network policy that allows nothing.
 * Shared by the partner Referral card and the Staff Assist link card.
 */
export function QrSvg({
  text,
  px = 168,
  label = "QR code",
}: {
  text: string;
  px?: number;
  label?: string;
}) {
  const matrix = useMemo(() => qrMatrix(text), [text]);
  const n = matrix.length;
  const quiet = 4;
  const dim = n + quiet * 2;
  let d = "";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (matrix[r][c]) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${dim} ${dim}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      {/* QR needs a fixed light quiet zone + dark modules regardless of theme. */}
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
