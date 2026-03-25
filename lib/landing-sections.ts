import { supabaseAdmin } from "@/lib/supabase/server";
import type { LandingSection } from "@/lib/types/landing-sections";

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

/**
 * Fetch visible landing sections ordered by position (for landing page SSR).
 */
export async function getLandingSections(): Promise<LandingSection[]> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("landing_sections")
      .select("*")
      .eq("visible", true)
      .order("position", { ascending: true });

    if (error) {
      console.error("[getLandingSections]", error.message);
      return DEFAULT_SECTIONS;
    }

    return (data?.length ? data : DEFAULT_SECTIONS) as LandingSection[];
  } catch {
    return DEFAULT_SECTIONS;
  }
}

/**
 * Fetch ALL landing sections including hidden (for page builder admin UI).
 */
export async function getAllLandingSections(): Promise<LandingSection[]> {
  try {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("landing_sections")
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      console.error("[getAllLandingSections]", error.message);
      return DEFAULT_SECTIONS;
    }

    return (data?.length ? data : DEFAULT_SECTIONS) as LandingSection[];
  } catch {
    return DEFAULT_SECTIONS;
  }
}
