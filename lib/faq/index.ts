import { supabaseAdmin } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { seedFaqDatabase } from "./seed";
import type {
  FaqCategory,
  FaqCategoryRow,
  FaqCategoryWithItems,
  FaqItem,
  FaqItemContent,
  FaqItemRow,
  FaqLocalizedText,
} from "./types";

export type { FaqCategory, FaqCategoryWithItems, FaqItem, FaqItemContent, FaqLocalizedText };

let seedPromise: Promise<void> | null = null;

/** ponytail: lazy one-time seed from defaults.ts when tables are empty */
export async function ensureFaqSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedFaqDatabase().then((r) => {
      if (!r.ok) console.error("[ensureFaqSeeded]", r.message);
    });
  }
  await seedPromise;
}

function resolveLabel(labels: FaqLocalizedText, locale: Locale): string {
  return labels[locale] ?? labels[DEFAULT_LOCALE] ?? Object.values(labels)[0] ?? "";
}

function resolveItemContent(content: FaqItemContent, locale: Locale) {
  const loc = content[locale] ?? content[DEFAULT_LOCALE] ?? Object.values(content)[0];
  return {
    question: loc?.question ?? "",
    answer: loc?.answer ?? "",
  };
}

function mapCategory(row: FaqCategoryRow, locale: Locale): FaqCategory {
  return {
    ...row,
    labels: row.labels as FaqLocalizedText,
    label: resolveLabel(row.labels as FaqLocalizedText, locale),
  };
}

function mapItem(row: FaqItemRow, locale: Locale): FaqItem {
  const { question, answer } = resolveItemContent(row.content as FaqItemContent, locale);
  return {
    ...row,
    content: row.content as FaqItemContent,
    question,
    answer,
  };
}

export async function getFaqCategories(opts?: {
  locale?: Locale;
  visibleOnly?: boolean;
}): Promise<FaqCategory[]> {
  await ensureFaqSeeded();
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const visibleOnly = opts?.visibleOnly ?? true;

  const admin = supabaseAdmin();
  let query = admin.from("faq_categories").select("*").order("position", { ascending: true });
  if (visibleOnly) query = query.eq("visible", true);

  const { data, error } = await query;
  if (error) {
    console.error("[getFaqCategories]", error.message);
    return [];
  }

  return (data as FaqCategoryRow[]).map((row) => mapCategory(row, locale));
}

export async function getFaqItems(opts?: {
  locale?: Locale;
  visibleOnly?: boolean;
  categoryId?: string;
}): Promise<FaqItem[]> {
  await ensureFaqSeeded();
  const locale = opts?.locale ?? DEFAULT_LOCALE;
  const visibleOnly = opts?.visibleOnly ?? true;

  const admin = supabaseAdmin();
  let query = admin.from("faq_items").select("*").order("position", { ascending: true });
  if (visibleOnly) query = query.eq("visible", true);
  if (opts?.categoryId) query = query.eq("category_id", opts.categoryId);

  const { data, error } = await query;
  if (error) {
    console.error("[getFaqItems]", error.message);
    return [];
  }

  return (data as FaqItemRow[]).map((row) => mapItem(row, locale));
}

export async function getFaqPageData(
  locale: Locale,
  opts?: { visibleOnly?: boolean }
): Promise<FaqCategoryWithItems[]> {
  const visibleOnly = opts?.visibleOnly ?? true;
  const [categories, items] = await Promise.all([
    getFaqCategories({ locale, visibleOnly }),
    getFaqItems({ locale, visibleOnly }),
  ]);

  return categories.map((cat) => ({
    ...cat,
    items: items.filter((item) => item.category_id === cat.id),
  }));
}

export async function getAllFaqCategoriesAdmin(): Promise<FaqCategoryRow[]> {
  await ensureFaqSeeded();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_categories")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.error("[getAllFaqCategoriesAdmin]", error.message);
    return [];
  }
  return (data ?? []) as FaqCategoryRow[];
}

export async function getAllFaqItemsAdmin(): Promise<FaqItemRow[]> {
  await ensureFaqSeeded();
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_items")
    .select("*")
    .order("position", { ascending: true });

  if (error) {
    console.error("[getAllFaqItemsAdmin]", error.message);
    return [];
  }
  return (data ?? []) as FaqItemRow[];
}

export function stripMarkdownForSchema(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}
