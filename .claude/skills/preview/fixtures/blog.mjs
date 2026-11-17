// Sample data for the public blog (/blog and /blog/<slug>). The slugs and
// titles are two of the real posts (data/blogs), so a redirect to them can be
// followed in the preview; the body text is made up and short.

export default function blog({ now }) {
  const day = (n) => new Date(now.getTime() - n * 86400e3).toISOString();
  const post = (id, slug, title, description, daysAgo) => ({
    id,
    slug,
    status: "published",
    content: {
      "en-US": {
        title,
        description,
        sub_header: "",
        body: `## What this sample covers\n\n${description}\n\n## A second section\n\nSample text for the preview only.`,
        seo_keywords: [],
      },
    },
    image_url: null,
    author: "Mpillow",
    labels: [],
    published_at: day(daysAgo),
    content_updated_at: day(daysAgo),
    created_at: day(daysAgo),
    updated_at: day(daysAgo),
  });
  return {
    tables: {
      blog_posts: [
        post(
          "b0000000-0000-4000-8000-000000000001",
          "bolsters-vs-pillows-do-you-really-need-both",
          "Bolsters vs pillows: do you really need both?",
          "A sample summary of when a bolster helps a side sleeper.",
          12,
        ),
        post(
          "b0000000-0000-4000-8000-000000000002",
          "how-to-choose-the-best-pillow-in-singapore",
          "How to choose the best pillow in Singapore",
          "A sample summary of choosing a pillow by sleeping position.",
          30,
        ),
      ],
    },
  };
}
