import { supabaseAdmin } from "@/lib/supabase/server";
import type { LandingSection } from "@/lib/types/landing-sections";
import { draftSections, type LandingSectionRow } from "@/lib/page-builder/draft";

/** Hardcoded fallback so the landing page never breaks if the table is empty. */
const DEFAULT_SECTIONS: LandingSection[] = [
  { id: "default-hero", section_type: "hero", slug: "hero", position: 0, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-size-matters", section_type: "text_image", slug: "size-matters", position: 1, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-marquee", section_type: "marquee", slug: "marquee", position: 2, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-ambassadors", section_type: "text_image", slug: "ambassadors", position: 3, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-stories", section_type: "stories", slug: "stories", position: 4, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-pick", section_type: "pick_your_mpillow", slug: "pick-your-mpillow", position: 5, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-neck", section_type: "neck_pains", slug: "neck-pains", position: 6, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-why", section_type: "why_choose_highlights", slug: "why-choose", position: 7, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-mbolster", section_type: "product_card", slug: "mbolster", position: 8, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-credibility", section_type: "credibility", slug: "credibility", position: 9, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-review", section_type: "video_embed", slug: "review", position: 10, visible: true, content: {}, created_at: "", updated_at: "" },
  { id: "default-founder", section_type: "founder_note", slug: "founder", position: 11, visible: true, content: {}, created_at: "", updated_at: "" },
];

/** Size of the seed layout, for tests asserting the empty-table fallback. */
export const DEFAULT_SECTIONS_COUNT = DEFAULT_SECTIONS.length;

/**
 * Which sections the public page renders, given every row in the table.
 *
 * Split out so the empty-vs-all-hidden distinction is testable without Supabase.
 * An empty table means "not configured yet" and falls back to the seed layout; a
 * populated table where every row is hidden means Staff hid everything, and must
 * render nothing.
 */
export function selectRenderableSections(rows: LandingSection[]): LandingSection[] {
  if (rows.length === 0) return DEFAULT_SECTIONS;
  return rows.filter((section) => section.visible);
}

/**
 * Visible landing sections in order, for the public landing page.
 *
 * The seed layout is a fallback for a genuinely empty table only. It used to also
 * fire whenever the query returned no rows, so hiding every section brought the
 * original twelve back and the visibility toggles appeared not to work. Visibility
 * is therefore filtered here rather than in the query, so "no rows" and "all hidden"
 * stay distinguishable.
 *
 * On a query error the seed layout still stands in: a degraded homepage beats a 500
 * on a route with no error boundary. Nothing is written back, so a blip cannot
 * overwrite Staff edits. The builder's own read (`listLandingSections`) throws
 * instead, so Staff never edit a fallback believing it is their page.
 */
export async function getLandingSections(): Promise<LandingSection[]> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("landing_sections")
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      console.error("[getLandingSections]", error.message);
      return DEFAULT_SECTIONS;
    }

    // Published columns only — a Section draft is invisible until Publish.
    return selectRenderableSections((data ?? []) as LandingSection[]);
  } catch (err) {
    console.error("[getLandingSections]", err);
    return DEFAULT_SECTIONS;
  }
}

/**
 * Every landing section ordered by position, exactly as stored — no default
 * fallback, so the page builder shows the real table. Throws on a Supabase
 * error so callers can map it to a status code.
 */
export async function listLandingSections(): Promise<LandingSection[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("landing_sections")
    .select("*")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LandingSection[];
}

/**
 * Every section with its **Section draft** applied — what Preview mode renders and what
 * the Page Builder edits against. Hidden sections are kept so the builder can mark them;
 * sections pending removal are dropped.
 *
 * Throws on a Supabase error, like `listLandingSections`, so Staff never edit a fallback
 * believing it is their page.
 */
export async function listLandingSectionsWithDrafts(): Promise<LandingSection[]> {
  return draftSections(await listLandingSectionRows());
}

/** Raw rows including draft columns, for the builder and the pending-change summary. */
export async function listLandingSectionRows(): Promise<LandingSectionRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("landing_sections")
    .select("*")
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LandingSectionRow[];
}
