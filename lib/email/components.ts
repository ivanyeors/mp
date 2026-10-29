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
  BRAND,
  LIGHT,
  PILL,
  SPACE,
  RADIUS,
  TYPE,
  LAYOUT,
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
 * Add the vertical gutter below a block.
 *
 * Word (Outlook desktop) ignores `margin` on a <table>, so spacing a block with
 * `margin:0 0 16px` collapses the entire vertical rhythm there while looking
 * fine everywhere else. Padding on a <td> is honoured, so every block gets its
 * gutter from a wrapper cell instead.
 */
function withGutter(innerHtml: string, bottom: number = LAYOUT.gutter): string {
  return block(innerHtml, css({ "padding-bottom": bottom }));
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

export interface HeadingOptions {
  /** Space above, in px. Default 0. */
  top?: number;
  /** Space below, in px. Default `LAYOUT.gutter`. */
  bottom?: number;
}

/**
 * Heading. `top` / `bottom` exist because a sub-heading that labels the block
 * beneath it needs asymmetric spacing: with the flat `0 0 16px` default it sits
 * equidistant between its own list and the previous one, so it reads as
 * belonging to neither.
 */
export function heading(
  text: string,
  level: 1 | 2 | 3 = 2,
  opts: HeadingOptions = {},
): string {
  const variant = (`h${level}` as "h1" | "h2" | "h3");
  return `<h${level} class="mp-fg" style="${typeStyle(variant, {
    color: LIGHT.fg,
    margin: `${opts.top ?? 0}px 0 ${opts.bottom ?? LAYOUT.gutter}px`,
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
export function paragraphHtml(bodyHtml: string, opts: ParagraphOptions = {}): string {
  return `<p class="${opts.muted ? "mp-muted" : "mp-fg"}" style="${paragraphStyle(opts)}">${bodyHtml}</p>`;
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
  return linkHtml({ href: opts.href, labelHtml: escapeHtml(opts.label) });
}

/** Inline link whose words are already HTML (bold or italic inside it). A rejected URL leaves the words. */
export function linkHtml(opts: { href: string; labelHtml: string }): string {
  const href = safeUrl(opts.href);
  if (!href) return opts.labelHtml;
  return `<a class="mp-fg" href="${href}" style="${css({
    color: LIGHT.fg,
    "text-decoration": "underline",
    "text-underline-offset": "2px",
  })}">${opts.labelHtml}</a>`;
}

export interface ButtonOptions {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
  align?: "left" | "center";
  /** The widest Outlook's VML button may draw, in px: a column's width. Default 360. */
  maxWidth?: number;
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
    opts.maxWidth ?? 360,
    Math.max(160, Math.round(opts.label.length * 7.6) + 48),
  );

  const vml = `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="${arcsize}" ${
    secondary ? `strokecolor="${LIGHT.border}"` : 'stroke="f"'
  } fillcolor="${bg}">
<w:anchorlock/>
<center style="color:${fg};font-family:${TYPE.button.family};font-size:${TYPE.button.size}px;font-weight:${TYPE.button.weight};">${label}</center>
</v:roundrect>
<![endif]-->`;

  // The fill lives on the CELL, carrying a `bgcolor` ATTRIBUTE as well as the
  // inline background — this is the one element in the system whose failure
  // mode is invisible text rather than merely flat colour.
  //
  // A sanitizer that drops CSS `background` but keeps `color` leaves light ink
  // on the white card (and, in dark mode, near-black ink on the near-black
  // card). Gmail's compose sanitizer does exactly that. `bgcolor` is an HTML
  // presentational attribute, so it survives; and because presentational
  // attributes lose to any CSS rule, the dark-mode block still overrides it —
  // it is the floor, not a ceiling. `background-color` is emitted alongside the
  // shorthand for sanitizers that keep one and not the other.
  const anchor = `<!--[if !mso]><!-- --><table ${TABLE_RESET} align="${align}" class="mp-btn-table" style="${TABLE_RESET_STYLE}">
  <tr><td class="mp-btn-cell${
    secondary ? " mp-btn-cell-secondary" : ""
  }" bgcolor="${bg}" style="${css({
    background: bg,
    "background-color": bg,
    "border-radius": `${RADIUS.button}px`,
    border: secondary ? `1px solid ${LIGHT.border}` : "none",
    "text-align": "center",
  })}"><a class="mp-btn${
    secondary ? " mp-btn-secondary" : ""
  }" href="${href}" style="${typeStyle("button", {
    color: fg,
    display: "inline-block",
    "text-align": "center",
    "text-decoration": "none",
    padding: `0 ${SPACE["3xl"]}px`,
    "mso-padding-alt": "0",
  })}">${label}</a></td></tr>
</table><!--<![endif]-->`;

  return block(`${vml}${anchor}`, css({
    "text-align": align,
    padding: `${LAYOUT.gutter}px 0`,
  }));
}

