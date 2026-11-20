"use client";

import * as React from "react";

import { ProductSlideSectionRenderer } from "@/components/product-sections/product-slide-section-renderer";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";
import {
  applyCopyOverride,
  applyMediaOverride,
  copyOverrideFor,
  HEADER_SLUG,
  headerDefaults,
} from "@/lib/slide-in-pages/content";
import { slideAuxMessages, slideMessages, SLIDE_IN_PAGES, type SlideInPageKey } from "@/lib/slide-in-pages/pages";
import {
  orderedSlideSections,
  slideInSectionViews,
  type SlideInSectionRow,
  type SlideInSectionView,
} from "@/lib/slide-in-pages/sections";
import { cn } from "@/lib/utils";

type ProvidedRow = Pick<SlideInSectionRow, "page" | "slug" | "section_type" | "position" | "visible" | "content">;

const SlideInRowsContext = React.createContext<readonly ProvidedRow[]>([]);

export function SlideInContentProvider({
  rows,
  children,
}: {
  rows: readonly ProvidedRow[];
  children: React.ReactNode;
}) {
  return <SlideInRowsContext.Provider value={rows}>{children}</SlideInRowsContext.Provider>;
}

function asRows(rows: readonly ProvidedRow[]): SlideInSectionRow[] {
  return rows.map((row) => ({ id: "", ...row }));
}

function usePublishedViews(page: SlideInPageKey): SlideInSectionView[] {
  const rows = React.useContext(SlideInRowsContext);
  return React.useMemo(() => slideInSectionViews(page, asRows(rows), "published"), [page, rows]);
}

export function useSlideInHeader(page: SlideInPageKey, views?: readonly SlideInSectionView[]) {
  const { m, locale } = useI18n();
  const published = usePublishedViews(page);
  const header = (views ?? published).find((v) => v.slug === HEADER_SLUG);
  const messages = slideMessages(m, page);
  const copy = applyCopyOverride("header", headerDefaults(messages), copyOverrideFor(header?.content, locale));
  return { title: String(copy.title ?? ""), description: String(copy.description ?? "") };
}

interface SlideInPageSectionsProps {
  page: SlideInPageKey;
  resolveHref?: (href: string) => string;
  previewViews?: readonly SlideInSectionView[];
}

export function SlideInPageSections({ page, resolveHref, previewViews }: SlideInPageSectionsProps) {
  const { m, locale } = useI18n();
  const published = usePublishedViews(page);
  const views = previewViews ?? published;
  const preview = previewViews != null;

  const { sections, copyOverrides, hidden } = React.useMemo(() => {
    const ordered = orderedSlideSections(page, views).filter((s) => preview || s.view.visible);
    const overrides: Record<string, Record<string, unknown>> = {};
    const hiddenKeys = new Set<string>();
    const configs: ProductSlideSectionConfig[] = ordered.map(({ config, view }) => {
      const copy = copyOverrideFor(view.content, locale);
      if (Object.keys(copy).length > 0) overrides[config.key] = copy;
      if (!view.visible) hiddenKeys.add(config.key);
      return applyMediaOverride(config, view.content.media);
    });
    return { sections: configs, copyOverrides: overrides, hidden: hiddenKeys };
  }, [page, views, locale, preview]);

  const def = SLIDE_IN_PAGES[page];

  return (
    <ProductSlideSectionRenderer
      sections={sections}
      messages={slideMessages(m, page)}
      auxMessages={slideAuxMessages(m, page)}
      commonMessages={def.usesCommonMessages ? (m.common as unknown as Record<string, unknown>) : undefined}
      resolveHref={resolveHref}
      copyOverrides={copyOverrides}
      wrapSection={
        preview
          ? (section, node) => (
              <PreviewSectionFrame slug={section.key} type={section.type} hidden={hidden.has(section.key)}>
                {node}
              </PreviewSectionFrame>
            )
          : undefined
      }
    />
  );
}

export function PreviewSectionFrame({
  slug,
  type,
  hidden,
  className,
  children,
}: {
  slug: string;
  type: string;
  hidden?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-builder-section={slug}
      data-section-type={type}
      data-preview-hidden={hidden ? "" : undefined}
      className={cn(hidden ? "relative opacity-40 grayscale" : undefined, className)}
    >
      {hidden ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
          Hidden
        </div>
      ) : null}
      {children}
    </div>
  );
}
