// ============================================================
// Saved email copy: read before a send, written by Email templates
// ============================================================
//
// PRD-email-templates; `email_template_copy` (20261021110000). One row per
// email whose words Staff changed; no row is the default wording. Server-only.
//
// `loadEmailCopy` is what every send path calls before it renders. It never
// throws and never blocks: no row, a failed read, or no database at all (a
// script, a test) all give the defaults, and a saved field that no longer
// passes validation falls back alone (`resolveEmailCopy`). A short cache keeps
// a loop of sends (the daily job, a campaign) to one read per email.

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultEmailCopy, resolveEmailCopy, type EmailCopy, type EmailCopySpec } from "./copy";

/** How long a read is reused: an edit reaches every send within this. */
export const COPY_CACHE_MS = 30_000;

const cache = new Map<string, { at: number; values: unknown }>();

/** Forget cached reads: after a save, so this instance sends the new words at once. */
export function clearEmailCopyCache(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}

async function adminClient(): Promise<SupabaseClient | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  return supabaseAdmin();
}

/** The saved values for one email, or null; throws on a failed read. */
export async function readSavedEmailCopy(admin: SupabaseClient, id: string): Promise<unknown> {
  const { data, error } = await admin.from("email_template_copy").select("copy").eq("template_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { copy?: unknown } | null)?.copy ?? null;
}

/**
 * The words `spec`'s email sends with now: Staff's saved edit over the
 * defaults. Never throws.
 */
export async function loadEmailCopy<K extends string>(
  spec: EmailCopySpec<K>,
  { admin, now = Date.now() }: { admin?: SupabaseClient | null; now?: number } = {},
): Promise<EmailCopy<K>> {
  const hit = cache.get(spec.id);
  if (hit && now - hit.at < COPY_CACHE_MS) return resolveEmailCopy(spec, hit.values);
  try {
    const client = admin === undefined ? await adminClient() : admin;
    if (!client) return defaultEmailCopy(spec);
    const values = await readSavedEmailCopy(client, spec.id);
    cache.set(spec.id, { at: now, values });
    return resolveEmailCopy(spec, values);
  } catch (err) {
    console.error(`[email-copy] using the default words for ${spec.id}:`, err instanceof Error ? err.message : err);
    return defaultEmailCopy(spec);
  }
}