/**
 * The widest one button of a pair takes, in px. Two fit the 600px card side by
 * side; on a screen too narrow for both, they stack.
 */
const PAIR_COLUMN = 240;

/**
 * Two buttons side by side that stack on a phone (PRD-campaign-email-editor
 * slice 03), built the hybrid way: each sits in an inline-block column at most
 * PAIR_COLUMN wide, so the pair falls to one column by width alone, with no
 * media query (Gmail's apps ignore them for many accounts), inside an MSO
 * ghost table that keeps two columns in classic Outlook. The wrapper's
 * `font-size:0` removes the gap the markup's whitespace would leave between
 * the columns. Slice 06 makes this the general column primitive.
 */
export function buttonPair(buttons: [ButtonOptions, ButtonOptions]): string {
  const column = (b: ButtonOptions) =>
    `<div style="${css({
      display: "inline-block",
      width: "100%",
      "max-width": `${PAIR_COLUMN}px`,
      "vertical-align": "top",
    })}">${button({ ...b, maxWidth: PAIR_COLUMN })}</div>`;
  return block(
    `<!--[if mso]><table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;"><tr><td width="50%" valign="top"><![endif]-->${column(
      buttons[0],
    )}<!--[if mso]></td><td width="50%" valign="top"><![endif]-->${column(buttons[1])}<!--[if mso]></td></tr></table><![endif]-->`,
    css({ "text-align": "center", "font-size": 0 }),
  );
}

/** The landing "surface": rounded, 1px border, subtle fill. */
export function card(opts: {
  bodyHtml: string;
  tone?: "default" | "muted" | "outline";
  padding?: number;
}): string {
  const tone = opts.tone ?? "muted";
  const bg = tone === "outline" ? LIGHT.card : LIGHT.mutedBg;
  // Inner radius is one rung below the shell's surface radius — concentric
  // corners with identical radii read as slightly wrong.
  return withGutter(`<table ${TABLE_RESET} width="100%" class="mp-panel" bgcolor="${bg}" style="${TABLE_RESET_STYLE};${css(
    {
      width: "100%",
      background: bg,
      "background-color": bg,
      border: `1px solid ${LIGHT.border}`,
      "border-radius": `${RADIUS.xl}px`,
    },
  )}">
  <tr><td style="${css({ padding: opts.padding ?? SPACE["2xl"] })}">${opts.bodyHtml}</td></tr>
</table>`);
}

/** Hairline rule. Spacing comes from the wrapper cell — margin on a td is ignored. */
export function divider(opts: { spacing?: number } = {}): string {
  const s = opts.spacing ?? SPACE["3xl"];
  return block(
    `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
  <tr><td class="mp-border" style="${css({
    "border-top": `1px solid ${LIGHT.border}`,
    "font-size": "0",
    "line-height": "0",
    height: "1px",
    padding: 0,
  })}">&nbsp;</td></tr>
</table>`,
    css({ "padding-top": s, "padding-bottom": s }),
  );
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
    "font-weight": opts.strong ? 600 : 400,
    "text-align": "right",
  })}">${escapeHtml(value)}</td>
</tr>`;
}

export function infoList(
  rows: Array<{ label: string; value: string; strong?: boolean }>,
): string {
  if (rows.length === 0) return "";
  const body = rows.map((r) => infoRow(r.label, r.value, { strong: r.strong })).join("\n");
  return withGutter(`<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
