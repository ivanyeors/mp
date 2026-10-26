// ============================================================
// Email design tokens — mirrors the landing page
// ============================================================
//
// Every value here is resolved from the site's own tokens so email and web stay
// one design language:
//   - palette  → app/globals.css `:root` / `.dark` (shadcn "neutral", achromatic)
//   - radii    → app/globals.css `--radius: 0.625rem` and its derived scale
//   - fonts    → lib/font-stack.ts, the site's one typeface as a font stack
//   - footer   → components/ui/marketing-footer.tsx (kept in sync by a test)
//
// The oklch values in globals.css are the Tailwind `neutral` ramp, so they map
// to exact hexes. Email clients understand neither oklch nor CSS variables, so
// the hexes are literal here — this module is the ONLY place they appear.

import { FONT_STACK } from "@/lib/font-stack";

/**
 * Light palette — `:root` in globals.css.
 *
 * `page` is the ONE deliberate departure: the site's `--background` is pure
 * `#ffffff`, but an email needs the page behind the card to differ from the card
 * itself or the layout has no edges. neutral-50 is the next rung down.
 */
export const LIGHT = {
  page: "#fafafa", // departure: --background is #ffffff (see above)
  card: "#ffffff", // --card / --background
  fg: "#0a0a0a", // --foreground        oklch(0.145 0 0)
  mutedBg: "#f5f5f5", // --muted          oklch(0.97 0 0)
  mutedFg: "#737373", // --muted-foreground oklch(0.556 0 0)
  border: "#e5e5e5", // --border          oklch(0.922 0 0)
  primary: "#171717", // --primary        oklch(0.205 0 0)
  primaryFg: "#fafafa", // --primary-foreground oklch(0.985 0 0)
  destructive: "#e7000b", // --destructive
} as const;

/**
 * Dark palette — `.dark` in globals.css.
 *
 * `border` is the departure here: the site uses `rgba(255,255,255,0.10)`, which
 * Outlook mishandles on table borders. It is flattened to that alpha composited
 * over the CARD (`#171717`), because that is where borders actually sit.
 */
export const DARK = {
  page: "#0a0a0a", // --background       oklch(0.145 0 0)
  card: "#171717", // --card            oklch(0.205 0 0)
  fg: "#fafafa", // --foreground        oklch(0.985 0 0)
  mutedBg: "#262626", // --muted         oklch(0.269 0 0)
  mutedFg: "#a1a1a1", // --muted-foreground oklch(0.708 0 0)
  border: "#2e2e2e", // departure: rgba(255,255,255,.10) over #171717
  primary: "#e5e5e5", // --primary       oklch(0.922 0 0)
  primaryFg: "#171717", // --primary-foreground oklch(0.205 0 0)
  destructive: "#ff6467", // --destructive
} as const;

/**
 * Radius scale. `--radius: 0.625rem` (10px) with the shadcn-derived rungs, plus
 * the two fixed Tailwind values the site actually uses on these elements:
 * buttons are `--radius-button` (16px) and landing surfaces are `rounded-2xl`
 * (16px), while shadcn Card is `rounded-xl` = `--radius + 4` (14px).
 */
export const RADIUS = {
  sm: 6, // --radius-sm  calc(--radius - 4px)
  md: 8, // --radius-md  calc(--radius - 2px)
  lg: 10, // --radius-lg  --radius
  xl: 14, // --radius-xl  calc(--radius + 4px) — shadcn Card
  button: 16, // --radius-button calc(--radius-md * 2)
  surface: 16, // rounded-2xl — the landing section surface
} as const;

/**
 * Type scale. Sizes are the email-appropriate rung of the site scale — email
 * bodies read at 14-16px rather than the site's responsive 16/18px.
 */
export const TYPE = {
  // tracking matches Tailwind `tracking-tight` (-0.025em), used across the
  // landing sections; weight 600 matches their `font-semibold`.
  h1: { size: 24, lh: 30, weight: 600, family: FONT_STACK, tracking: "-0.025em" },
  h2: { size: 18, lh: 26, weight: 600, family: FONT_STACK, tracking: "-0.025em" },
  h3: { size: 14, lh: 20, weight: 600, family: FONT_STACK, tracking: "0" },
  body: { size: 14, lh: 22, weight: 400, family: FONT_STACK, tracking: "0" },
  small: { size: 12, lh: 18, weight: 400, family: FONT_STACK, tracking: "0" },
  /** Large display figure — money callouts. */
  figure: { size: 24, lh: 30, weight: 600, family: FONT_STACK, tracking: "0" },
  code: { size: 28, lh: 36, weight: 700, family: FONT_STACK, tracking: "0.2em" },
  /** Button label. Sans, matching components/ui/button.tsx (text-sm/medium). */
  button: { size: 14, lh: 44, weight: 500, family: FONT_STACK, tracking: "0" },
} as const;

export const LAYOUT = {
  /** Up from the old 560 — the order line-item table needs the room. */
  containerWidth: 600,
  outerPadding: 24,
  cardPadding: 28,
  gutter: 16,
  /**
   * Fixed pixel size the logo renders at (square source, so w === h).
   *
   * The art is a STACKED LOCKUP — the "m" mark above the word "pillow" — so the
   * wordmark is only about a fifth of the box. At the old 48px it rendered ~10px
   * tall and stopped being legible; 64 is the smallest size that still reads as
   * the brand in a left-aligned header.
   */
  logoSize: 64,
} as const;

