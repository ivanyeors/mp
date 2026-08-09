// ============================================================
// Email component library
// ============================================================
//
// ESCAPING CONTRACT — the rule that keeps injection bugs out:
//
//   * A parameter typed `string` holds PLAIN TEXT. The component escapes it.
//   * A parameter whose name ends in `Html` holds RAW HTML. The caller owns it.
//
// Templates therefore never call escapeHtml themselves for ordinary copy, and a
// reviewer can spot an unescaped seam by looking for `...Html` in the call.
//
// Every component returns table-based, inline-styled HTML. Class names (`mp-*`)
// exist only as hooks for the dark-mode <style> block in base.ts — they are
// progressive enhancement, never load-bearing, because Gmail strips <style> for
// some account types.

import { escapeHtml, safeUrl } from "./html";
import {
  LIGHT,
  PILL,
  RADIUS,
  TYPE,
  LAYOUT,
  FONT_SANS,
  FONT_MONO,
  css,
  typeStyle,
  TABLE_RESET,
  TABLE_RESET_STYLE,
  type PillTone,
} from "./theme";

/** Wrap content in a full-width layout table row. */
function block(innerHtml: string, style?: string): string {
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
  <tr><td${style ? ` style="${style}"` : ""}>${innerHtml}</td></tr>
</table>`;
}

/**
 * Hidden inbox-preview text. Must be the first thing inside <body>.
 *
 * The trailing zero-width-non-joiner / nbsp run stops Gmail from pulling the
 * first line of real body copy in after the preheader.
 */
export function preheader(text: string): string {
  const pad = "&zwnj;&nbsp;".repeat(40);
  return `<div style="${css({
    display: "none",
    "font-size": "1px",
    "line-height": "1px",
    "max-height": 0,
    "max-width": 0,
    opacity: 0,
    overflow: "hidden",
    "mso-hide": "all",
  })}">${escapeHtml(text)}${pad}</div>`;
}

export function heading(text: string, level: 1 | 2 | 3 = 2): string {
  const variant = (`h${level}` as "h1" | "h2" | "h3");
  return `<h${level} class="mp-fg" style="${typeStyle(variant, {
    color: LIGHT.fg,
    margin: `0 0 ${LAYOUT.gutter}px`,
  })}">${escapeHtml(text)}</h${level}>`;
}

export interface ParagraphOptions {
  muted?: boolean;
  align?: "left" | "center";
  top?: number;
  bottom?: number;
}

function paragraphStyle(opts: ParagraphOptions = {}): string {
  return typeStyle(opts.muted ? "small" : "body", {
    color: opts.muted ? LIGHT.mutedFg : LIGHT.fg,
    margin: `${opts.top ?? 0}px 0 ${opts.bottom ?? 12}px`,
    "text-align": opts.align === "center" ? "center" : null,
  });
}

/** Plain-text paragraph — escaped. */
export function paragraph(text: string, opts: ParagraphOptions = {}): string {
  return `<p class="${opts.muted ? "mp-muted" : "mp-fg"}" style="${paragraphStyle(opts)}">${escapeHtml(text)}</p>`;
}

/** Paragraph whose content is already HTML (links, <strong>, …). */
export function paragraphHtml(html: string, opts: ParagraphOptions = {}): string {
  return `<p class="${opts.muted ? "mp-muted" : "mp-fg"}" style="${paragraphStyle(opts)}">${html}</p>`;
}

export function mutedText(text: string): string {
  return paragraph(text, { muted: true });
}

/**
 * Multi-line text with newlines preserved as <br> (e.g. a pasted support
 * message). Escaped first, then line-broken — never the other way round.
 */
export function preformatted(text: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, "<br />");
  return `<p class="mp-fg" style="${typeStyle("body", {
    color: LIGHT.fg,
    margin: 0,
  })}">${body}</p>`;
}

/** Inline text link — achromatic and underlined, matching the site's link treatment. */
export function link(opts: { href: string; label: string }): string {
  const href = safeUrl(opts.href);
  const label = escapeHtml(opts.label);
  if (!href) return label;
  return `<a class="mp-fg" href="${href}" style="${css({
    color: LIGHT.fg,
    "text-decoration": "underline",
    "text-underline-offset": "2px",
  })}">${label}</a>`;
}

export interface ButtonOptions {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
  align?: "left" | "center";
}

