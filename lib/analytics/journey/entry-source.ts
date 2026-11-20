export type EntrySourceInput = {
  search?: string | null;
  referrer?: string | null;
};

export type ResolvedEntrySource = {
  entrySource: string;
  entryMedium: string | null;
  entryCampaign: string | null;
  referrerHost: string | null;
  entryContent: string | null;
  entryTerm: string | null;
  clickIdKind: ClickIdKind | null;
  clickId: string | null;
  ref: string | null;
};

export const CLICK_ID_KINDS = ["gclid", "gbraid", "wbraid", "ttclid", "msclkid", "fbclid"] as const;
export type ClickIdKind = (typeof CLICK_ID_KINDS)[number];

const CLICK_ID_MAX = 512;

function resolveClickId(params: URLSearchParams): { clickIdKind: ClickIdKind | null; clickId: string | null } {
  for (const kind of CLICK_ID_KINDS) {
    const value = trimOrNull(params.get(kind));
    if (value && value.length <= CLICK_ID_MAX) return { clickIdKind: kind, clickId: value };
  }
  return { clickIdKind: null, clickId: null };
}

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
    } catch {}
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

export function resolveEntrySource(input: EntrySourceInput): ResolvedEntrySource {
  const params = parseSearchParams(input.search);
  const utmSource = trimOrNull(params.get("utm_source"));
  const utmMedium = trimOrNull(params.get("utm_medium"));
  const utmCampaign = trimOrNull(params.get("utm_campaign"));
  const ref = trimOrNull(params.get("ref"));
  const host = referrerHost(input.referrer);
  const click = resolveClickId(params);

  if (utmSource) {
    return {
      entrySource: utmSource,
      entryMedium: utmMedium,
      entryCampaign: utmCampaign,
      referrerHost: host,
      entryContent: trimOrNull(params.get("utm_content")),
      entryTerm: trimOrNull(params.get("utm_term")),
      ...click,
      ref,
    };
  }
  const untagged = { entryMedium: null, entryCampaign: null, entryContent: null, entryTerm: null, ...click, ref };
  if (host) return { entrySource: host, referrerHost: host, ...untagged };
  return { entrySource: "Direct", referrerHost: null, ...untagged };
}