/** Spacing scale, in px. Mirrors Tailwind's 1/1.5/2/2.5/3/5/6/7 rungs. */
export const SPACE = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 20,
  "3xl": 24,
} as const;

export const BRAND = {
  name: "Mpillow",
  legalName: "Mellow Life Pte Ltd",
  tagline: "Science of Sleep",
  logoPath: "/mpillow_logo_2026.png",
  logoInvertedPath: "/mpillow_logo_2026-inv.png",
  whatsapp: "https://wa.me/6587805311",
} as const;

/**
 * Kept in sync with components/ui/marketing-footer.tsx — the footer drifting out
 * of step is exactly how the email chrome got stale in the first place, so
 * lib/email/__tests__/theme-parity.test.ts asserts every href below still
 * appears in that component.
 */
export const FOOTER_LINKS = [
  { label: "Our Partners", href: "/our-partners" },
  { label: "Blog", href: "/blog" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Returns & Warranty", href: "/shipping-refund-policies" },
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Contact Us", href: "/support" },
  { label: "FAQ", href: "/faq" },
] as const;

/** Partner-facing mail swaps the shopping links for the hub. */
export const PARTNER_FOOTER_LINKS = [
  { label: "Partner Hub", href: "/partner" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Terms of Service", href: "/terms-of-service" },
  { label: "Contact Us", href: "/support" },
] as const;

export const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/thempillow" },
  { label: "Instagram", href: "https://www.instagram.com/thempillow/" },
  { label: "YouTube", href: "https://www.youtube.com/channel/UCgwq2h5BygQmCAXHRzLJHrQ" },
  { label: "TikTok", href: "https://www.tiktok.com/@thempillow" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mellowlife/" },
] as const;

export type PillTone = "neutral" | "success" | "warning" | "danger";

/**
 * Status pill palette. The brand itself is achromatic, so the only semantic
 * colour available comes from the site's own chart/destructive tokens:
 *   success → --chart-2  oklch(0.6 0.118 184.704) = #009689 (light) / #00bc7d (dark)
 *   warning → --chart-4  oklch(0.828 0.189 84.429) = #ffb900 (light) / #fe9a00 (dark)
 *   danger  → --destructive                        = #e7000b (light) / #ff6467 (dark)
 *
 * Tints are those hues at low alpha over the surface, flattened to hex because
 * Outlook mishandles rgba backgrounds. Foregrounds are darkened for contrast:
 * every pair below clears 4.5:1 on its own background.
 */
export const PILL: Record<PillTone, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
  neutral: { bg: "#f5f5f5", fg: "#171717", darkBg: "#262626", darkFg: "#fafafa" },
  success: { bg: "#e0f2ef", fg: "#005f56", darkBg: "#0d2f2a", darkFg: "#5fd6bd" },
  warning: { bg: "#fdf2dc", fg: "#7a4b00", darkBg: "#33260a", darkFg: "#f5c164" },
  danger: { bg: "#fdeaea", fg: "#a1060d", darkBg: "#361113", darkFg: "#ff9d9d" },
};

export type Declarations = Record<string, string | number | null | undefined>;

/**
 * Properties whose numeric values must NOT get a `px` suffix. `font-weight:600px`
 * is invalid CSS and is dropped wholesale by the client — which silently
 * flattens every heading back to normal weight.
 */
const UNITLESS_PROPERTIES = new Set([
  "font-weight",
  "opacity",
  "z-index",
  "order",
  "flex",
  "flex-grow",
  "flex-shrink",
  "mso-padding-alt",
]);

function cssValue(prop: string, value: string | number): string {
  if (typeof value !== "number") return value;
  if (value === 0) return "0";
  if (UNITLESS_PROPERTIES.has(prop)) return String(value);
  return `${value}px`;
}

/** Serialise a declaration map into an inline `style` value, dropping nullish. */
export function css(decls: Declarations): string {
  return Object.entries(decls)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${cssValue(k, v as string | number)}`)
    .join(";");
}

/**
 * Inline style for a type variant. `mso-line-height-rule:exactly` is required or
 * Outlook rounds line-height to whole points and the rhythm drifts.
 */
export function typeStyle(variant: keyof typeof TYPE, extra?: Declarations): string {
  const t = TYPE[variant];
  return css({
    margin: 0,
    "font-family": t.family,
    "font-size": `${t.size}px`,
    "line-height": `${t.lh}px`,
    "mso-line-height-rule": "exactly",
    "font-weight": t.weight,
    "letter-spacing": t.tracking === "0" ? null : t.tracking,
    ...extra,
  });
}

/** Shared attributes every layout table needs for Outlook. */
export const TABLE_RESET =
  'role="presentation" cellpadding="0" cellspacing="0" border="0"';

export const TABLE_RESET_STYLE = css({
  "border-collapse": "collapse",
  "mso-table-lspace": "0pt",
  "mso-table-rspace": "0pt",
});
