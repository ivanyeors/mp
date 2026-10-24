export { localeUrl, localeAlternates, resolveLocale } from "@/lib/seo/locale-url";
export { resolveAnswerLede, type AnswerLedeFields } from "@/lib/seo/answer-lede";
export { resolveMetaDescription, MAX_META_DESCRIPTION_CHARS } from "@/lib/seo/meta-description";
export { buildPageMetadata, type PageMetadataInput } from "@/lib/seo/metadata";
export {
  getReviewAggregate,
  getReviewAggregates,
  type ReviewAggregate,
} from "@/lib/seo/review-aggregate";
export {
  buildProductJsonLd,
  buildProductBreadcrumbJsonLd,
  buildConfiguratorProductJsonLd,
} from "@/lib/seo/jsonld-product";
export { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/seo/jsonld-organization";
export {
  buildArticleJsonLd,
  buildArticleBreadcrumbJsonLd,
  buildFaqPageJsonLd,
} from "@/lib/seo/jsonld-article";
export { buildLlmsIndex, type LlmsIndexProduct } from "@/lib/seo/llms-index";
export type { LandingRatings } from "@/lib/seo/review-aggregate";