${body}
</table>`);
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

  // A foot row is a label cell spanning all but the last column, plus a value
  // cell. With a single column there is no room for both — emitting two cells
  // under a one-column head would push the table wider than its own header — so
  // the label and value share one cell there.
  const labelSpan = opts.columns.length - 1;
  const footCell = (
    content: string,
    o: { strong?: boolean; first: boolean; colspan?: number; align?: "right" },
  ): string =>
    `<td${o.colspan ? ` colspan="${o.colspan}"` : ""} class="${
      o.strong ? "mp-fg" : "mp-muted"
    }" style="${typeStyle(o.strong ? "body" : "small", {
      color: o.strong ? LIGHT.fg : LIGHT.mutedFg,
      padding: o.first ? "12px 0 2px" : "2px 0",
      "font-weight": o.strong ? 600 : 400,
      "text-align": o.align ?? null,
    })}">${content}</td>`;

  const foot = (opts.footRows ?? [])
    .map((f, i) => {
      const first = i === 0;
      if (labelSpan < 1) {
        const merged = `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`;
        return `<tr>${footCell(merged, { strong: f.strong, first })}</tr>`;
      }
      return `<tr>${footCell(escapeHtml(f.label), {
        strong: f.strong,
        first,
        colspan: labelSpan,
      })}${footCell(escapeHtml(f.value), {
        strong: f.strong,
        first,
        align: "right",
      })}</tr>`;
    })
    .join("\n");

  return withGutter(`<table cellpadding="0" cellspacing="0" border="0" width="100%" style="${TABLE_RESET_STYLE};width:100%;">
${opts.caption ? `<caption class="mp-muted" style="${typeStyle("small", { color: LIGHT.mutedFg, "text-align": "left", padding: "0 0 8px" })}">${escapeHtml(opts.caption)}</caption>` : ""}
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
${foot ? `<tfoot>\n${foot}\n</tfoot>` : ""}
</table>`);
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
<p class="mp-fg" style="${typeStyle("figure", { color: LIGHT.fg, margin: 0 })}">${escapeHtml(opts.amount)}</p>${
      opts.caption
        ? `\n<p class="mp-muted" style="${typeStyle("small", {
            color: LIGHT.mutedFg,
            margin: "8px 0 0",
          })}">${escapeHtml(opts.caption)}</p>`
        : ""
    }`,
  });
}

export interface CodeBlockOptions {
  caption?: string;
  /**
   * `"otp"` (default) is the display treatment for a short verification code —
   * 28px, wide tracking, one glance to read.
   *
   * `"identifier"` is for a long opaque string: a Result UUID is 36 characters,
   * and at OTP size with 0.2em tracking it is ~700px wide, so it overflowed the
   * 600px container. This variant drops to body size and breaks anywhere.
   */
  variant?: "otp" | "identifier";
}

/** A code or identifier, centred in a muted panel. */
export function codeBlock(code: string, opts: CodeBlockOptions = {}): string {
  const identifier = opts.variant === "identifier";
  return card({
    tone: "muted",
    bodyHtml: `<p class="mp-fg" style="${typeStyle(identifier ? "body" : "code", {
      color: LIGHT.fg,
      margin: 0,
      "text-align": "center",
      // `body` already carries tracking "0", which typeStyle drops.
      ...(identifier ? { "font-weight": 600, "word-break": "break-all" } : {}),
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
  return `<span class="mp-pill mp-pill-${tone}" style="${typeStyle("small", {
    background: bg,
    color: fg,
    "border-radius": "9999px",
    display: "inline-block",
    "font-weight": 500,
    padding: `2px ${SPACE.lg}px`,
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
  return bulletListHtml(items.map(escapeHtml));
}

/** Bullets whose items are already HTML (links, <strong>, …). */
export function bulletListHtml(itemsHtml: string[]): string {
  if (itemsHtml.length === 0) return "";
  const rows = itemsHtml
    .map(
      (itemHtml) =>
        `<tr><td class="mp-fg" style="${typeStyle("body", {
          color: LIGHT.fg,
          padding: "4px 0",
        })}">&bull;&nbsp;&nbsp;${itemHtml}</td></tr>`,
    )
    .join("\n");
  return withGutter(`<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
${rows}
</table>`);
}

