/**
 * The Mpillow logo, pre-sized for the largest place it is shown (the
 * configurator welcome, 200px at 2x). Render it with `unoptimized`: through the
 * image optimizer every logo URL carries a per-deploy `dpl` parameter, so site
 * audits see four query parameters and a new set of URLs after every deploy.
 *
 * It is the only logo on the site: the brand's dark blue, in both themes and on
 * every surface. Where it would sit on something dark (the scrolled header, the
 * footer in dark mode, the chat avatar) that surface turns white instead. There
 * is deliberately no light-blue "inverted" logo; do not add one back.
 */
export const LOGO_SRC = "/mpillow-logo-400.webp";
