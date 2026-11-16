import Image from "next/image";
import { toWebUrl } from "@/lib/format/web-url";

/**
 * How a partner's card will read on /our-partners: logo (or initial), name,
 * the first lines of the write-up and the website. A static stand-in for the
 * real card, for screens that show a listing before it is live.
 */
export function ListingPreview({
  name,
  logoUrl,
  description,
  website,
}: {
  name: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
}) {
  const href = toWebUrl(website);
  const host = href ? new URL(href).hostname.replace(/^www\./, "") : null;

  return (
    <div className="flex flex-col items-center rounded-2xl border bg-card/40 p-6 text-center">
      <div className="flex h-20 w-full items-center justify-center">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={name}
            width={64}
            height={64}
            className="max-h-16 w-auto max-w-full object-contain"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
            {name.charAt(0)}
          </div>
        )}
      </div>
      <div className="mt-4 text-base font-semibold">{name}</div>
      {description ? (
        <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</div>
      ) : null}
      {host ? <div className="mt-2 text-xs text-muted-foreground">{host}</div> : null}
    </div>
  );
}
