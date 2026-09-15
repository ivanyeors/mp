/**
 * Server-side reads and writes of Filling Template size membership.
 *
 * Every route that lists, creates or rescopes a Filling Template goes through
 * here, so `bom_template_keys` and the `bom_templates.key` primary can never
 * drift apart. Service-role only (the membership table has RLS on and no
 * policy), exactly like the placement tables.
 */

import type { supabaseAdmin } from "@/lib/supabase/server";
import {
  normalizeTemplateKeys,
  primaryTemplateKey,
  templateKeyLabel,
  type FillingKind,
} from "./keys";

type Admin = ReturnType<typeof supabaseAdmin>;

/** Membership for a set of templates, as `{ [template_id]: keys }`. One query. */
export async function loadTemplateKeys(
  admin: Admin,
  templateIds: number[],
): Promise<{ ok: true; byId: Map<number, string[]> } | { ok: false; error: string }> {
  if (!templateIds.length) return { ok: true, byId: new Map() };
  const { data, error } = await admin
    .from("bom_template_keys")
    .select("template_id,key")
    .in("template_id", templateIds);
  if (error) return { ok: false, error: error.message };
  const byId = new Map<number, string[]>();
  for (const row of (data ?? []) as Array<{ template_id: number; key: string }>) {
    const id = Number(row.template_id);
    byId.set(id, [...(byId.get(id) ?? []), row.key]);
  }
  return { ok: true, byId };
}

/**
 * Template ids serving one key. The list, assign and assist readers all narrow
 * with this instead of `bom_templates.key`, which only carries the primary.
 */
export async function templateIdsForKey(
  admin: Admin,
  key: string,
): Promise<{ ok: true; ids: number[] } | { ok: false; error: string }> {
  const { data, error } = await admin.from("bom_template_keys").select("template_id").eq("key", key);
  if (error) return { ok: false, error: error.message };
  return { ok: true, ids: (data ?? []).map((r: { template_id: number }) => Number(r.template_id)) };
}

/**
 * Refuse a name already taken at any size the template would serve. The DB's
 * legacy unique is on the primary key only, so a name clash introduced by
 * sharing into another size is caught here. Two shares racing into the same
 * size can still both pass — the cost is a duplicate name in one list, which
 * an operator can rename, not corrupt data.
 */
export async function assertTemplateNameFree(
  admin: Admin,
  opts: { kind: FillingKind; keys: string[]; name: string; excludeId?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: members, error: mErr } = await admin
    .from("bom_template_keys")
    .select("template_id,key")
    .in("key", opts.keys);
  if (mErr) return { ok: false, error: mErr.message };
  const keyById = new Map<number, string>();
  for (const row of (members ?? []) as Array<{ template_id: number; key: string }>) {
    const id = Number(row.template_id);
    if (id !== opts.excludeId && !keyById.has(id)) keyById.set(id, row.key);
  }
  if (!keyById.size) return { ok: true };

  const { data: clashes, error: cErr } = await admin
    .from("bom_templates")
    .select("id,name")
    .in("id", [...keyById.keys()])
    .eq("kind", opts.kind)
    .eq("role", "filling")
    .eq("name", opts.name);
  if (cErr) return { ok: false, error: cErr.message };
  const clash = (clashes ?? [])[0] as { id: number } | undefined;
  if (!clash) return { ok: true };
  return {
    ok: false,
    error: `"${opts.name}" is already used by another Filling Template at ${templateKeyLabel(
      opts.kind,
      keyById.get(Number(clash.id)) ?? opts.keys[0],
    )}`,
  };
}

/**
 * Replace a template's membership and re-point its primary key. The only
 * writer: membership rows and `bom_templates.key` move together or not at all,
 * so no caller can leave the primary pointing at a size the template no longer
 * serves.
 */
export async function setTemplateKeys(
  admin: Admin,
  opts: { templateId: number; kind: FillingKind; keys: readonly string[] },
): Promise<{ ok: true; keys: string[] } | { ok: false; error: string }> {
  const normalized = normalizeTemplateKeys(opts.kind, opts.keys);
  if (!normalized.ok) return normalized;
  const keys = normalized.keys;

  // Replace wholesale, like the placement writers: the set is small and the
  // surface is admin-only, so a diff would only add ways to half-apply a change.
  const { error: delErr } = await admin
    .from("bom_template_keys")
    .delete()
    .eq("template_id", opts.templateId);
  if (delErr) return { ok: false, error: delErr.message };

  const { error: insErr } = await admin
    .from("bom_template_keys")
    .insert(keys.map((key) => ({ template_id: opts.templateId, key })));
  if (insErr) return { ok: false, error: insErr.message };

  // Primary follows the membership so legacy `key` readers stay truthful.
  const { error: upErr } = await admin
    .from("bom_templates")
    .update({ key: primaryTemplateKey(opts.kind, keys) })
    .eq("id", opts.templateId);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true, keys };
}
