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
// email is a tracking vector besides. Figtree is named first in the stack and
// degrades to Segoe UI / Roboto — the achromatic palette is chosen so the
// fallback still reads as intentional.
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
  /** Renders an <h1> when given; omit to let the body copy carry the heading. */
  title?: string;
  /**
   * The document's <title> when there is no `title`: for an email whose body
   * carries its own headings (a campaign built from blocks). Draws nothing.
   */
  documentTitle?: string;
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
  /**
   * Campaign mail only (migration slice 07): the Customer's unsubscribe page
   * (`unsubscribeLinks(...).pageUrl`), rendered as a footer link. Order,
   * Result and aftercare email never pass it: they are transactional.
   */
  unsubscribeUrl?: string;
}

/**
 * The dark-mode rules, as (selector, declarations) pairs.
 *
 * Emitted TWICE — once under `@media (prefers-color-scheme: dark)` and once
 * prefixed with `[data-ogsc]` for Outlook.com, which rewrites inline styles and
 * ignores the media query. Generating both from one list is the point: when the
 * two were maintained by hand the `[data-ogsc]` copy was missing the logo swap,
 * so Outlook.com dark mode flipped the card to near-black while leaving the
 * dark-ink logo on top of it.
 */
function darkRules(): Array<[selector: string, declarations: string]> {
  const rules: Array<[string, string]> = [
    [".mp-page", `background: ${DARK.page} !important;`],
    [".mp-card", `background: ${DARK.card} !important; border-color: ${DARK.border} !important;`],
    [".mp-panel", `background: ${DARK.mutedBg} !important; border-color: ${DARK.border} !important;`],
    [".mp-fg, .mp-fg a", `color: ${DARK.fg} !important;`],
    [".mp-muted, .mp-muted a", `color: ${DARK.mutedFg} !important;`],
    [".mp-border", `border-color: ${DARK.border} !important;`],
    // Fill and ink are split across two rules because the fill now lives on the
    // wrapping cell (see button() in components.ts). Painting the cell and the
    // anchor from the SAME list is the point: a future edit cannot flip the ink
    // to dark without also flipping the fill, which is how you get invisible
    // text.
    [".mp-btn-cell", `background: ${DARK.primary} !important;`],
    [".mp-btn", `color: ${DARK.primaryFg} !important;`],
    // The secondary button is an outline treatment; without this it inherits
    // the filled primary colours above and the two variants look identical.
    [
      ".mp-btn-cell-secondary",
      `background: ${DARK.card} !important; border-color: ${DARK.border} !important;`,
    ],
    [".mp-btn-secondary", `color: ${DARK.fg} !important;`],
    ["td, th", `border-color: ${DARK.border} !important;`],
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

/** Dark-mode + responsive enhancement. Never load-bearing — inline styles win. */
function styleBlock(): string {
  const rules = darkRules();
  const media = rules
    .map(([sel, decl]) => `      ${sel} { ${decl} }`)
    .join("\n");
  const ogsc = rules
    .map(
      ([sel, decl]) =>
        `    ${sel
          .split(", ")
          .map((s) => `[data-ogsc] ${s}`)
          .join(", ")} { ${decl} }`,
    )
    .join("\n");

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

/**
 * The logo pair. Both `width` and `height` attributes are set as well as the
 * inline sizes — Outlook sizes from the attributes and ignores the CSS. The
 * source art is square, so w === h.
 *
 * The dark variant carries `display:none` INLINE, so a client that strips
 * <style> (Gmail, for some account types) simply shows the light logo rather
 * than both.
 *
 * It sits top-LEFT, flush with the card's left edge. The row sets both the
 * `align` attribute and `text-align` — Outlook reads the attribute and ignores
 * the style; most webmail does the reverse.
 */
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
${footer({ origin, note: opts.footer, links, socials, unsubscribeUrl: opts.unsubscribeUrl })}
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