/**
 * Bulletproof CTA. VML roundrect for Outlook (Word ignores border-radius and
 * padding on anchors), padding-based anchor everywhere else.
 *
 * VML expresses the corner radius as a percentage of the shorter side, so
 * `arcsize` is RADIUS.button / HEIGHT — 16/44 ≈ 36%.
 */
export function button(opts: ButtonOptions): string {
  const href = safeUrl(opts.href);
  const label = escapeHtml(opts.label);
  const secondary = opts.variant === "secondary";
  const align = opts.align ?? "center";

  // A dead button is worse than none — degrade to plain text if the URL was rejected.
  if (!href) return paragraph(opts.label, { align });

  const height = 44;
  const bg = secondary ? LIGHT.card : LIGHT.primary;
  const fg = secondary ? LIGHT.fg : LIGHT.primaryFg;
  const arcsize = `${Math.round((RADIUS.button / height) * 100)}%`;
  // VML needs an explicit width. Approximate the rendered label (~7.6px per
  // character at 14px) plus the 24px side padding, then clamp — a fixed width
  // would make "Sign in" a 260px slab in Outlook and snug everywhere else.
  // Measure the RAW label — `label` is escaped, so "&" would count as 5 chars.
  const vmlWidth = Math.min(
    360,
    Math.max(160, Math.round(opts.label.length * 7.6) + 48),
  );

  const vml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="${arcsize}" ${
    secondary ? `strokecolor="${LIGHT.border}"` : 'stroke="f"'
  } fillcolor="${bg}">
<w:anchorlock/>
<center style="color:${fg};font-family:${FONT_SANS};font-size:14px;font-weight:500;">${label}</center>
</v:roundrect>
<![endif]-->`;

  const anchor = `<!--[if !mso]><!-- --><a class="mp-btn" href="${href}" style="${css({
    background: bg,
    "border-radius": `${RADIUS.button}px`,
    border: secondary ? `1px solid ${LIGHT.border}` : "none",
    color: fg,
    display: "inline-block",
    "font-family": FONT_SANS,
    "font-size": "14px",
    "font-weight": 500,
    "line-height": `${height}px`,
    "text-align": "center",
    "text-decoration": "none",
    padding: "0 24px",
    "mso-padding-alt": "0",
  })}">${label}</a><!--<![endif]-->`;

  return block(`${vml}${anchor}`, css({
    "text-align": align,
    padding: `${LAYOUT.gutter}px 0`,
  }));
}

/** The landing "surface": rounded, 1px border, subtle fill. */
export function card(opts: {
  bodyHtml: string;
  tone?: "default" | "muted" | "outline";
  padding?: number;
}): string {
  const tone = opts.tone ?? "muted";
  const bg = tone === "outline" ? LIGHT.card : LIGHT.mutedBg;
  return `<table ${TABLE_RESET} width="100%" class="mp-panel" style="${TABLE_RESET_STYLE};${css({
    width: "100%",
    background: bg,
    border: `1px solid ${LIGHT.border}`,
    "border-radius": `${RADIUS.surface}px`,
    margin: `0 0 ${LAYOUT.gutter}px`,
  })}">
  <tr><td style="${css({ padding: `${opts.padding ?? 20}px` })}">${opts.bodyHtml}</td></tr>
</table>`;
}

export function divider(opts: { spacing?: number } = {}): string {
  const s = opts.spacing ?? 24;
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
  <tr><td class="mp-border" style="${css({
    "border-top": `1px solid ${LIGHT.border}`,
    "font-size": "0",
    "line-height": "0",
    height: "1px",
    padding: 0,
    margin: `${s}px 0`,
  })}">&nbsp;</td></tr>
</table>`;
}

export function spacer(height: number): string {
  return `<div style="${css({
    height: `${height}px`,
    "line-height": `${height}px`,
    "font-size": "0",
  })}">&nbsp;</div>`;
}

/** One label / value line. Both escaped. */
export function infoRow(label: string, value: string, opts: { strong?: boolean } = {}): string {
  return `<tr>
  <td class="mp-muted" style="${typeStyle("small", {
    color: LIGHT.mutedFg,
    padding: "6px 12px 6px 0",
    "vertical-align": "top",
    "white-space": "nowrap",
  })}">${escapeHtml(label)}</td>
  <td class="mp-fg" style="${typeStyle("body", {
    color: LIGHT.fg,
    padding: "6px 0",
    "vertical-align": "top",
    "font-weight": opts.strong ? 700 : 400,
    "text-align": "right",
  })}">${escapeHtml(value)}</td>
</tr>`;
}

