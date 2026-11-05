/**
 * How a Storefront product's body reads: one look, shared by the product
 * page's Description tab, the product editor's visual editor and ✨ Write's
 * preview, so what Staff edit is what shoppers see. Kept apart from the
 * editor so the product page carries none of TipTap.
 *
 * Its rules are the elements a body is written in (lib/markdown/product-markdown.ts),
 * plus the few a body written as Markdown may still hold (an image, code, a
 * divider), so those don't fall back to the browser's defaults.
 */
export const PRODUCT_BODY_STYLE = [
  "break-words text-base leading-relaxed text-foreground/90",
  "[&>*+*]:mt-4",
  "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground",
  "[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&>h2:first-child]:mt-0",
  "[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&>h3:first-child]:mt-0",
  "[&_h4]:mt-5 [&_h4]:font-semibold [&_h4]:text-foreground",
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:pl-6 [&_li]:mt-1.5 [&_li>p]:m-0 [&_li::marker]:text-muted-foreground",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
  "[&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_hr]:my-8 [&_hr]:border-border",
  "[&_img]:rounded-lg",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
].join(" ");
