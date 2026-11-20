import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultEmailCopy, resolveEmailCopy, type EmailCopy, type EmailCopySpec } from "./copy";

export const COPY_CACHE_MS = 30_000;

const cache = new Map<string, { at: number; values: unknown }>();

export function clearEmailCopyCache(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
}

async function adminClient(): Promise<SupabaseClient | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  return supabaseAdmin();
}

export async function readSavedEmailCopy(admin: SupabaseClient, id: string): Promise<unknown> {
  const { data, error } = await admin.from("email_template_copy").select("copy").eq("template_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { copy?: unknown } | null)?.copy ?? null;
}

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
