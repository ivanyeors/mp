import { EMAIL_FONT_STACK } from "@/lib/font-stack";

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
} as const;

export const DARK = {
  page: "#0a0a0a",
  card: "#171717",
  fg: "#fafafa",
  mutedBg: "#262626",
  mutedFg: "#a1a1a1",
  border: "#2e2e2e",
  primary: "#e5e5e5",
  primaryFg: "#171717",
  destructive: "#ff6467",
} as const;

export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  button: 16,
  surface: 16,
} as const;

export const TYPE = {
  h1: { size: 24, lh: 30, weight: 600, family: EMAIL_FONT_STACK, tracking: "-0.025em" },
  h2: { size: 18, lh: 26, weight: 600, family: EMAIL_FONT_STACK, tracking: "-0.025em" },
  h3: { size: 14, lh: 20, weight: 600, family: EMAIL_FONT_STACK, tracking: "0" },
  body: { size: 14, lh: 22, weight: 400, family: EMAIL_FONT_STACK, tracking: "0" },
  small: { size: 12, lh: 18, weight: 400, family: EMAIL_FONT_STACK, tracking: "0" },
  figure: { size: 24, lh: 30, weight: 600, family: EMAIL_FONT_STACK, tracking: "0" },
  code: { size: 28, lh: 36, weight: 700, family: EMAIL_FONT_STACK, tracking: "0.2em" },
  button: { size: 14, lh: 44, weight: 500, family: EMAIL_FONT_STACK, tracking: "0" },
} as const;

export const LAYOUT = {
  containerWidth: 600,
  outerPadding: 24,
  cardPadding: 28,
  gutter: 16,
  logoSize: 64,
} as const;

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
  logoPath: "/mpillow_logo_2026.png",
  logoInvertedPath: "/mpillow_logo_2026-inv.png",
  whatsapp: "https://wa.me/6587805311",
} as const;

export const FOOTER_LINKS = [
  { label: "Our partners", href: "/our-partners" },
  { label: "Blog", href: "/blog" },
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Returns & warranty", href: "/shipping-refund-policies" },
  { label: "Terms of service", href: "/terms-of-service" },
  { label: "Contact us", href: "/support" },
  { label: "FAQ", href: "/faq" },
] as const;

export const FOOTER_WORDS_ZH = {
  links: {
    "/our-partners": "合作伙伴",
    "/blog": "博客",
    "/privacy-policy": "隐私政策",
    "/shipping-refund-policies": "退换与保修",
    "/terms-of-service": "服务条款",
    "/support": "联系我们",
    "/faq": "常见问题",
  } satisfies Record<(typeof FOOTER_LINKS)[number]["href"], string>,
  unsubscribeAsk: "不想再收到这些邮件？",
  unsubscribe: "取消订阅",
  rights: "保留所有权利。",
} as const;

export const PARTNER_FOOTER_LINKS = [
  { label: "Partner Hub", href: "/partner" },
  { label: "Privacy policy", href: "/privacy-policy" },
  { label: "Terms of service", href: "/terms-of-service" },
  { label: "Contact us", href: "/support" },
] as const;

export const SOCIAL_LINKS = [
  { label: "Facebook", href: "https://www.facebook.com/thempillow" },
  { label: "Instagram", href: "https://www.instagram.com/thempillow/" },
  { label: "YouTube", href: "https://www.youtube.com/channel/UCgwq2h5BygQmCAXHRzLJHrQ" },
  { label: "TikTok", href: "https://www.tiktok.com/@thempillow" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/mellowlife/" },
] as const;

export type PillTone = "neutral" | "success" | "warning" | "danger";

export const PILL: Record<PillTone, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
  neutral: { bg: "#f5f5f5", fg: "#171717", darkBg: "#262626", darkFg: "#fafafa" },
  success: { bg: "#e0f2ef", fg: "#005f56", darkBg: "#0d2f2a", darkFg: "#5fd6bd" },
  warning: { bg: "#fdf2dc", fg: "#7a4b00", darkBg: "#33260a", darkFg: "#f5c164" },
  danger: { bg: "#fdeaea", fg: "#a1060d", darkBg: "#361113", darkFg: "#ff9d9d" },
};

export type Declarations = Record<string, string | number | null | undefined>;

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

export function css(decls: Declarations): string {
  return Object.entries(decls)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}:${cssValue(k, v as string | number)}`)
    .join(";");
}

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

export const TABLE_RESET =
  'role="presentation" cellpadding="0" cellspacing="0" border="0"';

export const TABLE_RESET_STYLE = css({
  "border-collapse": "collapse",
  "mso-table-lspace": "0pt",
  "mso-table-rspace": "0pt",
});
