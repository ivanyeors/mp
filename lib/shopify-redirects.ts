import { blogSlugFate } from "@/lib/blog-redirects";

export type ShopifyRedirect = { status: 301 | 302; to: string } | { status: 410 };

const HOME = "/en-US";
const SHOP = "/en-US/shop";
const BLOG = "/en-US/blog";
const ACCOUNT = "/en-US/account";

const MOVED: Readonly<Record<string, string>> = {
  "/agents.md": "/llms.txt",
  "/blogs/information/a-word-from-the-founder": "/en-US/blog/what-led-to-the-creation-of-the-world-s-best-pillow",
  "/blogs/mpillow-blogs/benefits-of-hugging-a-bolster-in-sleep": "/en-US/blog/the-complete-guide-to-choosing-the-right-bolster-in-singapore",
  "/blogs/mpillow-blogs/bolster-vs-body-pillow": "/en-US/blog/bolsters-vs-pillows-do-you-really-need-both",
  "/blogs/mpillow-blogs/cervical-pillow-for-neck-pain-how-the-right-pillow-can-improve-your-sleep-and-reduce-neck-pain": "/en-US/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief",
  "/blogs/mpillow-blogs/cervical-support-pillow-vs-regular-pillow-which-one-is-better-for-neck-pain": "/en-US/blog/ergonomic-pillow-vs-regular-pillow-is-it-worth-the-investment",
  "/blogs/mpillow-blogs/employee-wellness-corporate-gifts-singapore": "/en-US",
  "/blogs/mpillow-blogs/everything-about-cervical-support-pillows": "/en-US/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief",
  "/blogs/mpillow-blogs/finding-the-best-pillow-for-neck-pain-an-evidence-based-guide": "/en-US/guides/neck-pain",
  "/blogs/mpillow-blogs/how-do-bolster-pillows-improve-sleep-quality-and-body-support": "/en-US/blog/the-complete-guide-to-choosing-the-right-bolster-in-singapore",
  "/blogs/mpillow-blogs/how-to-choose-the-best-pillow-for-neck-and-shoulder-pain": "/en-US/blog/what-is-the-best-pillow-for-neck-pain-in-singapore",
  "/blogs/mpillow-blogs/how-to-choose-the-right-pillow-for-your-sleeping-position": "/en-US/blog/side-sleeper-pillow-your-ultimate-guide-for-alignment-pain-relief",
  "/blogs/mpillow-blogs/side-sleeper-pillow-how-to-choose-the-right-pillow-height-and-support": "/en-US/blog/side-sleeper-pillow-your-ultimate-guide-for-alignment-pain-relief",
  "/blogs/mpillow-blogs/side-sleeper-pillow-why-sleeping-position-matters-more-than-you-think": "/en-US/blog/side-sleeper-pillow-your-ultimate-guide-for-alignment-pain-relief",
  "/blogs/mpillow-blogs/sleep-hygiene-how-your-bedroom-setup-affects-your-sleep-quality": "/en-US/blog/how-often-should-you-replace-your-pillow-and-why-it-matters-for-neck-pain-amp-sleep-quality",
  "/blogs/mpillow-blogs/sleeping-stiff-how-the-right-bolster-restores-your-spinal-alignment": "/en-US/blog/the-complete-guide-to-choosing-the-right-bolster-in-singapore",
  "/blogs/mpillow-blogs/systematic-review-pillow-design-neck-pain-cervicogenic-headache": "/en-US/guides/neck-pain",
  "/blogs/mpillow-blogs/the-anatomical-reason-side-sleepers-have-more-shoulder-pain-and-the-pillow-solution": "/en-US/blog/side-sleeper-pillow-your-ultimate-guide-for-alignment-pain-relief",
  "/blogs/mpillow-blogs/the-roi-of-sleep-how-an-ergonomic-pillow-reduces-pain-and-increases-productivity": "/en-US/blog/ergonomic-pillow-vs-regular-pillow-is-it-worth-the-investment",
  "/blogs/mpillow-blogs/the-science-of-cervical-neck-pain-and-why-your-pillow-is-making-it-worse": "/en-US/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief",
  "/blogs/mpillow-blogs/the-ultimate-guide-to-choosing-the-best-pillow-for-neck-pain-in-singapore": "/en-US/blog/what-is-the-best-pillow-for-neck-pain-in-singapore",
  "/blogs/mpillow-blogs/the-ultimate-guide-to-washing-your-pillow-how-to-clean-and-care-for-it": "/en-US/mp-care",
  "/blogs/mpillow-blogs/the-washable-revolution-why-100-machine-washable-bedding-is-the-top-wellness-priority-in-singapore-s-2026-climate": "/en-US/mp-care",
  "/blogs/mpillow-blogs/what-is-a-cervical-pillow-and-how-do-i-know-if-i-need-one": "/en-US/guides/cervical-pillow",
  "/blogs/mpillow-blogs/what-is-the-best-pillow-for-neck-pain-a-guide-to-choosing-a-cervical-support-pillow-in-singapore": "/en-US/blog/what-is-the-best-pillow-for-neck-pain-in-singapore",
  "/blogs/mpillow-blogs/what-is-the-best-sleeping-position-to-prevent-neck-pain": "/en-US/blog/side-sleeper-pillow-your-ultimate-guide-for-alignment-pain-relief",
  "/blogs/mpillow-blogs/why-customised-pillows-are-the-secret-to-better-sleep": "/en-US/guides/custom-pillow",
  "/blogs/mpillow-blogs/why-do-i-wake-up-with-neck-pain-every-morning": "/en-US/blog/what-is-the-best-pillow-for-neck-pain-in-singapore",
  "/blogs/mpillow-blogs/why-you-wake-up-with-neck-pain-and-how-the-right-pillow-can-fix-it": "/en-US/blog/what-is-the-best-pillow-for-neck-pain-in-singapore",
  "/blogs/mpillow-blogs/why-your-2026-digital-detox-is-failing-the-critical-link-between-spinal-alignment-and-mental-rest": "/en-US",
  "/blogs/news/3-min-neck-pain-relief-stretches": "/en-US/blog/improve-good-posture-habits-with-exercises-and-home-remedies",
  "/blogs/tips-exercises/3-min-neck-pain-relief-stretches": "/en-US/blog/improve-good-posture-habits-with-exercises-and-home-remedies",
  "/collections/mbolsters": "/en-US/mbolster-config",
  "/collections/pillows": "/en-US/mp-config",
  "/pages/about-mellow-life-pte-ltd": "/en-US/blog/what-led-to-the-creation-of-the-world-s-best-pillow",
  "/pages/accessories": "/en-US/shop",
  "/pages/ambassadors": "/en-US/our-partners",
  "/pages/basic-ergonomic-pillow": "/en-US/mp-config",
  "/pages/basic-mpillow-care-instructions": "/en-US/mp-care",
  "/pages/bespoke-mpillow": "/en-US/mp-config",
  "/pages/bolster-mbolster": "/en-US/mbolster-config",
  "/pages/book-online": "/en-US/appointments?type=customisation",
  "/pages/cervical-support-pillow-customisable-pillow": "/en-US/guides/cervical-pillow",
  "/pages/choosing-the-right-cervical-pillow-for-neck-pain-relief": "/en-US/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief",
  "/pages/compare-mpillows": "/en-US/blog/which-mpillow-configuration-is-for-you",
  "/pages/configuration-guide": "/en-US/blog/which-mpillow-configuration-is-for-you",
  "/pages/contact": "/en-US/support",
  "/pages/frequently-asked-questions-mpillow": "/en-US/faq",
  "/pages/heightguarantee": "/en-US/shipping-refund-policies",
  "/pages/mbolster": "/en-US/mbolster-config",
  "/pages/mbolster-customisation": "/en-US/mbolster-config",
  "/pages/measurement-guide": "/en-US/appointments?type=customisation",
  "/pages/our-partners": "/en-US/our-partners",
  "/pages/our-story": "/en-US/blog/what-led-to-the-creation-of-the-world-s-best-pillow",
  "/pages/pillow-assembly-guide": "/en-US/mp-care",
  "/pages/pillow-care": "/en-US/mp-care",
  "/pages/pillow-selection": "/en-US/blog/which-mpillow-configuration-is-for-you",
  "/pages/pre-shop": "/en-US/shop",
  "/pages/premium-customised-pillow": "/en-US/mp-config",
  "/pages/product-care": "/en-US/mp-care",
  "/pages/select-customisation-tier": "/en-US/mp-config",
  "/pages/size-chart": "/en-US/mp-config",
  "/pages/size-matters": "/en-US/our-partners",
  "/pages/size-matters-1": "/en-US/mp-config",
  "/pages/standard-customisation": "/en-US/mp-config",
  "/pages/stretching-exercising": "/en-US/blog/improve-good-posture-habits-with-exercises-and-home-remedies",
  "/pages/the-mpillow": "/en-US/mp-config",
  "/pages/wash-care-guide": "/en-US/mp-care",
  "/policies/contact-information": "/en-US/support",
  "/policies/privacy-policy": "/en-US/privacy-policy",
  "/policies/refund-policy": "/en-US/shipping-refund-policies",
  "/policies/shipping-policy": "/en-US/shipping-refund-policies",
  "/policies/terms-of-service": "/en-US/terms-of-service",
  "/products/3d-soft-fillings": "/en-US/mp-config",
  "/products/basic-ergonomic-pillow": "/en-US/mp-config",
  "/products/bolsters": "/en-US/mbolster-config",
  "/products/cooling-fibre-mpillow-ergonomic-pillow-for-shoulder-neck-pain": "/en-US/mp-config",
  "/products/ear-comfort-pad": "/en-US/shop/ear-comfort-pad",
  "/products/fibrecool-case": "/en-US/shop/fibrecool-pillow-case",
  "/products/linen-case": "/en-US/shop/natural-white-linen-pillow-case",
  "/products/measurement-readjustment-services": "/en-US/appointments?type=customisation",
  "/products/mpillow-slope-mattress-gentle-elevation-for-better-sleep-relief": "/en-US/shop/slope-mattress",
  "/products/neck-support-insert": "/en-US/shop/cervical-neck-support",
  "/products/terrywaterproof-inner-protector": "/en-US/shop/waterproof-inner-pillow-protector",
};

