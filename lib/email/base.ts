import { getSiteOrigin } from "@/lib/site-url";
import { button, footer, heading, preheader as preheaderHtml } from "./components";
import { escapeHtml, stripTags } from "./html";
import {
  BRAND,
  DARK,
  FOOTER_LINKS,
  LAYOUT,
  LIGHT,
  PARTNER_FOOTER_LINKS,
  PILL,
  RADIUS,
  SOCIAL_LINKS,
  TABLE_RESET,
  TABLE_RESET_STYLE,
  css,
  type PillTone,
} from "./theme";
import type { RenderedEmail } from "./types";

export { escapeHtml, escapeAttr, safeUrl, stripTags } from "./html";

export type EmailAudience = "customer" | "partner" | "staff";

export interface EmailShellOptions {
  title?: string;
  documentTitle?: string;
  bodyHtml: string;
  footer?: string;
  preheader?: string;
  cta?: { href: string; label: string; variant?: "primary" | "secondary" };
  footerLinks?: ReadonlyArray<{ label: string; href: string }> | false;
  socials?: boolean;
  audience?: EmailAudience;
  lang?: string;
  unsubscribeUrl?: string;
}

export function darkRules(): Array<[selector: string, declarations: string]> {
  const rules: Array<[string, string]> = [
    [".mp-page", `background: ${DARK.page} !important;`],
    [".mp-card", `background: ${DARK.card} !important; border-color: ${DARK.border} !important;`],
    [".mp-panel", `background: ${DARK.mutedBg} !important; border-color: ${DARK.border} !important;`],
    [".mp-fg, .mp-fg a", `color: ${DARK.fg} !important;`],
    [".mp-muted, .mp-muted a", `color: ${DARK.mutedFg} !important;`],
    [".mp-border", `border-color: ${DARK.border} !important;`],
    [".mp-btn-cell", `background: ${DARK.primary} !important;`],
    [".mp-btn", `color: ${DARK.primaryFg} !important;`],
    [
      ".mp-btn-cell-secondary",
      `background: ${DARK.card} !important; border-color: ${DARK.border} !important;`,
    ],
    [".mp-btn-secondary", `color: ${DARK.fg} !important;`],
    ["td, th", `border-color: ${DARK.border} !important;`],
    [".mp-plate", `background: ${LIGHT.card} !important;`],
    [".mp-logo-light", "display: none !important;"],
    [".mp-logo-dark", "display: block !important;"],
  ];
  for (const tone of Object.keys(PILL) as PillTone[]) {
    rules.push([
      `.mp-pill-${tone}`,
      `background: ${PILL[tone].darkBg} !important; color: ${PILL[tone].darkFg} !important;`,
    ]);
  }
  return rules;
}

function darkCss(indent: string, prefix = ""): string {
  return darkRules()
    .map(
      ([sel, decl]) =>
        `${indent}${sel
          .split(", ")
          .map((s) => `${prefix}${s}`)
          .join(", ")} { ${decl} }`,
    )
    .join("\n");
}

function styleBlock(): string {
  const media = darkCss("      ");
  const ogsc = darkCss("    ", "[data-ogsc] ");

  return `<style type="text/css">
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    .mp-logo-dark { display: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    u + #mp-body a { color: inherit; text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .mp-container { width: 100% !important; }
      .mp-pad { padding: 20px !important; }
      /* The button's fill table is auto-width so it hugs the label on desktop;
         on a phone it goes full-bleed, and the anchor has to stretch with it. */
      .mp-btn-table { width: 100% !important; }
      .mp-btn { display: block !important; }
    }
    @media (prefers-color-scheme: dark) {
${media}
    }
${ogsc}
  </style>`;
}

function logoHtml(origin: string): string {
  const size = LAYOUT.logoSize;
  const common = css({
    display: "block",
    border: 0,
    outline: "none",
    "text-decoration": "none",
    width: size,
    height: size,
  });
  const alt = escapeHtml(BRAND.name);
  return `<img class="mp-logo-light" src="${origin}${BRAND.logoPath}" width="${size}" height="${size}" alt="${alt}" style="${common}" />
<img class="mp-logo-dark" src="${origin}${BRAND.logoInvertedPath}" width="${size}" height="${size}" alt="${alt}" style="${common};display:none;" />`;
}

function defaultFooterLinks(audience: EmailAudience) {
  if (audience === "staff") return false as const;
  if (audience === "partner") return PARTNER_FOOTER_LINKS;
  return FOOTER_LINKS;
}

export function renderEmailShell(opts: EmailShellOptions): string {
  const origin = getSiteOrigin();
  const audience = opts.audience ?? "customer";
  const lang = opts.lang ?? "en";
  const title = opts.title;

  const preview = opts.preheader ?? stripTags(opts.bodyHtml).slice(0, 120);
  const links = opts.footerLinks ?? defaultFooterLinks(audience);
  const socials =
    opts.socials === false || audience === "staff" ? false : SOCIAL_LINKS;

  const headingHtml = title ? heading(title, 1) : "";
  const ctaHtml = opts.cta
    ? button({ href: opts.cta.href, label: opts.cta.label, variant: opts.cta.variant })
    : "";

  return `<!doctype html>
<html lang="${escapeHtml(lang)}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(title ?? opts.documentTitle ?? BRAND.name)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${styleBlock()}
</head>
<body id="mp-body" class="mp-page" style="${css({
    margin: 0,
    padding: 0,
    width: "100%",
    background: LIGHT.page,
    "-webkit-text-size-adjust": "100%",
    "-ms-text-size-adjust": "100%",
  })}">
${preheaderHtml(preview)}
<table ${TABLE_RESET} width="100%" class="mp-page" bgcolor="${LIGHT.page}" style="${TABLE_RESET_STYLE};width:100%;background:${LIGHT.page};background-color:${LIGHT.page};">
  <tr>
    <td align="center" style="padding:${LAYOUT.outerPadding}px;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LAYOUT.containerWidth}"><tr><td><![endif]-->
      <table ${TABLE_RESET} width="${LAYOUT.containerWidth}" class="mp-container" style="${TABLE_RESET_STYLE};${css(
        { width: "100%", "max-width": `${LAYOUT.containerWidth}px` },
      )}">
        <tr>
          <td align="left" style="text-align:left;padding:0 0 20px;">
            ${logoHtml(origin)}
          </td>
        </tr>
        <tr>
          <td class="mp-card mp-pad" bgcolor="${LIGHT.card}" style="${css({
            background: LIGHT.card,
            "background-color": LIGHT.card,
            border: `1px solid ${LIGHT.border}`,
            "border-radius": `${RADIUS.surface}px`,
            padding: `${LAYOUT.cardPadding}px`,
          })}">
${headingHtml}
${opts.bodyHtml}
${ctaHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 8px 0;">
${footer({ origin, note: opts.footer, links, socials, unsubscribeUrl: opts.unsubscribeUrl, lang })}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderEmail(
  opts: EmailShellOptions & { subject: string; text: string },
): RenderedEmail {
  const { subject, text, ...shell } = opts;
  return { subject, text, html: renderEmailShell(shell) };
}

export const FORCED_DARK_STYLE_ID = "mp-force-dark";

export function forceDarkMode(html: string): string {
  const at = html.indexOf("</head>");
  if (at === -1) throw new Error("forceDarkMode takes a document from renderEmailShell.");
  const style = `<style type="text/css" id="${FORCED_DARK_STYLE_ID}">\n${darkCss("    ")}\n  </style>\n`;
  return `${html.slice(0, at)}${style}${html.slice(at)}`;
}
