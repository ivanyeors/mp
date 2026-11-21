type BranchFields = { id: string; parent_id?: string | null; position?: number | null };

export function isBranch(row: { parent_id?: string | null }): boolean {
  return !!row.parent_id;
}

export function locationDisplayName(row: { name: string; branch_name?: string | null }): string {
  const branch = row.branch_name?.trim();
  return branch ? `${row.name} · ${branch}` : row.name;
}

export function branchesByParent<T extends BranchFields>(rows: T[]): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parent_id) continue;
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row);
    byParent.set(row.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
  return byParent;
}

export function orderWithBranches<T extends BranchFields>(rows: T[]): T[] {
  const byParent = branchesByParent(rows);
  const out: T[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    if (row.parent_id) continue;
    out.push(row);
    for (const branch of byParent.get(row.id) ?? []) {
      out.push(branch);
      placed.add(branch.id);
    }
  }
  for (const row of rows) {
    if (row.parent_id && !placed.has(row.id)) out.push(row);
  }
  return out;
}

export function formatLocationAddress(
  address: string | null | undefined,
  postalCode?: string | null,
): string {
  const lines = (address ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/,+$/, ""))
    .filter(Boolean);
  const postal = postalCode?.trim();
  if (!postal) return lines.join(", ");
  if (lines.length === 0) return postal;
  if (lines.some((l) => l.includes(postal))) return lines.join(", ");
  const last = lines[lines.length - 1];
  if (/singapore$/i.test(last)) {
    return [...lines.slice(0, -1), `${last} ${postal}`].join(", ");
  }
  return `${lines.join(", ")} ${postal}`;
}

export function locationMapsUrl(
  address: string | null | undefined,
  postalCode?: string | null,
): string | null {
  const query = formatLocationAddress(address, postalCode);
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export type BranchInput = {
  id?: string;
  branch_name?: string | null;
  address: string;
  postal_code?: string | null;
};

export type BranchSavePlan = {
  updates: (BranchInput & { id: string; position: number })[];
  inserts: (BranchInput & { position: number })[];
  deleteIds: string[];
  unknownIds: string[];
};

export function planBranchSave(existingIds: string[], incoming: BranchInput[]): BranchSavePlan {
  const known = new Set(existingIds);
  const kept = new Set<string>();
  const plan: BranchSavePlan = { updates: [], inserts: [], deleteIds: [], unknownIds: [] };
  incoming.forEach((branch, position) => {
    if (!branch.id) {
      plan.inserts.push({ ...branch, position });
    } else if (known.has(branch.id) && !kept.has(branch.id)) {
      kept.add(branch.id);
      plan.updates.push({ ...branch, id: branch.id, position });
    } else {
      plan.unknownIds.push(branch.id);
    }
  });
  plan.deleteIds = existingIds.filter((id) => !kept.has(id));
  return plan;
}
