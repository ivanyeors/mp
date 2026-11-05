"use client";

import * as React from "react";

import { Progress } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";
import { HEADER_SLUG } from "@/lib/slide-in-pages/content";
import { HEADER_SECTION_TYPE } from "@/lib/slide-in-pages/fields";
import { SLIDE_IN_PAGES, type SlideInPageKey } from "@/lib/slide-in-pages/pages";
import type { SlideInSectionView } from "@/lib/slide-in-pages/sections";

import { PreviewSectionFrame, SlideInPageSections, useSlideInHeader } from "./slide-in-content";

/**
 * **Preview mode** for a sub page: the slide-in's header and body laid out as the open
 * sheet lays them out, but as a plain page, so the builder's frame can scroll it and pick
 * sections from it. The body is `SlideInPageSections` — the component the live sheet
 * renders — with drafts in place of published content.
 */
export function SlideInPagePreview({
  page,
  views,
}: {
  page: SlideInPageKey;
  views: SlideInSectionView[];
}) {
  const { locale } = useI18n();
  const header = useSlideInHeader(page, views);
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);

  // Some templates close the sheet they sit in (Premium's overseas "Customise" link), and
  // a sheet's close button needs a sheet around it. Here there is no sheet to close, so a
  // closed one stands in; it renders nothing of its own.
  return (
    <Sheet>
      <div className="min-h-screen bg-muted/30 md:p-6">
        <div className="mx-auto min-h-[calc(100vh-3rem)] overflow-clip bg-background md:rounded-2xl md:border md:shadow-sm">
          <PreviewSectionFrame
            slug={HEADER_SLUG}
            type={HEADER_SECTION_TYPE}
            className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur"
          >
            <div className="flex flex-col gap-1.5 px-3 py-3 md:px-8 md:py-6 md:pr-12">
              <h2 className="font-semibold text-foreground">{header.title}</h2>
              <p className="text-sm text-muted-foreground">{header.description}</p>
            </div>
            <div className="px-3 pb-2 md:px-8 md:pb-5">
              <Progress value={0} className="h-1" />
            </div>
          </PreviewSectionFrame>

          <div className={SLIDE_IN_PAGES[page].bodyClassName}>
            <SlideInPageSections page={page} previewViews={views} resolveHref={to} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