/**
 * An empty field's placeholder, for an editor's preview only
 * (PRD-campaign-email-editor decision 7): muted, in a dashed outline, at the
 * place and type size its words would take, so an empty email's layout reads.
 * Never in a sent email: only the preview passes placeholders to a renderer.
 *
 * The outline is the muted ink, not `LIGHT.border`, so it reads on the light
 * card and the dark one alike; the text takes the `mp-muted` dark rule.
 */
export function placeholderHint(text: string, as: "h1" | "h2" | "body" | "button" = "body"): string {
  const outline = { border: `1px dashed ${LIGHT.mutedFg}`, "border-radius": `${as === "button" ? RADIUS.button : RADIUS.md}px` };
  if (as === "button") {
    return block(
      `<span class="mp-muted" style="${typeStyle("button", {
        ...outline,
        color: LIGHT.mutedFg,
        display: "inline-block",
        padding: `0 ${SPACE["3xl"]}px`,
      })}">${escapeHtml(text)}</span>`,
      css({ "text-align": "center", padding: `${LAYOUT.gutter}px 0` }),
    );
  }
  const tag = as === "body" ? "p" : as;
  return `<${tag} class="mp-muted" style="${typeStyle(as, {
    ...outline,
    color: LIGHT.mutedFg,
    margin: `0 0 ${LAYOUT.gutter}px`,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
  })}">${escapeHtml(text)}</${tag}>`;
}

export interface FooterLink {
  label: string;
  href: string;
}

/**
 * Footer chrome. `links` hrefs may be site-relative — they are resolved against
 * `origin` here, because email has no page origin to resolve them against.
 *
 * Every link is underlined, as in the body: in the muted footer its colour is
 * the separators', and a client that inverts colours by itself (Gmail on iOS,
 * which no dark rule reaches) leaves the underline as the one sign of a link
 * (PRD-campaign-email-editor slice 15).
 */
export function footer(opts: {
  origin: string;
  note?: string;
  links?: ReadonlyArray<FooterLink> | false;
  socials?: ReadonlyArray<FooterLink> | false;
  /** Campaign mail only: the Customer's unsubscribe page (migration slice 07). */
  unsubscribeUrl?: string;
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
        // Full scheme test, not `startsWith("http")` — "httpfoo" would other-
        // wise be treated as absolute and then silently dropped by safeUrl.
        const href = safeUrl(
          /^https?:\/\//.test(l.href) ? l.href : `${opts.origin}${l.href}`,
        );
        if (!href) return "";
        return `<a class="mp-muted" href="${href}" style="${css({
          color: LIGHT.mutedFg,
          "text-decoration": "underline",
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
          "text-decoration": "underline",
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

  // The unsubscribe facility the Spam Control Act asks of marketing email,
  // beside the List-Unsubscribe header. Underlined, so it reads as a link in
  // muted footer text. A rejected URL drops the line rather than show a dead one.
  const unsubscribe = opts.unsubscribeUrl ? safeUrl(opts.unsubscribeUrl) : "";
  if (unsubscribe) {
    parts.push(
      `<p class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        margin: "0 0 12px",
        "text-align": "center",
      })}">Don&rsquo;t want these emails? <a class="mp-muted" href="${unsubscribe}" style="${css({
        color: LIGHT.mutedFg,
        "text-decoration": "underline",
      })}">Unsubscribe</a></p>`,
    );
  }

  parts.push(
    `<p class="mp-muted" style="${typeStyle("small", {
      color: LIGHT.mutedFg,
      margin: 0,
      "text-align": "center",
    })}">&copy; ${year} ${escapeHtml(BRAND.legalName)}. All rights reserved.</p>`,
  );

  return parts.join("\n");
}

export { TYPE, LIGHT, RADIUS, LAYOUT };
export type { PillTone };
