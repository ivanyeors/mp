// ============================================================
// Email design tokens — mirrors the landing page
// ============================================================
//
// Every value here is resolved from the site's own tokens so email and web stay
// one design language:
//   - palette  → app/globals.css `:root` / `.dark` (shadcn "neutral", achromatic)
//   - radii    → app/globals.css `--radius: 0.625rem` and its derived scale
//   - fonts    → app/layout.tsx (Sora → --font-sans, JetBrains Mono → --font-mono)
//   - footer   → components/ui/marketing-footer.tsx (kept in sync by a test)
//
// The oklch values in globals.css are the Tailwind `neutral` ramp, so they map
// to exact hexes. Email clients understand neither oklch nor CSS variables, so
// the hexes are literal here — this module is the ONLY place they appear.

/**
 * Heading stack. Sora cannot actually load in email (no web fonts — see the
 * note in base.ts), so the fallbacks are what most recipients will see. They
 * are ordered to land on a humanist sans everywhere.
 */
export const FONT_SANS =
  "'Sora','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Body stack. The site sets `font-mono` on <body> (globals.css), so monospace
 * body copy is intentional brand, not an accident.
 */
export const FONT_MONO =
  "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** Light palette — `:root` in globals.css. */
export const LIGHT = {
  page: "#fafafa",
  card: "#ffffff",
  fg: "#0a0a0a",
  mutedBg: "#f5f5f5",
  mutedFg: "#737373",
  border: "#e5e5e5",
  primary: "#171717",
  primaryFg: "#fafafa",
  destructive: "#e7000b",
  success: "#009689",
} as const;

/**
 * Dark palette — `.dark` in globals.css.
 *
 * `--border` is `rgba(255,255,255,0.10)` on the site; Outlook mishandles rgba in
 * table borders, so it is flattened here to its composite over the dark page.
 */
export const DARK = {
  page: "#0a0a0a",
  card: "#171717",
  fg: "#fafafa",
  mutedBg: "#262626",
  mutedFg: "#a1a1a1",
  border: "#2a2a2a",
  primary: "#fafafa",
  primaryFg: "#171717",
  destructive: "#ff6467",
  success: "#00bc7d",
} as const;

/** `--radius: 0.625rem` and the derived scale, in px. */
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  card: 12,
  button: 16,
  surface: 16,
} as const;

/**
 * Type scale. Sizes are the email-appropriate rung of the site scale — email
 * bodies read at 14-16px rather than the site's responsive 16/18px.
 */
export const TYPE = {
  h1: { size: 24, lh: 30, weight: 600, family: FONT_SANS, tracking: "-0.02em" },
  h2: { size: 18, lh: 26, weight: 500, family: FONT_SANS, tracking: "-0.01em" },
  h3: { size: 15, lh: 22, weight: 500, family: FONT_SANS, tracking: "0" },
  body: { size: 14, lh: 22, weight: 400, family: FONT_MONO, tracking: "0" },
  small: { size: 12, lh: 18, weight: 400, family: FONT_MONO, tracking: "0" },
  code: { size: 28, lh: 36, weight: 700, family: FONT_MONO, tracking: "0.2em" },
} as const;

export const LAYOUT = {
  /** Up from the old 560 — the order line-item table needs the room. */
  containerWidth: 600,
  outerPadding: 24,
  cardPadding: 28,
  gutter: 16,
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
