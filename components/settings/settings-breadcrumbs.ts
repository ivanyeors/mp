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
  href?: string;
};

function isNavActive(basePathname: string, href: string): boolean {
  if (href === "/settings") return basePathname === "/settings";
  return basePathname === href || basePathname.startsWith(`${href}/`);
}

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

function findStructuralParent(
  groups: BreadcrumbNavGroup[],
  href: string,
): BreadcrumbNavItem | null {
  for (const group of groups) {
    for (const item of group.items) {
      if ((item.items ?? []).some((sub) => sub.href === href)) return item;
    }
  }
  return null;
}

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

export function buildSettingsBreadcrumbs(
  basePathname: string,
  groups: BreadcrumbNavGroup[],
  detailLabel?: string | null,
): SettingsCrumb[] {
  const path = basePathname.replace(/\/+$/, "") || "/settings";

  if (path === "/settings") {
    return [{ label: "Admin Panel" }];
  }

  const entries = allNavEntries(groups);
  const activeHref = findActiveHref(path, groups);

  const matched = entries.filter(
    (e) =>
      e.href !== "/settings" &&
      activeHref != null &&
      (activeHref === e.href || activeHref.startsWith(`${e.href}/`)),
  );

  const structuralParentCandidate = activeHref ? findStructuralParent(groups, activeHref) : null;
  const structuralParent =
    structuralParentCandidate && structuralParentCandidate.href !== "/settings"
      ? structuralParentCandidate
      : null;
  if (structuralParent && !matched.some((e) => e.href === structuralParent.href)) {
    matched.push(structuralParent);
  }

  const ancestors = matched.sort((a, b) => a.href.length - b.href.length);

  const crumbs: SettingsCrumb[] = [{ label: "Admin Panel", href: "/settings" }];

  for (const entry of ancestors) {
    crumbs.push({ label: entry.label, href: entry.href });
  }

  if (activeHref && path.length > activeHref.length) {
    const rest = path.slice(activeHref.length).replace(/^\//, "");
    const segments = rest.split("/").filter(Boolean);
    let acc = activeHref;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      acc += `/${seg}`;
      const isLast = i === segments.length - 1;
      const label = isLast ? detailSegmentLabel(seg, detailLabel) : titleCaseSegment(seg);
      crumbs.push(isLast ? { label } : { label, href: acc });
    }
  } else if (!activeHref) {
    const segments = path.split("/").filter(Boolean).slice(1);
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

  const last = crumbs[crumbs.length - 1];
  if (last) delete last.href;

  return crumbs;
}
