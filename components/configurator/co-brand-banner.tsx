import Image from "next/image";
import { LOGO_SRC } from "@/lib/brand-logo";

/**
 * Co-brand finish-panel banner for a partner-assisted run (#78): the partner's
 * uploaded logo beside the Mpillow logo, "[Partner] × Mpillow", and the
 * partner's description. Rendered ONLY when a partner context is present, so
 * guest/staff flows are pixel-unchanged.
 */
export function CoBrandBanner({
  partner,
}: {
  partner: { name: string; logoUrl: string | null; description: string | null };
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-3">
        {partner.logoUrl ? (
          <Image
            src={partner.logoUrl}
            alt={partner.name}
            width={120}
            height={40}
            className="h-9 w-auto max-w-[120px] object-contain"
          />
        ) : (
          <span className="text-sm font-semibold">{partner.name}</span>
        )}
        <span aria-hidden className="text-lg text-muted-foreground">
          ×
        </span>
        <Image
          src={LOGO_SRC}
          unoptimized
          alt="Mpillow"
          width={40}
          height={40}
          className="h-9 w-auto object-contain"
        />
      </div>
      <p className="text-sm font-medium">{partner.name} × Mpillow</p>
      {partner.description ? (
        <p className="text-sm text-muted-foreground">{partner.description}</p>
      ) : null}
    </div>
  );
}