export function infoList(
  rows: Array<{ label: string; value: string; strong?: boolean }>,
): string {
  if (rows.length === 0) return "";
  const body = rows.map((r) => infoRow(r.label, r.value, { strong: r.strong })).join("\n");
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;margin:0 0 ${LAYOUT.gutter}px;">
${body}
</table>`;
}

export interface DataTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  width?: string;
}

/**
 * Line-item table with an optional totals foot. Values are escaped.
 *
 * This is genuine tabular data, so it keeps its default table semantics
 * (no role="presentation") — but it still needs the Outlook cell resets.
 */
export function dataTable(opts: {
  columns: DataTableColumn[];
  rows: Array<Record<string, string>>;
  footRows?: Array<{ label: string; value: string; strong?: boolean }>;
  caption?: string;
}): string {
  const head = opts.columns
    .map(
      (c) => `<th${c.width ? ` width="${escapeHtml(c.width)}"` : ""} class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        "text-align": c.align ?? "left",
        "font-weight": 500,
        padding: `0 0 8px`,
        "border-bottom": `1px solid ${LIGHT.border}`,
      })}">${escapeHtml(c.label)}</th>`,
    )
    .join("");

  const body = opts.rows
    .map(
      (row) =>
        `<tr>${opts.columns
          .map(
            (c) => `<td class="mp-fg" style="${typeStyle("body", {
              color: LIGHT.fg,
              "text-align": c.align ?? "left",
              padding: "10px 0",
              "border-bottom": `1px solid ${LIGHT.border}`,
              "vertical-align": "top",
            })}">${escapeHtml(row[c.key] ?? "")}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("\n");

  const foot = (opts.footRows ?? [])
    .map(
      (f, i) =>
        `<tr>
  <td colspan="${Math.max(1, opts.columns.length - 1)}" class="${f.strong ? "mp-fg" : "mp-muted"}" style="${typeStyle(
          f.strong ? "body" : "small",
          {
            color: f.strong ? LIGHT.fg : LIGHT.mutedFg,
            padding: i === 0 ? "12px 0 2px" : "2px 0",
            "font-weight": f.strong ? 700 : 400,
          },
        )}">${escapeHtml(f.label)}</td>
  <td class="${f.strong ? "mp-fg" : "mp-muted"}" style="${typeStyle(f.strong ? "body" : "small", {
          color: f.strong ? LIGHT.fg : LIGHT.mutedFg,
          "text-align": "right",
          padding: i === 0 ? "12px 0 2px" : "2px 0",
          "font-weight": f.strong ? 700 : 400,
        })}">${escapeHtml(f.value)}</td>
</tr>`,
    )
    .join("\n");

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="${TABLE_RESET_STYLE};width:100%;margin:0 0 ${LAYOUT.gutter}px;">
${opts.caption ? `<caption style="${typeStyle("small", { color: LIGHT.mutedFg, "text-align": "left", padding: "0 0 8px" })}">${escapeHtml(opts.caption)}</caption>` : ""}
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
${foot ? `<tfoot>\n${foot}\n</tfoot>` : ""}
</table>`;
}

/** Prominent money callout — commission earned, payout sent, total charged. */
export function amountPanel(opts: {
  label: string;
  amount: string;
  caption?: string;
}): string {
  return card({
    tone: "muted",
    bodyHtml: `<p class="mp-muted" style="${typeStyle("small", {
      color: LIGHT.mutedFg,
      margin: "0 0 6px",
    })}">${escapeHtml(opts.label)}</p>
