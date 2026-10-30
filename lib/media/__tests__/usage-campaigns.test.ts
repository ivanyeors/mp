import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaignImageAssetIds,
  indexUsages,
  listAssetUsages,
  resolveUsages,
  usageBlocksDeletion,
  usagePredicateTerms,
  type AssetRef,
  type UsageConsumerRows,
} from "@/lib/media/image-usages";
import { createFakeSupabase } from "./usage-fixtures";

/**
 * Email campaigns in the Media Library's usage resolver
 * (PRD-campaign-email-editor slice 05): an image a campaign's blocks place is
 * Used, names the campaign, and can never be deleted past, whether the
 * campaign is a draft, sent or archived.
 */

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.client }));
vi.mock("@/lib/media/slide-media", () => ({
  getSlideMediaMap: () => ({}),
  SLIDE_PUBLIC_PATHS: [] as Array<{ publicPath: string; consumer: string }>,
}));

const HERO: AssetRef = { id: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", hosted_url: "https://cdn.example/media/hero.webp" };
const OTHER: AssetRef = { id: "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d", hosted_url: "https://cdn.example/media/other.webp" };

const blocks = (...b: unknown[]) => ({ v: 1, blocks: b, fallbacks: {} });
const image = (asset: string) => ({ id: "i", type: "image", image: { asset, alt: "A cover" }, width: "full" });
const hero = (asset: string) => ({ id: "h", type: "hero", image: { asset, alt: "A bed" }, heading: "Sleep cooler" });

const CAMPAIGNS = [
  { id: "c-draft", name: "December launch", content: blocks(image(HERO.id)), locked_at: null, archived_at: null },
  { id: "c-sent", name: "November news", content: blocks({ id: "t", type: "heading", level: 1, text: "Hi" }, hero(HERO.id)), locked_at: "2026-11-01", archived_at: null },
  { id: "c-archived", name: "October sale", content: blocks(image(HERO.id)), locked_at: "2026-10-01", archived_at: "2026-10-20" },
  // Words that name the asset or its URL are words, not a placed image.
  { id: "c-words", name: "Care tips", content: blocks({ id: "t", type: "text", paragraphs: [{ kind: "p", runs: [{ text: `${HERO.id} ${HERO.hosted_url}` }] }] }), locked_at: null, archived_at: null },
  // A campaign written before blocks has no content.
  { id: "c-legacy", name: "Sign-in invitation", content: null, body: `See ${HERO.hosted_url}`, locked_at: null, archived_at: null },
];

beforeEach(() => {
  h.client = null;
});

describe("email campaigns as a Media Library consumer", () => {
  it("reads the images a campaign's blocks place, and nothing else in it", () => {
    expect(campaignImageAssetIds(blocks(image(HERO.id), hero(OTHER.id), image("")))).toEqual([HERO.id, OTHER.id]);
    expect(campaignImageAssetIds(null)).toEqual([]);
    expect(campaignImageAssetIds({ v: 1, blocks: "not a list" })).toEqual([]);
    expect(campaignImageAssetIds(CAMPAIGNS[3].content)).toEqual([]);
  });

  it("names every campaign that places the image: a draft, a sent one and an archived one", () => {
    const rows: UsageConsumerRows = { emailCampaigns: CAMPAIGNS.filter((c) => c.content) };
    const usages = resolveUsages(HERO, rows);
    expect(usages).toEqual([
      { type: "email_campaign", label: "December launch", ref_id: "c-draft" },
      { type: "email_campaign", label: "November news", ref_id: "c-sent" },
      { type: "email_campaign", label: "October sale", ref_id: "c-archived" },
    ]);
    expect(resolveUsages(OTHER, rows)).toEqual([]);
    // The library grid's index says the same.
    expect(indexUsages([HERO, OTHER], rows).byAssetId).toEqual({ [HERO.id]: usages });
  });

  it("never matches a URL-only ref (the bucket delete's precheck): a campaign names images by id", () => {
    const rows: UsageConsumerRows = { emailCampaigns: CAMPAIGNS.filter((c) => c.content) };
    expect(resolveUsages({ id: "", hosted_url: HERO.hosted_url }, rows)).toEqual([]);
    expect(usagePredicateTerms("email_campaigns", { id: "", hosted_url: HERO.hosted_url })).toBeNull();
    expect(usagePredicateTerms("email_campaigns", HERO)).toEqual([{ column: "content::text", op: "ilike", value: `%${HERO.id}%` }]);
  });

  it("finds the campaigns through the database, reading only those that can name it", async () => {
    const fake = createFakeSupabase({ email_campaigns: CAMPAIGNS });
    h.client = fake.client;
    const usages = await listAssetUsages(HERO);
    expect(usages.map((u) => u.ref_id)).toEqual(["c-draft", "c-sent", "c-archived"]);
    const read = fake.log.filter((q) => q.table === "email_campaigns");
    expect(read).toHaveLength(1);
    // c-words names the id in its words, so the text search reads it; the matcher then drops it.
    expect(read[0].returned).toBe(4);
  });

  it("holds a campaign's use past Delete anyway, and no other", () => {
    expect(usageBlocksDeletion({ type: "email_campaign" })).toBe(true);
    for (const type of ["blog_featured", "landing_slot", "product_image", "item_image"] as const) {
      expect(usageBlocksDeletion({ type })).toBe(false);
    }
  });
});
