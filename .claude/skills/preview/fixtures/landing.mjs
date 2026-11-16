// The landing page's Landing sections: the seed layout (lib/landing-sections.ts
// DEFAULT_SECTIONS) plus one TikTok videos section after the marquee, so the
// home page and /settings/page-builder show it. The table has rows, so the page
// renders these rather than the code fallback; every built-in row is empty
// content and renders its default copy.
//
// The TikTok links, hooks and button links are made up. Covers are images
// already in /public, cropped to 9:16 by the card.

const SEED = [
  ["hero", "hero"],
  ["text_image", "size-matters"],
  ["marquee", "marquee"],
  ["tiktok_videos", "tiktok"],
  ["text_image", "ambassadors"],
  ["stories", "stories"],
  ["pick_your_mpillow", "pick-your-mpillow"],
  ["neck_pains", "neck-pains"],
  ["why_choose_highlights", "why-choose"],
  ["product_card", "mbolster"],
  ["credibility", "credibility"],
  ["video_embed", "review"],
  ["founder_note", "founder"],
];

const VIDEOS = [
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000001",
    image: "/3way-side-sleep.jpg",
    alt: { "en-US": "A sleeper on their side on a pillow" },
    hook: { "en-US": "Side sleeper? Watch how we size yours", "zh-CN": "侧睡的你？看看我们如何量身定做" },
    buttonLabel: { "en-US": "Customise yours" },
    buttonUrl: "/mp-config",
  },
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000002",
    image: "/m-pillow-518057-final-V-WEB.webp",
    hook: { "en-US": "Three compartments, one pillow" },
    buttonUrl: "/shop",
  },
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000003",
    image: "/images/blogs/why-side-sleepers-love-the-mbolster-a-game-changer-for-better-sleep.jpg",
    hook: { "en-US": "The bolster our side sleepers ask for" },
    buttonLabel: { "en-US": "See the Mbolster" },
    buttonUrl: "/mbolster-config",
  },
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000004",
    image: "/DSC03705.webp",
    hook: { "en-US": "A fitting at our studio, start to finish" },
    buttonLabel: { "en-US": "Book a fitting" },
    buttonUrl: "/appointments",
  },
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000005",
    image: "/images/blogs/what-are-the-different-types-of-pillow-fillings-amp-which-is-best-for-you.jpg",
    hook: { "en-US": "Which filling is for you?" },
    buttonUrl: "/shop",
  },
  {
    tiktokUrl: "https://www.tiktok.com/@thempillow/video/7400000000000000006",
    image: "/images/blogs/how-to-choose-the-best-pillow-in-singapore.jpg",
    hook: { "en-US": "Washing day: every part comes apart" },
    buttonLabel: { "en-US": "Shop covers" },
    buttonUrl: "/shop",
  },
];

export default function landing({ now }) {
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

  return {
    tables: {
      landing_sections: SEED.map(([section_type, slug], position) => ({
        id: `00000000-0000-4000-8000-00000000a${String(position).padStart(3, "0")}`,
        section_type,
        slug,
        position,
        visible: true,
        content:
          section_type === "tiktok_videos"
            ? {
                title: { "en-US": "Seen on TikTok", "zh-CN": "TikTok 上的我们" },
                subtitle: { "en-US": "Real fittings, real sleepers. Tap a video to watch it here." },
                direction: "left",
                videos: VIDEOS,
              }
            : {},
        draft_content: null,
        draft_position: null,
        draft_visible: null,
        draft_deleted: null,
        created_at: at(30),
        updated_at: at(1),
      })),
    },
  };
}
