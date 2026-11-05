import { unstable_cache } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase/server";

import type { SlideInPageKey } from "./pages";
import type { SlideInSectionRow } from "./sections";

/**
 * Reads of `slide_in_sections` (CONTEXT.md — **Slide-in section**).
 *
 * The live read is cached: the slide-ins can open from any page (the app dock carries
 * three of them), so the root layout loads every sub page's published overrides on
 * every route. They change only on Publish, which invalidates this tag.
 */
export const SLIDE_IN_SECTIONS_TAG = "slide-in-sections";

/** Published state only — what shoppers see. No draft columns leave the server. */
export type PublishedSlideInRow = Pick<
  SlideInSectionRow,
  "page" | "slug" | "section_type" | "position" | "visible" | "content"
>;

const PUBLISHED_COLUMNS = "page, slug, section_type, position, visible, content";

async function readPublishedSlideInRows(): Promise<PublishedSlideInRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("slide_in_sections")
    .select(PUBLISHED_COLUMNS)
    .order("position", { ascending: true });
  // Thrown so unstable_cache does not store the failure as an empty answer.
  if (error) throw new Error(error.message);
  return (data ?? []) as PublishedSlideInRow[];
}

const cachedPublishedSlideInRows = unstable_cache(readPublishedSlideInRows, ["slide-in-sections-published"], {
  tags: [SLIDE_IN_SECTIONS_TAG],
  revalidate: 300,
});

/**
 * Every sub page's published overrides, for the live slide-ins.
 *
 * On any failure the slide-ins render their code defaults: a degraded sheet beats a
 * site-wide 500 from the root layout. Nothing is written back.
 */
export async function getPublishedSlideInRows(): Promise<PublishedSlideInRow[]> {
  try {
    return await cachedPublishedSlideInRows();
  } catch (err) {
    console.error("[getPublishedSlideInRows]", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * One sub page's rows exactly as stored, drafts included — what the builder edits and
 * Preview mode renders. Throws on a Supabase error so the builder never edits a fallback
 * believing it is the page.
 */
export async function listSlideInRows(page: SlideInPageKey): Promise<SlideInSectionRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("slide_in_sections")
    .select("*")
    .eq("page", page)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SlideInSectionRow[];
}
