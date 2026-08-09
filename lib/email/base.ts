// ============================================================
// Branded HTML email shell
// ============================================================
//
// ONE wrapper for every outbound email — customer, partner and staff alike.
// Table-based with inline styles so it renders in Gmail / Outlook / Apple Mail,
// which strip <style> blocks and ignore most modern CSS.
//
// The design tokens come from lib/email/theme.ts, which mirrors app/globals.css,
// so email and web stay one design language. Templates pass only their own body
// copy; the logo, typography, CTA and footer chrome live here so they cannot
// drift per-template again.
//
// NO WEB FONTS. Gmail strips @import and <link>, and loading a font file from an
// email is a tracking vector besides. Sora / JetBrains Mono are named first in
// the stacks and degrade to Segoe UI / Menlo — the achromatic palette is chosen
// so the fallback still reads as intentional.
//
// The logo must be an ABSOLUTE url (email clients have no page origin), so it is
// resolved through getSiteOrigin() + the public asset path.

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
  RADIUS,
  SOCIAL_LINKS,
  TABLE_RESET,
  TABLE_RESET_STYLE,
  css,
} from "./theme";
import type { RenderedEmail } from "./types";

export { escapeHtml, escapeAttr, safeUrl, stripTags } from "./html";

export type EmailAudience = "customer" | "partner" | "staff";

export interface EmailShellOptions {
  /** Renders an <h1> when given; omit to let the body copy carry the heading. */
  title?: string;
  /** Inserted verbatim — callers escape their own interpolated values. */
  bodyHtml: string;
  /** A short line above the footer chrome (e.g. "mpillow support"). */
  footer?: string;
  /** Inbox preview text. Defaults to the opening of the body copy. */
  preheader?: string;
  /** Primary call to action, rendered after the body. */
  cta?: { href: string; label: string; variant?: "primary" | "secondary" };
  /** Override the footer link row; `false` omits it (staff/ops mail). */
  footerLinks?: ReadonlyArray<{ label: string; href: string }> | false;
  /** Override the social row; `false` omits it. Defaults by audience. */
  socials?: boolean;
  /** Drives the footer defaults. Default "customer". */
  audience?: EmailAudience;
  /** <html lang>. Default "en". */
  lang?: string;
}

/** Dark-mode + responsive enhancement. Never load-bearing — inline styles win. */
function styleBlock(): string {
  return `<style type="text/css">
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    .mp-logo-dark { display: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    u + #mp-body a { color: inherit; text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .mp-container { width: 100% !important; }
      .mp-pad { padding: 20px !important; }
      .mp-btn { display: block !important; }
    }
    @media (prefers-color-scheme: dark) {
      .mp-page { background: ${DARK.page} !important; }
      .mp-card { background: ${DARK.card} !important; border-color: ${DARK.border} !important; }
      .mp-panel { background: ${DARK.mutedBg} !important; border-color: ${DARK.border} !important; }
      .mp-fg, .mp-fg a { color: ${DARK.fg} !important; }
      .mp-muted, .mp-muted a { color: ${DARK.mutedFg} !important; }
      .mp-border { border-color: ${DARK.border} !important; }
      .mp-btn { background: ${DARK.primary} !important; color: ${DARK.primaryFg} !important; }
      .mp-pill { background: ${DARK.mutedBg} !important; color: ${DARK.fg} !important; }
      td, th { border-color: ${DARK.border} !important; }
      .mp-logo-light { display: none !important; }
      .mp-logo-dark { display: block !important; }
    }
    [data-ogsc] .mp-page { background: ${DARK.page} !important; }
    [data-ogsc] .mp-card { background: ${DARK.card} !important; border-color: ${DARK.border} !important; }
    [data-ogsc] .mp-panel { background: ${DARK.mutedBg} !important; border-color: ${DARK.border} !important; }
    [data-ogsc] .mp-fg, [data-ogsc] .mp-fg a { color: ${DARK.fg} !important; }
    [data-ogsc] .mp-muted, [data-ogsc] .mp-muted a { color: ${DARK.mutedFg} !important; }
    [data-ogsc] .mp-btn { background: ${DARK.primary} !important; color: ${DARK.primaryFg} !important; }
  </style>`;
}

function logoHtml(origin: string): string {
  const common = css({
    display: "block",
    border: 0,
    outline: "none",
    "text-decoration": "none",
    height: "auto",
  });
  return `<img class="mp-logo-light" src="${origin}${BRAND.logoPath}" width="48" alt="${escapeHtml(
    BRAND.name,
  )}" style="${common};width:48px;" />
<img class="mp-logo-dark" src="${origin}${BRAND.logoInvertedPath}" width="48" alt="${escapeHtml(
    BRAND.name,
  )}" style="${common};width:48px;display:none;" />`;
}

function defaultFooterLinks(audience: EmailAudience) {
  if (audience === "staff") return false as const;
  if (audience === "partner") return PARTNER_FOOTER_LINKS;
  return FOOTER_LINKS;
}

/**
 * Wrap body HTML in the branded shell.
 *
 * Backwards compatible: `title` / `bodyHtml` / `footer` keep their original
 * meaning, so existing callers render unchanged apart from the restyle. Every
 * other field is optional.
 */
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
<title>${escapeHtml(title ?? BRAND.name)}</title>
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
<table ${TABLE_RESET} width="100%" class="mp-page" style="${TABLE_RESET_STYLE};width:100%;background:${LIGHT.page};">
  <tr>
    <td align="center" style="padding:${LAYOUT.outerPadding}px;">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${LAYOUT.containerWidth}"><tr><td><![endif]-->
      <table ${TABLE_RESET} width="${LAYOUT.containerWidth}" class="mp-container" style="${TABLE_RESET_STYLE};${css(
        { width: "100%", "max-width": `${LAYOUT.containerWidth}px` },
      )}">
        <tr>
          <td align="center" style="padding:0 0 20px;">
            ${logoHtml(origin)}
          </td>
        </tr>
        <tr>
          <td class="mp-card mp-pad" style="${css({
            background: LIGHT.card,
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
${footer({ origin, note: opts.footer, links, socials })}
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

/** Convenience for new templates: shell + subject + text in one call. */
export function renderEmail(
  opts: EmailShellOptions & { subject: string; text: string },
): RenderedEmail {
  const { subject, text, ...shell } = opts;
  return { subject, text, html: renderEmailShell(shell) };
}
