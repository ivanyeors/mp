/**
 * The Mpillow logo, pre-sized for the largest place it is shown (the
 * configurator welcome, 200px at 2x). Render it with `unoptimized`: through the
 * image optimizer every logo URL carries a per-deploy `dpl` parameter, so site
 * audits see four query parameters and a new set of URLs after every deploy.
 */
export const LOGO_SRC = "/mpillow-logo-400.webp";

/** The white logo for dark backgrounds, shown at 128px or less. */
export const LOGO_INV_SRC = "/mpillow-logo-inv-256.webp";
