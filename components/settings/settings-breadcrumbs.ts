export type BreadcrumbNavItem = {
  href: string;
  label: string;
  items?: BreadcrumbNavItem[];
};

export type BreadcrumbNavGroup = {
  label: string;
  items: BreadcrumbNavItem[];
};

export type SettingsCrumb = {
  label: string;
  /** Omitted on the current page. */
  href?: string;
};

function isNavActive(basePathname: string, href: string): boolean {
  if (href === "/settings") return basePathname === "/settings";
  return basePathname === href || basePathname.startsWith(`${href}/`);
}

/** Longest nav href that matches the path (siblings sharing a prefix need this). */
export function findActiveHref(
  basePathname: string,
  groups: BreadcrumbNavGroup[],
): string | null {
  let best: string | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      for (const href of [item.href, ...(item.items ?? []).map((s) => s.href)]) {
        if (isNavActive(basePathname, href) && href.length > (best?.length ?? -1)) {
          best = href;
        }
      }
    }
  }
  return best;
}

function allNavEntries(groups: BreadcrumbNavGroup[]): BreadcrumbNavItem[] {
  const out: BreadcrumbNavItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      out.push(item);
      for (const sub of item.items ?? []) out.push(sub);
    }
  }
  return out;
}

/** UUID or long opaque token — not a human-readable slug. */
export function isOpaqueId(segment: string): boolean {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true;
  }
  return segment.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(segment);
}

function titleCaseSegment(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function detailSegmentLabel(segment: string, detailLabel?: string | null): string {
  if (detailLabel) return detailLabel;
  if (isOpaqueId(segment)) return "Details";
  return titleCaseSegment(segment);
}

/**
 * Build an IA trail for settings: Settings → nav ancestors → active section → detail.
 * Labels come from nav config; only real destinations are linked.
 */
export function buildSettingsBreadcrumbs(
  basePathname: string,
  groups: BreadcrumbNavGroup[],
  detailLabel?: string | null,
): SettingsCrumb[] {
  const path = basePathname.replace(/\/+$/, "") || "/settings";

  if (path === "/settings") {
    return [{ label: "Settings" }];
  }

  const entries = allNavEntries(groups);
  const activeHref = findActiveHref(path, groups);

  const ancestors = entries
    .filter(
      (e) =>
        e.href !== "/settings" &&
        activeHref != null &&
        (activeHref === e.href || activeHref.startsWith(`${e.href}/`)),
    )
    .sort((a, b) => a.href.length - b.href.length);

  const crumbs: SettingsCrumb[] = [{ label: "Settings", href: "/settings" }];

  for (const entry of ancestors) {
    crumbs.push({ label: entry.label, href: entry.href });
  }

  // Path segments beyond the active nav entry (detail routes).
  if (activeHref && path.length > activeHref.length) {
    const rest = path.slice(activeHref.length).replace(/^\//, "");
    const segment = rest.split("/").filter(Boolean)[0];
    if (segment) {
      crumbs.push({ label: detailSegmentLabel(segment, detailLabel) });
    }
  } else if (!activeHref) {
    // Unknown path: walk segments with title-case fallback.
    const segments = path.split("/").filter(Boolean).slice(1); // drop "settings"
    let acc = "/settings";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      acc += `/${seg}`;
      const isLast = i === segments.length - 1;
      const label = isLast
        ? detailSegmentLabel(seg, detailLabel)
        : titleCaseSegment(seg);
      crumbs.push(isLast ? { label } : { label, href: acc });
    }
  }

  // Current page is not a link.
  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;

  return crumbs;
}
