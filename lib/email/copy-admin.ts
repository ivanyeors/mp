import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultEmailCopy, editedFields, resolveEmailCopy, type EmailCopy, type EmailCopySpec } from "./copy";
import { clearEmailCopyCache } from "./copy-store";
import { EMAIL_GROUP_LABELS, EMAIL_REGISTRY, type EmailCase, type EmailGroup } from "./registry";

export interface EditableEmail {
  spec: EmailCopySpec;
  group: EmailGroup;
  audience: EmailCase["audience"];
  variants: { id: string; label: string }[];
}

export function editableEmails(): EditableEmail[] {
  const out = new Map<string, EditableEmail>();
  for (const c of EMAIL_REGISTRY) {
    if (!c.copy) continue;
    const e = out.get(c.copy.id);
    if (e) e.variants.push({ id: c.id, label: c.label });
    else out.set(c.copy.id, { spec: c.copy, group: c.group, audience: c.audience, variants: [{ id: c.id, label: c.label }] });
  }
  return [...out.values()];
}

export function editableEmail(id: string): EditableEmail | null {
  return editableEmails().find((e) => e.spec.id === id) ?? null;
}

export const groupLabel = (g: EmailGroup) => EMAIL_GROUP_LABELS[g];

export function variantCase(email: EditableEmail, variantId?: string | null): EmailCase {
  const id = email.variants.some((v) => v.id === variantId) ? variantId : email.variants[0].id;
  return EMAIL_REGISTRY.find((c) => c.id === id)!;
}

export interface SavedCopy {
  copy: EmailCopy;
  edited: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

type Row = { template_id: string; copy: unknown; updated_at: string; editor: { name: string } | { name: string }[] | null };

const COLUMNS = "template_id, copy, updated_at, editor:mp_staff!updated_by_profile_id(name)";

function savedFrom(spec: EmailCopySpec, row: Row | undefined): SavedCopy {
  const copy = resolveEmailCopy(spec, row?.copy ?? null);
  const editor = Array.isArray(row?.editor) ? row?.editor[0] : row?.editor;
  return { copy, edited: editedFields(spec, copy), updatedAt: row?.updated_at ?? null, updatedBy: editor?.name ?? null };
}

export async function readAllSavedCopy(admin: SupabaseClient): Promise<Map<string, SavedCopy>> {
  const { data, error } = await admin.from("email_template_copy").select(COLUMNS);
  if (error) throw new Error(`Could not read the email templates: ${error.message}`);
  const rows = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.template_id, r] as const));
  return new Map(editableEmails().map((e) => [e.spec.id, savedFrom(e.spec, rows.get(e.spec.id))] as const));
}

export async function readSavedCopy(admin: SupabaseClient, spec: EmailCopySpec): Promise<SavedCopy> {
  const { data, error } = await admin.from("email_template_copy").select(COLUMNS).eq("template_id", spec.id).maybeSingle();
  if (error) throw new Error(`Could not read the email: ${error.message}`);
  return savedFrom(spec, (data ?? undefined) as Row | undefined);
}

export async function writeCopy(
  admin: SupabaseClient,
  spec: EmailCopySpec,
  values: EmailCopy,
  updatedByProfileId: string | null,
): Promise<void> {
  if (editedFields(spec, values).length === 0) return resetCopy(admin, spec);
  const { error } = await admin
    .from("email_template_copy")
    .upsert({ template_id: spec.id, copy: values, updated_by_profile_id: updatedByProfileId }, { onConflict: "template_id" });
  if (error) throw new Error(`Could not save the email: ${error.message}`);
  clearEmailCopyCache(spec.id);
}

export async function resetCopy(admin: SupabaseClient, spec: EmailCopySpec): Promise<void> {
  const { error } = await admin.from("email_template_copy").delete().eq("template_id", spec.id);
  if (error) throw new Error(`Could not reset the email: ${error.message}`);
  clearEmailCopyCache(spec.id);
}

export { defaultEmailCopy };
