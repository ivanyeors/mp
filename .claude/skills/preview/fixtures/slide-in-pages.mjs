// The landing page's sub pages in the Page Builder (CONTEXT.md — Slide-in
// section): Basic Mpillow has one published edit (its hero title) and a draft
// of two more (a new line under the sheet title, and its sizing video hidden),
// so /settings/page-builder?page=basic-mpillow shows "Draft · 2 changes" and a
// Hidden marker in the preview. One earlier publish fills its History. Every
// other sub page has no rows and renders its built-in content. The copy is
// made up.
//
// The slide-ins quote Costings → Service fees in their policy copy, so the
// three service fees are here too, at the migration's launch defaults.

export default function slideInPages({ now }) {
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();

  const heroTitle = { copy: { "en-US": { title: "Sleep made easy, every night" } } };

  return {
    tables: {
      slide_in_sections: [
        {
          id: "00000000-0000-4000-8000-0000005d0001",
          page: "basic-mpillow",
          slug: "header",
          section_type: "header",
          position: -1,
          visible: true,
          content: {},
          draft_content: {
            copy: {
              "en-US": {
                description:
                  "A custom-fit cervical pillow for occasional neck tension — sized to your shoulder length, modular and washable.",
              },
            },
          },
          draft_position: null,
          draft_visible: null,
          created_at: at(3),
          updated_at: at(0),
        },
        {
          id: "00000000-0000-4000-8000-0000005d0002",
          page: "basic-mpillow",
          slug: "hero",
          section_type: "split_hero",
          position: 0,
          visible: true,
          content: heroTitle,
          draft_content: null,
          draft_position: null,
          draft_visible: null,
          created_at: at(3),
          updated_at: at(3),
        },
        {
          id: "00000000-0000-4000-8000-0000005d0003",
          page: "basic-mpillow",
          slug: "sizing-video",
          section_type: "video_section",
          position: 4,
          visible: true,
          content: {},
          draft_content: null,
          draft_position: null,
          draft_visible: false,
          created_at: at(0),
          updated_at: at(0),
        },
      ],
      service_prices: [
        { key: "measurement_premium", msrp: 50, updated_at: at(30) },
        { key: "measurement_basic", msrp: 30, updated_at: at(30) },
        { key: "readjustment", msrp: 30, updated_at: at(30) },
      ],
      slide_in_page_publishes: [
        {
          id: "00000000-0000-4000-8000-0000005e0001",
          page: "basic-mpillow",
          sections: [{ slug: "hero", section_type: "split_hero", position: 0, visible: true, content: heroTitle }],
          published_at: at(3),
          published_by: "owner@preview.local",
        },
      ],
    },
  };
}
