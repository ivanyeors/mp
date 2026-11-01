/**
 * The Mpillow logo, pre-sized for the largest place it is shown (the
 * configurator welcome, 200px at 2x). Render it with `unoptimized`: through the
 * image optimizer every logo URL carries a per-deploy `dpl` parameter, so site
 * audits see four query parameters and a new set of URLs after every deploy.
 *
 * It is the only logo on the site: the brand's dark blue, in both themes and on
 * every surface. The scrolled header pill and the chat avatar are white so it
 * reads there; the footer shows it as is. There is deliberately no light-blue
 * "inverted" logo; do not add one back.
 */
export const LOGO_SRC = "/mpillow-logo-400.webp";
