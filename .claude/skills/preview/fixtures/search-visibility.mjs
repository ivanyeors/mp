// Sample data for Analytics → Traffic & search: daily Search Console totals
// (seo_daily_metrics) and Google's page-by-page indexing answers
// (seo_url_inspections). Every figure and URL state here is made up.
//
// Scenarios: "empty-search" leaves both tables empty, as production looks
// before the first daily run. "stale-search" stops the daily totals nine days
// ago, as they look when the import has stopped.

const SITE = "https://www.mpillow.com";

export default function searchVisibility({ scenario, now }) {
  if (scenario === "empty-search") return { tables: { seo_url_inspections: [], seo_daily_metrics: [] } };

  const ago = (days) => new Date(now.getTime() - days * 86400e3).toISOString();
  const newestDay = scenario === "stale-search" ? 9 : 2;
  const totals = [];
  for (let d = 200; d >= newestDay; d--) {
    const wave = 1 + 0.25 * Math.sin(d / 7) + (200 - d) / 400;
    const impressions = Math.round(900 * wave);
    totals.push({
      date: ago(d).slice(0, 10),
      source: "gsc_web",
      dimension: "total",
      key: "",
      clicks: Math.round(impressions * 0.031),
      impressions,
      position_sum: impressions * (14 - (200 - d) / 40),
      extra: { property: "sc-domain:mpillow.com" },
      synced_at: ago(newestDay - 1),
    });
  }
  const row = (path, issue, extra = {}) => ({
    url: `${SITE}${path}`,
    property: "sc-domain:mpillow.com",
    in_sitemap: true,
    verdict: issue ? "NEUTRAL" : "PASS",
    coverage_state: issue ?? "Submitted and indexed",
    issue,
    issue_since: issue ? ago(6) : null,
    last_crawl_time: ago(2),
    inspection_link: "https://search.google.com/search-console/inspect",
    inspected_at: ago(0),
    ...extra,
  });

  const indexed = [
    "/en-US",
    "/en-US/shop",
    "/en-US/blog",
    "/en-US/mp-config",
    "/en-US/mbolster-config",
    "/en-US/guides/neck-pain",
    "/en-US/guides/cervical-pillow",
    "/en-US/guides/custom-pillow",
    "/en-US/faq",
    "/zh-CN",
    "/zh-CN/shop",
    "/zh-CN/mp-config",
  ].map((path) => row(path, null));

  return {
    tables: {
      seo_daily_metrics: totals,
      seo_url_inspections: [
        ...indexed,
        row("/zh-CN/guides/neck-pain", "Crawled - currently not indexed"),
        row("/zh-CN/guides/cervical-pillow", "Crawled - currently not indexed", { issue_since: ago(1) }),
        row("/zh-CN/blog/how-to-choose-a-pillow-for-side-sleepers-with-broad-shoulders", "Crawled - currently not indexed"),
        row("/en-US/shop/ear-comfort-pad", "Discovered - currently not indexed", { last_crawl_time: null }),
        row("/products/customised-pillow?variant=41200001", "Not found (404)", { in_sitemap: false, issue_since: ago(7) }),
        row("/blogs/news/best-pillow-for-neck-pain", "Not found (404)", { in_sitemap: false, issue_since: ago(7) }),
        row("/en-US/shop/slope-mattress", "Structured data: Product snippets: Missing field 'price'", {
          verdict: "PASS",
          coverage_state: "Submitted and indexed",
        }),
      ],
    },
  };
}
