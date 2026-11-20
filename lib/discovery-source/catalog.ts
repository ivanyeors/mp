import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { DEFAULT_DISCOVERY_SOURCE_CATALOG } from "./defaults";
import {
  OTHER_DISCOVERY_SOURCE_ID,
  type DiscoverySourceCatalog,
  type DiscoverySourceLabels,
  type DiscoverySourceOption,
} from "./types";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseLabels(raw: unknown): DiscoverySourceLabels | null {
  if (!isPlainObject(raw)) return null;
  const en = typeof raw["en-US"] === "string" ? raw["en-US"].trim() : "";
  const zh = typeof raw["zh-CN"] === "string" ? raw["zh-CN"].trim() : "";
  if (!en) return null;
  return { "en-US": en, "zh-CN": zh || en };
}

function parseOption(raw: unknown): DiscoverySourceOption | null {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_RE.test(id)) return null;
  const labels = parseLabels(raw.labels);
  if (!labels) return null;
  return {
    id,
    labels,
    active: raw.active !== false,
    system: raw.system === true || id === OTHER_DISCOVERY_SOURCE_ID,
  };
}

export function normalizeDiscoverySourceCatalog(
  catalog: DiscoverySourceCatalog,
): DiscoverySourceCatalog {
  const byId = new Map<string, DiscoverySourceOption>();
  for (const opt of catalog.options) {
    if (!ID_RE.test(opt.id)) continue;
    const labels = parseLabels(opt.labels);
    if (!labels) continue;
    byId.set(opt.id, {
      id: opt.id,
      labels,
      active: opt.id === OTHER_DISCOVERY_SOURCE_ID ? true : opt.active !== false,
      system: opt.system === true || opt.id === OTHER_DISCOVERY_SOURCE_ID,
    });
  }

  const seedOther = DEFAULT_DISCOVERY_SOURCE_CATALOG.options.find(
    (o) => o.id === OTHER_DISCOVERY_SOURCE_ID,
  )!;
  const other = byId.get(OTHER_DISCOVERY_SOURCE_ID) ?? seedOther;
  byId.set(OTHER_DISCOVERY_SOURCE_ID, {
    ...other,
    id: OTHER_DISCOVERY_SOURCE_ID,
    active: true,
    system: true,
    labels: parseLabels(other.labels) ?? seedOther.labels,
  });

  const ordered: DiscoverySourceOption[] = [];
  for (const opt of catalog.options) {
    if (opt.id === OTHER_DISCOVERY_SOURCE_ID) continue;
    const kept = byId.get(opt.id);
    if (kept && !ordered.some((o) => o.id === kept.id)) ordered.push(kept);
  }
  for (const opt of byId.values()) {
    if (opt.id === OTHER_DISCOVERY_SOURCE_ID) continue;
    if (!ordered.some((o) => o.id === opt.id)) ordered.push(opt);
  }
  ordered.push(byId.get(OTHER_DISCOVERY_SOURCE_ID)!);

  return { options: ordered };
}

export function parseDiscoverySourceCatalog(
  raw: string | null | undefined,
): DiscoverySourceCatalog {
  if (raw == null || raw.trim() === "") {
    return normalizeDiscoverySourceCatalog(DEFAULT_DISCOVERY_SOURCE_CATALOG);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const optionsRaw = isPlainObject(parsed)
      ? parsed.options
      : Array.isArray(parsed)
        ? parsed
        : null;
    if (!Array.isArray(optionsRaw)) {
      return normalizeDiscoverySourceCatalog(DEFAULT_DISCOVERY_SOURCE_CATALOG);
    }
    const options = optionsRaw
      .map(parseOption)
      .filter((o): o is DiscoverySourceOption => o != null);
    if (options.length === 0) {
      return normalizeDiscoverySourceCatalog(DEFAULT_DISCOVERY_SOURCE_CATALOG);
    }
    return normalizeDiscoverySourceCatalog({ options });
  } catch {
    return normalizeDiscoverySourceCatalog(DEFAULT_DISCOVERY_SOURCE_CATALOG);
  }
}

export function serializeDiscoverySourceCatalog(
  catalog: DiscoverySourceCatalog,
): string {
  return JSON.stringify(normalizeDiscoverySourceCatalog(catalog));
}

export function activeDiscoverySourceOptions(
  catalog: DiscoverySourceCatalog,
): DiscoverySourceOption[] {
  const normalized = normalizeDiscoverySourceCatalog(catalog);
  return normalized.options.filter((o) => o.active);
}

export function findDiscoverySourceOption(
  catalog: DiscoverySourceCatalog,
  id: string,
): DiscoverySourceOption | undefined {
  return normalizeDiscoverySourceCatalog(catalog).options.find((o) => o.id === id);
}

export function resolveDiscoverySourceLabel(
  catalog: DiscoverySourceCatalog,
  id: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  if (id == null || id === "") return null;
  const opt = findDiscoverySourceOption(catalog, id);
  if (!opt) return id;
  return opt.labels[locale] ?? opt.labels[DEFAULT_LOCALE] ?? id;
}

export function archiveDiscoverySourceOption(
  catalog: DiscoverySourceCatalog,
  id: string,
): DiscoverySourceCatalog {
  if (id === OTHER_DISCOVERY_SOURCE_ID) {
    return normalizeDiscoverySourceCatalog(catalog);
  }
  return normalizeDiscoverySourceCatalog({
    options: catalog.options.map((o) =>
      o.id === id ? { ...o, active: false } : o,
    ),
  });
}

export function assertCatalogAllowsSave(
  catalog: DiscoverySourceCatalog,
): { ok: true; catalog: DiscoverySourceCatalog } | { ok: false; error: string } {
  const hasOther = catalog.options.some((o) => o.id === OTHER_DISCOVERY_SOURCE_ID);
  if (!hasOther) {
    return { ok: false, error: "Other is a fixed system option and can't be removed." };
  }
  const other = catalog.options.find((o) => o.id === OTHER_DISCOVERY_SOURCE_ID)!;
  if (other.active === false) {
    return { ok: false, error: "Other can't be archived." };
  }
  const ids = catalog.options.map((o) => o.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Two options share the same id." };
  }
  for (const o of catalog.options) {
    if (!ID_RE.test(o.id)) {
      return { ok: false, error: `Invalid option id: ${o.id}` };
    }
    if (!o.labels["en-US"]?.trim()) {
      return { ok: false, error: `Missing en-US label for ${o.id}` };
    }
  }
  return { ok: true, catalog: normalizeDiscoverySourceCatalog(catalog) };
}