const KEPT_PARAM = /^(utm_[a-z_]+|gclid|gbraid|wbraid|fbclid|msclkid|ttclid)$/i;

const GONE: ShopifyRedirect = { status: 410 };
const moved = (to: string): ShopifyRedirect => ({ status: 301, to });
const session = (to: string): ShopifyRedirect => ({ status: 302, to });

function normalise(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {}
  return path.toLowerCase().replace(/\/+$/, "") || "/";
}

export function shopifyRedirect(pathname: string): ShopifyRedirect | null {
  let path = normalise(pathname);
  if (Object.hasOwn(MOVED, path)) return moved(MOVED[path]);

  if (/^\/sitemap_[a-z0-9_]+\.xml$/.test(path)) return GONE;
  if (/^\/(products|collections|blogs)(\/[^/]+)*\.(json|js|atom|xml|oembed)$/.test(path)) return GONE;

  const inCollection = path.match(/^\/collections\/[^/]+\/products\/([^/]+)$/);
  if (inCollection) {
    path = `/products/${inCollection[1]}`;
    if (Object.hasOwn(MOVED, path)) return moved(MOVED[path]);
  }
  if (/^\/products\/[^/]+$/.test(path)) return moved(SHOP);
  if (path === "/collections" || path.startsWith("/collections/")) return moved(SHOP);
  if (path === "/pages" || path.startsWith("/pages/")) return moved(HOME);
  if (path === "/policies" || path.startsWith("/policies/")) return moved(HOME);

  if (path === "/blogs" || /^\/blogs\/[^/]+(\/tagged(\/.*)?)?$/.test(path)) return moved(BLOG);
  const post = path.match(/^\/blogs\/[^/]+\/([^/]+)$/)?.[1];
  if (post) {
    const fate = blogSlugFate(post);
    if (fate?.kind === "gone") return moved(HOME);
    return moved(`${BLOG}/${fate?.kind === "merged" ? fate.into : post}`);
  }

  if (path === "/cart" || path.startsWith("/cart/")) return session(`${SHOP}/cart`);
  if (path === "/search") return session(SHOP);
  if (/^\/(\d+\/)?(checkouts|orders)(\/|$)/.test(path)) return session(ACCOUNT);
  if (path.startsWith("/customer_authentication")) return session(ACCOUNT);
  if (/^\/account\/(register|activate|reset|logout|invalid_token)(\/|$)/.test(path)) return session(ACCOUNT);

  return null;
}

export function shopifyRedirectUrl(to: string, origin: string, search: URLSearchParams): URL {
  const url = new URL(to, origin);
  for (const [key, value] of search) {
    if (KEPT_PARAM.test(key)) url.searchParams.append(key, value);
  }
  return url;
}
