/**
 * Entry source resolution (Visit start).
 * Precedence: UTM (utm_source) → referrer host → Direct.
 * Distinct from Discovery source (self-reported on Result).
 */

export type EntrySourceInput = {
  /** Query string (`?utm_…`), raw params, or full URL. */
  search?: string | null;
  /** document.referrer or equivalent. */
  referrer?: string | null;
};

export type ResolvedEntrySource = {
  entrySource: string;
  entryMedium: string | null;
  entryCampaign: string | null;
  referrerHost: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseSearchParams(search: string | null | undefined): URLSearchParams {
  if (!search?.trim()) return new URLSearchParams();
  const raw = search.trim();
  if (raw.includes("://")) {
    try {
      return new URL(raw).searchParams;
    } catch {
      // fall through
    }
  }
  const q = raw.startsWith("?") ? raw.slice(1) : raw;
  return new URLSearchParams(q);
}

export function referrerHost(referrer: string | null | undefined): string | null {
  const raw = trimOrNull(referrer);
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    return trimOrNull(host);
  } catch {
    return null;
  }
}

/** Resolve frozen Entry source fields for a Visit INSERT. */
export function resolveEntrySource(input: EntrySourceInput): ResolvedEntrySource {
  const params = parseSearchParams(input.search);
  const utmSource = trimOrNull(params.get("utm_source"));
  const utmMedium = trimOrNull(params.get("utm_medium"));
  const utmCampaign = trimOrNull(params.get("utm_campaign"));
  const host = referrerHost(input.referrer);

  if (utmSource) {
    return {
      entrySource: utmSource,
      entryMedium: utmMedium,
      entryCampaign: utmCampaign,
      referrerHost: host,
    };
  }
  if (host) {
    return {
      entrySource: host,
      entryMedium: null,
      entryCampaign: null,
      referrerHost: host,
    };
  }
  return {
    entrySource: "Direct",
    entryMedium: null,
    entryCampaign: null,
    referrerHost: null,
  };
}
