"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AiWritingAvailability } from "@/lib/ai/availability";
import type { ProductAiRequest, ProductAiResult } from "@/lib/ecommerce/ai-product-shape";
import { PRODUCT_LOCALES, PRODUCT_SOURCE_LOCALE, type ProductLocale } from "@/lib/ecommerce/product-locales";
import type { Locale } from "@/lib/i18n/locales";
import { productMetaDescription } from "@/lib/seo/page-meta";
import { PRODUCT_SEO_TARGETS, PRODUCT_TITLE_BRAND, PRODUCT_TITLE_SUFFIX, countWords, displayWidth, productPageTitle } from "@/lib/seo/product-seo";
import type { LocalizedProductContent } from "@/lib/types/ecommerce";
import { GenerateSeo, Meter, SeoOfferView, type ContentMap, type Offer } from "./product-ai";

/**
 * The product editor's SEO card: the slug, then one tab per language
 * (`PRODUCT_LOCALES`, so a new language gets its own tab), each with what a
 * search result shows of the page, its three fields measured as search
 * results cut them, and ✨ Generate SEO for that language.
 */

type SeoResult = Extract<ProductAiResult, { kind: "seo" }>;

/** `text` cut to `max` letters wide, as a search result cuts it. */
function clampWidth(text: string, max: number): string {
  if (displayWidth(text) <= max) return text;
  let out = "";
  for (const ch of text) {
    if (displayWidth(out + ch) > max - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

const siteHost = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://custom.mpillow.com").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** What a search result shows of the page in this language: its real title and description, as the page renders them. */
function SearchPreview({ locale, slug, c }: { locale: Locale; slug: string; c: LocalizedProductContent }) {
  const name = c.seo_title?.trim() || c.title?.trim() || slug;
  const title = productPageTitle(name);
  const description = productMetaDescription(c, locale);
  return (
    <figure className="rounded-lg border bg-background p-3" aria-label="Search preview">
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground">Search preview</figcaption>
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[0.625rem] font-semibold">
          M
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-xs text-foreground">Mpillow</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {siteHost()} › {locale} › shop › {slug || "…"}
          </p>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-1 text-[1.0625rem] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{clampWidth(title, PRODUCT_SEO_TARGETS.title.max)}</p>
      <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{clampWidth(description, PRODUCT_SEO_TARGETS.description.max + 5)}</p>
    </figure>
  );
}

export function SeoCard({
  slug,
  onSlug,
  slugLocked,
  content,
  update,
  ai,
  offer,
  onRun,
  onClear,
}: {
  slug: string;
  onSlug: (slug: string) => void;
  /** Set by inventory: shown, not edited. */
  slugLocked: boolean;
  content: ContentMap;
  update: (locale: Locale, field: keyof LocalizedProductContent, value: string) => void;
  ai: AiWritingAvailability;
  offer: Offer<SeoResult> | null;
  onRun: (request: ProductAiRequest) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [locale, setLocale] = useState<Locale>(PRODUCT_SOURCE_LOCALE);

  const apply = (r: SeoResult, take: { seoTitle: boolean; seoAnswer: boolean; seoDescription: boolean }) => {
    if (take.seoTitle) update(r.locale, "seo_title", r.seoTitle);
    if (take.seoAnswer) update(r.locale, "seo_answer", r.seoAnswer);
    if (take.seoDescription) update(r.locale, "seo_description", r.seoDescription);
    onClear();
  };

  const tab = (l: ProductLocale) => {
    const c = content[l.code] ?? { title: "" };
    const name = c.seo_title?.trim() || c.title?.trim() || slug;
    const lede = PRODUCT_SEO_TARGETS.lede[l.counts];
    const mine = offer && offer.request.locale === l.code ? offer : null;
    return (
      <TabsContent key={l.code} value={l.code} className="space-y-4 pt-3">
        {mine ? <SeoOfferView key={mine.status} offer={mine} onUse={apply} onTryAgain={() => onRun(mine.request)} onDiscard={onClear} /> : null}
        <SearchPreview locale={l.code} slug={slug} c={c} />
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`seo-title-${l.code}`}>SEO title</Label>
            <Meter n={displayWidth(productPageTitle(name))} range={PRODUCT_SEO_TARGETS.title} title="How wide the whole title is in search results, the brand included" />
          </div>
          <Input
            id={`seo-title-${l.code}`}
            value={c.seo_title ?? ""}
            onChange={(e) => update(l.code, "seo_title", e.target.value)}
            placeholder={c.title?.trim() || "Defaults to the product title"}
            aria-describedby={`seo-title-${l.code}-hint`}
          />
          <p id={`seo-title-${l.code}-hint`} className="text-xs text-muted-foreground">
            {name.includes(PRODUCT_TITLE_BRAND) ? "Names the brand, so it shows as written." : `“${PRODUCT_TITLE_SUFFIX.trim()}” is added after it.`} Empty uses the product title.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`seo-answer-${l.code}`}>Answer lede</Label>
            <Meter n={countWords(c.seo_answer ?? "", l.counts)} range={lede} unit={l.counts} />
          </div>
          <Textarea
            id={`seo-answer-${l.code}`}
            value={c.seo_answer ?? ""}
            onChange={(e) => update(l.code, "seo_answer", e.target.value)}
            placeholder="A direct answer to “What is this?”, shown under the product title"
            rows={5}
            aria-describedby={`seo-answer-${l.code}-hint`}
          />
          <p id={`seo-answer-${l.code}-hint`} className="text-xs text-muted-foreground">
            What AI answers quote. Aim for {lede.min} to {lede.max} {l.counts}.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor={`seo-desc-${l.code}`}>SEO description</Label>
            <Meter n={displayWidth(c.seo_description ?? "")} range={PRODUCT_SEO_TARGETS.description} title="How wide it is in search results" />
          </div>
          <Textarea
            id={`seo-desc-${l.code}`}
            value={c.seo_description ?? ""}
            onChange={(e) => update(l.code, "seo_description", e.target.value)}
            placeholder="Defaults to the short description"
            rows={3}
            aria-describedby={`seo-desc-${l.code}-hint`}
          />
          <p id={`seo-desc-${l.code}-hint`} className="text-xs text-muted-foreground">
            Under the title in search results. Aim for {PRODUCT_SEO_TARGETS.description.min} to {PRODUCT_SEO_TARGETS.description.max}
            {l.counts === "characters" ? " (a Chinese character counts as two)" : ""}.
          </p>
        </div>
      </TabsContent>
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between text-left transition-opacity active:opacity-60 max-md:min-h-11">
              <CardTitle>SEO</CardTitle>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="slug-input">Slug</Label>
              <Input
                id="slug-input"
                value={slug}
                onChange={(e) => onSlug(e.target.value)}
                placeholder="product-slug"
                className="text-base md:text-sm"
                disabled={slugLocked}
                aria-describedby={slugLocked ? "slug-input-hint" : undefined}
              />
              {slugLocked ? (
                <p id="slug-input-hint" className="text-xs text-muted-foreground">
                  Set by inventory. The same in every language.
                </p>
              ) : null}
            </div>
            <Tabs value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              {/* The strip takes what the button leaves, and turns into a menu when the languages outgrow it. */}
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <TabsList aria-label="Language">
                    {PRODUCT_LOCALES.map((l) => {
                      const missing = !content[l.code]?.seo_answer?.trim();
                      return (
                        <TabsTrigger key={l.code} value={l.code}>
                          {l.label}
                          {missing ? (
                            <>
                              <span aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" title="No answer lede yet" />
                              <span className="sr-only">, no answer lede yet</span>
                            </>
                          ) : null}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>
                {ai.on ? <GenerateSeo ai={ai} locale={locale} content={content} offer={offer} onRun={onRun} onStop={onClear} /> : null}
              </div>
              {PRODUCT_LOCALES.map(tab)}
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
