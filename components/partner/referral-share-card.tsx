"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClientSiteOrigin } from "@/lib/site-url";
import { qrMatrix } from "@/lib/qr/qr-matrix";

type Props = {
  /** The approved partner's referral code (e.g. from ensureReferralCode). */
  code: string;
  /**
   * Public site origin. Pass the server-resolved `getSiteOrigin()` from the hub
   * page for SSR-consistent output; falls back to the client origin otherwise.
   */
  siteOrigin?: string;
};

/** QR of the referral link as an inline SVG — no dependency, no external service. */
function QrSvg({ text, px = 168 }: { text: string; px?: number }) {
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
      aria-label="Referral link QR code"
    >
      {/* QR needs a fixed light quiet zone + dark modules regardless of theme. */}
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}

export function ReferralShareCard({ code, siteOrigin }: Props) {
  const origin = siteOrigin ?? getClientSiteOrigin();
  const link = `${origin}/?ref=${code}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link stays selectable in the input */
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <Label className="text-base font-semibold">Your referral code</Label>
        <p className="font-mono text-2xl tracking-widest">{code}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="referral-link">Share link</Label>
        <div className="flex gap-2">
          <Input
            id="referral-link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-sm"
          />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Anyone who visits this link is attributed to you for 30 days.
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="rounded-md bg-white p-2">
          <QrSvg text={link} />
        </div>
        <p className="text-sm text-muted-foreground">Scan to open your link</p>
      </div>
    </div>
  );
}