<p class="mp-fg" style="${typeStyle("h1", { color: LIGHT.fg, margin: 0 })}">${escapeHtml(opts.amount)}</p>${
      opts.caption
        ? `\n<p class="mp-muted" style="${typeStyle("small", {
            color: LIGHT.mutedFg,
            margin: "8px 0 0",
          })}">${escapeHtml(opts.caption)}</p>`
        : ""
    }`,
  });
}

/** Monospaced, letter-spaced verification code. */
export function codeBlock(code: string, opts: { caption?: string } = {}): string {
  return card({
    tone: "muted",
    bodyHtml: `<p class="mp-fg" style="${typeStyle("code", {
      color: LIGHT.fg,
      margin: 0,
      "text-align": "center",
      "font-family": FONT_MONO,
    })}">${escapeHtml(code)}</p>${
      opts.caption
        ? `\n<p class="mp-muted" style="${typeStyle("small", {
            color: LIGHT.mutedFg,
            margin: "10px 0 0",
            "text-align": "center",
          })}">${escapeHtml(opts.caption)}</p>`
        : ""
    }`,
  });
}

/**
 * Status pill — mirrors components/ui/badge.tsx (rounded-full, xs, medium).
 *
 * The per-tone class hook matters: a single `.mp-pill` dark override would
 * repaint every pill the same colour and destroy the success/danger coding.
 */
export function statusPill(text: string, tone: PillTone = "neutral"): string {
  const { bg, fg } = PILL[tone];
  return `<span class="mp-pill mp-pill-${tone}" style="${css({
    background: bg,
    color: fg,
    "border-radius": "9999px",
    display: "inline-block",
    "font-family": FONT_MONO,
    "font-size": "12px",
    "line-height": "18px",
    "font-weight": 500,
    padding: "2px 10px",
  })}">${escapeHtml(text)}</span>`;
}

export function addressBlock(title: string, lines: string[]): string {
  const rendered = lines.filter(Boolean).map(escapeHtml).join("<br />");
  return card({
    tone: "muted",
    bodyHtml: `<p class="mp-muted" style="${typeStyle("small", {
      color: LIGHT.mutedFg,
      margin: "0 0 6px",
    })}">${escapeHtml(title)}</p>
<p class="mp-fg" style="${typeStyle("body", { color: LIGHT.fg, margin: 0 })}">${rendered}</p>`,
  });
}

export function bulletList(items: string[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) =>
        `<tr><td class="mp-fg" style="${typeStyle("body", {
          color: LIGHT.fg,
          padding: "4px 0",
        })}">&bull;&nbsp;&nbsp;${escapeHtml(item)}</td></tr>`,
    )
    .join("\n");
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;margin:0 0 ${LAYOUT.gutter}px;">
${rows}
</table>`;
}

export interface FooterLink {
  label: string;
  href: string;
}

/**
 * Footer chrome. `links` hrefs may be site-relative — they are resolved against
 * `origin` here, because email has no page origin to resolve them against.
 */
export function footer(opts: {
  origin: string;
  note?: string;
  links?: ReadonlyArray<FooterLink> | false;
  socials?: ReadonlyArray<FooterLink> | false;
}): string {
  const year = new Date().getFullYear();
  const parts: string[] = [];

  if (opts.note) {
    parts.push(
      `<p class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        margin: "0 0 12px",
        "text-align": "center",
      })}">${escapeHtml(opts.note)}</p>`,
    );
  }

  if (opts.links && opts.links.length > 0) {
    const rendered = opts.links
      .map((l) => {
        const href = safeUrl(l.href.startsWith("http") ? l.href : `${opts.origin}${l.href}`);
        if (!href) return "";
        return `<a class="mp-muted" href="${href}" style="${css({
          color: LIGHT.mutedFg,
          "text-decoration": "none",
          "white-space": "nowrap",
        })}">${escapeHtml(l.label)}</a>`;
      })
      .filter(Boolean)
      .join(`<span class="mp-muted" style="color:${LIGHT.mutedFg};"> &nbsp;·&nbsp; </span>`);
    parts.push(
      `<p class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        margin: "0 0 12px",
        "text-align": "center",
      })}">${rendered}</p>`,
    );
  }

  if (opts.socials && opts.socials.length > 0) {
    const rendered = opts.socials
      .map((s) => {
        const href = safeUrl(s.href);
        if (!href) return "";
        return `<a class="mp-muted" href="${href}" style="${css({
          color: LIGHT.mutedFg,
          "text-decoration": "none",
        })}">${escapeHtml(s.label)}</a>`;
      })
      .filter(Boolean)
      .join(`<span class="mp-muted" style="color:${LIGHT.mutedFg};"> &nbsp;·&nbsp; </span>`);
    parts.push(
      `<p class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        margin: "0 0 12px",
        "text-align": "center",
      })}">${rendered}</p>`,
    );
  }

  parts.push(
    `<p class="mp-muted" style="${typeStyle("small", {
      color: LIGHT.mutedFg,
      margin: 0,
      "text-align": "center",
    })}">&copy; ${year} ${escapeHtml("Mellow Life Pte Ltd")}. All rights reserved.</p>`,
  );

  return parts.join("\n");
}

export { TYPE, LIGHT, RADIUS, LAYOUT };
export type { PillTone };
