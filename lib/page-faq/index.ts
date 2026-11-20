import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { stripMarkdownForSchema } from "@/lib/faq";
import type { FaqItemContent, FaqLocalizedText } from "@/lib/faq/types";
import { seedPageFaqDatabase } from "./seed";
import { isValidSurfaceKey } from "./surface-key";
import type { FaqPageItem, FaqPageItemRow, FaqPageSet, FaqPageSetRow } from "./types";

export type { FaqPageItem, FaqPageItemRow, FaqPageSet, FaqPageSetRow };
export { isValidSurfaceKey, parseSurfaceKey, productSurfaceKey } from "./surface-key";
export { PAGE_FAQ_DEFAULTS } from "./defaults";
export { seedPageFaqDatabase } from "./seed";
export { stripMarkdownForSchema };
export { pageFaqPreviewPath, FIXED_SURFACE_OPTIONS } from "./preview-path";

let seedPromise: Promise<void> | null = null;

/** ponytail: lazy seed missing default surfaces (incl. product slug → uuid) */
export async function ensurePageFaqSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedPageFaqDatabase().then((r) => {
      if (!r.ok) console.error("[ensurePageFaqSeeded]", r.message);
    });
  }
  await seedPromise;
}

function resolveTitle(titles: FaqLocalizedText, locale: Locale): string {
  return titles[locale] ?? titles[DEFAULT_LOCALE] ?? Object.values(titles)[0] ?? "";
}

function resolveItemContent(content: FaqItemContent, locale: Locale) {
  const loc = content[locale] ?? content[DEFAULT_LOCALE] ?? Object.values(content)[0];
  return {
    question: loc?.question ?? "",
    answer: loc?.answer ?? "",
  };
}

function mapItem(row: FaqPageItemRow, locale: Locale): FaqPageItem {
  const { question, answer } = resolveItemContent(row.content as FaqItemContent, locale);
  return {
    ...row,
    content: row.content as FaqItemContent,
    question,
    answer,
  };
}

export async function getPageFaq(
  surfaceKey: string,
  locale: Locale = DEFAULT_LOCALE,
  opts?: { visibleOnly?: boolean }
): Promise<FaqPageSet | null> {
  if (!isValidSurfaceKey(surfaceKey)) return null;
  await ensurePageFaqSeeded();

  const visibleOnly = opts?.visibleOnly ?? true;
  const admin = supabaseAdmin();

  let setQuery = admin.from("faq_page_sets").select("*").eq("surface_key", surfaceKey);
  if (visibleOnly) setQuery = setQuery.eq("visible", true);

  const { data: setRow, error: setErr } = await setQuery.maybeSingle();
  if (setErr) {
    console.error("[getPageFaq]", setErr.message);
    return null;
  }
  if (!setRow) return null;

  let itemsQuery = admin
    .from("faq_page_items")
    .select("*")
    .eq("set_id", setRow.id)
    .order("position", { ascending: true });
  if (visibleOnly) itemsQuery = itemsQuery.eq("visible", true);

  const { data: itemRows, error: itemsErr } = await itemsQuery;
  if (itemsErr) {
    console.error("[getPageFaq items]", itemsErr.message);
    return null;
  }

  const row = setRow as FaqPageSetRow;
  return {
    ...row,
    titles: row.titles as FaqLocalizedText,
    title: resolveTitle(row.titles as FaqLocalizedText, locale),
    items: ((itemRows ?? []) as FaqPageItemRow[]).map((r) => mapItem(r, locale)),
  };
}

export async function ensurePageFaqSet(
  surfaceKey: string,
  titles?: FaqLocalizedText
): Promise<FaqPageSetRow | null> {
  if (!isValidSurfaceKey(surfaceKey)) return null;
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("faq_page_sets")
    .select("*")
    .eq("surface_key", surfaceKey)
    .maybeSingle();
  if (existing) return existing as FaqPageSetRow;

  const { data, error } = await admin
    .from("faq_page_sets")
    .insert({
      surface_key: surfaceKey,
      titles: titles ?? { "en-US": "FAQs", "zh-CN": "常见问题" },
      visible: true,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ensurePageFaqSet]", error.message);
    return null;
  }
  return data as FaqPageSetRow;
}

export async function getPageFaqSetAdmin(surfaceKey: string): Promise<FaqPageSet | null> {
  if (!isValidSurfaceKey(surfaceKey)) return null;
  await ensurePageFaqSeeded();
  return getPageFaq(surfaceKey, DEFAULT_LOCALE, { visibleOnly: false });
}

export async function listPageFaqSetsAdmin(): Promise<FaqPageSetRow[]> {
  await ensurePageFaqSeeded();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_page_sets")
    .select("*")
    .order("surface_key", { ascending: true });
  if (error) {
    console.error("[listPageFaqSetsAdmin]", error.message);
    return [];
  }
  return (data ?? []) as FaqPageSetRow[];
}

export async function createPageFaqItem(input: {
  setId: string;
  slug: string;
  content: FaqItemContent;
  position?: number;
  visible?: boolean;
}): Promise<FaqPageItemRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_page_items")
    .insert({
      set_id: input.setId,
      slug: input.slug,
      content: input.content,
      position: input.position ?? 0,
      visible: input.visible ?? true,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[createPageFaqItem]", error.message);
    return null;
  }
  return data as FaqPageItemRow;
}

export async function updatePageFaqItem(
  id: string,
  patch: Partial<Pick<FaqPageItemRow, "slug" | "content" | "position" | "visible">>
): Promise<FaqPageItemRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_page_items")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[updatePageFaqItem]", error.message);
    return null;
  }
  return data as FaqPageItemRow;
}

export async function deletePageFaqItem(id: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("faq_page_items").delete().eq("id", id);
  if (error) {
    console.error("[deletePageFaqItem]", error.message);
    return false;
  }
  return true;
}

export async function reorderPageFaqItems(setId: string, orderedIds: string[]): Promise<boolean> {
  const admin = supabaseAdmin();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await admin
      .from("faq_page_items")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("set_id", setId);
    if (error) {
      console.error("[reorderPageFaqItems]", error.message);
      return false;
    }
  }
  return true;
}

export async function updatePageFaqSet(
  id: string,
  patch: Partial<Pick<FaqPageSetRow, "titles" | "visible">>
): Promise<FaqPageSetRow | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_page_sets")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("[updatePageFaqSet]", error.message);
    return null;
  }
  return data as FaqPageSetRow;
}
