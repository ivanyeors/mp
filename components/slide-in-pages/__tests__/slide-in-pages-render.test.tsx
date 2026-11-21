import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { I18nMessagesProvider } from "@/lib/i18n/messages/provider";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import { SLIDE_IN_PAGE_KEYS, SLIDE_IN_PAGES } from "@/lib/slide-in-pages/pages";
import { slideInSectionViews, type SlideInSectionRow } from "@/lib/slide-in-pages/sections";

const nav = vi.hoisted(() => ({ pathname: "/en-US/page-builder-preview/basic-mpillow" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { SlideInPagePreview } = await import("@/components/slide-in-pages/slide-in-page-preview");
const { SlideInContentProvider, SlideInPageSections } = await import("@/components/slide-in-pages/slide-in-content");
const { Sheet } = await import("@/components/ui/sheet");

function row(partial: Partial<SlideInSectionRow> & Pick<SlideInSectionRow, "page" | "slug">): SlideInSectionRow {
  return { id: `row-${partial.slug}`, section_type: "split_hero", position: 0, visible: true, content: {}, ...partial };
}

describe("Preview mode for each sub page", () => {
  it.each(SLIDE_IN_PAGE_KEYS)("%s renders every section, selectable", (page) => {
    nav.pathname = `/en-US/page-builder-preview/${page}`;
    const html = renderToString(<SlideInPagePreview page={page} views={slideInSectionViews(page, [], "draft")} />);
    expect(html).toContain('data-builder-section="header"');
    for (const section of SLIDE_IN_PAGES[page].sections) {
      expect(html).toContain(`data-builder-section="${section.key}"`);
    }
  });

  it("shows each language its own edit, and the other language its default", () => {
    const rows = [
      row({
        page: "premium-mpillow",
        slug: "trust",
        section_type: "trust_strip",
        position: 1,
        draft_content: {
          copy: { "en-US": { items: [{ label: "Two-year warranty" }] }, "zh-CN": { items: [{ label: "两年保修" }] } },
        },
      }),
      row({ page: "premium-mpillow", slug: "header", section_type: "header", draft_content: { copy: { "en-US": { title: "Premium, fitted" } } } }),
    ];
    const views = slideInSectionViews("premium-mpillow", rows, "draft");

    nav.pathname = "/en-US/page-builder-preview/premium-mpillow";
    const en = renderToString(<SlideInPagePreview page="premium-mpillow" views={views} />);
    expect(en).toContain(">Two-year warranty<");
    expect(en).toContain(">Premium, fitted<");

    nav.pathname = "/zh-CN/page-builder-preview/premium-mpillow";
    const zh = renderToString(
      <I18nMessagesProvider locale="zh-CN" messages={zhCN}>
        <SlideInPagePreview page="premium-mpillow" views={views} />
      </I18nMessagesProvider>,
    );
    expect(zh).toContain(">两年保修<");
    expect(zh).not.toContain("Two-year warranty");
    expect(zh).toContain(`>${zhCN.slides.premiumMpillow.title}<`);
  });

  it("marks a hidden section instead of dropping it", () => {
    nav.pathname = "/en-US/page-builder-preview/basic-mpillow";
    const views = slideInSectionViews(
      "basic-mpillow",
      [row({ page: "basic-mpillow", slug: "sizing-video", section_type: "video_section", position: 4, draft_visible: false })],
      "draft",
    );
    const html = renderToString(<SlideInPagePreview page="basic-mpillow" views={views} />);
    expect(html).toMatch(/data-builder-section="sizing-video"[^>]*data-preview-hidden=""/);
  });
});

describe("live sub pages", () => {
  it("leave out a hidden section and use a replaced image", () => {
    nav.pathname = "/en-US";
    const rows = [
      row({ page: "basic-mpillow", slug: "sizing-video", section_type: "video_section", visible: false, position: 4 }),
      row({ page: "basic-mpillow", slug: "hero", content: { media: { image: { src: "/replaced-hero.webp" } } } }),
    ];
    const html = renderToString(
      <SlideInContentProvider rows={rows}>
        <Sheet>
          <SlideInPageSections page="basic-mpillow" />
        </Sheet>
      </SlideInContentProvider>,
    );
    expect(html).not.toContain(enUS.slides.basicMpillow.sizingChartTitle);
    expect(html).toContain(enUS.slides.basicMpillow.sizeTitle);
    expect(html).toContain("replaced-hero.webp");
    expect(html).not.toContain("data-builder-section");
  });
});
