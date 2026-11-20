import { escapeHtml, safeUrl } from "./html";
import {
  BRAND,
  FOOTER_WORDS_ZH,
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

function block(innerHtml: string, style?: string, cellAttrs?: string): string {
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
  <tr><td${cellAttrs ? ` ${cellAttrs}` : ""}${style ? ` style="${style}"` : ""}>${innerHtml}</td></tr>
</table>`;
}

function withGutter(innerHtml: string, bottom: number = LAYOUT.gutter): string {
  return block(innerHtml, css({ "padding-bottom": bottom }));
}

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
  top?: number;
  bottom?: number;
  align?: "left" | "center";
}

export function heading(
  text: string,
  level: 1 | 2 | 3 = 2,
  opts: HeadingOptions = {},
): string {
  const variant = (`h${level}` as "h1" | "h2" | "h3");
  return `<h${level} class="mp-fg" style="${typeStyle(variant, {
    color: LIGHT.fg,
    margin: `${opts.top ?? 0}px 0 ${opts.bottom ?? LAYOUT.gutter}px`,
    "text-align": opts.align === "center" ? "center" : null,
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

export function paragraph(text: string, opts: ParagraphOptions = {}): string {
  return `<p class="${opts.muted ? "mp-muted" : "mp-fg"}" style="${paragraphStyle(opts)}">${escapeHtml(text)}</p>`;
}

export function paragraphHtml(bodyHtml: string, opts: ParagraphOptions = {}): string {
  return `<p class="${opts.muted ? "mp-muted" : "mp-fg"}" style="${paragraphStyle(opts)}">${bodyHtml}</p>`;
}

export function mutedText(text: string): string {
  return paragraph(text, { muted: true });
}

export function preformatted(text: string): string {
  const body = escapeHtml(text).replace(/\r?\n/g, "<br />");
  return `<p class="mp-fg" style="${typeStyle("body", {
    color: LIGHT.fg,
    margin: 0,
  })}">${body}</p>`;
}

export function link(opts: { href: string; label: string }): string {
  return linkHtml({ href: opts.href, labelHtml: escapeHtml(opts.label) });
}

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
  maxWidth?: number;
}

export function button(opts: ButtonOptions): string {
  const href = safeUrl(opts.href);
  const label = escapeHtml(opts.label);
  const secondary = opts.variant === "secondary";
  const align = opts.align ?? "center";

  if (!href) return paragraph(opts.label, { align });

  const height = 44;
  const bg = secondary ? LIGHT.card : LIGHT.primary;
  const fg = secondary ? LIGHT.fg : LIGHT.primaryFg;
  const arcsize = `${Math.round((RADIUS.button / height) * 100)}%`;
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

export const STACK_BELOW = 480;

export interface ColumnsOptions {
  stackBelow: number;
  reverse?: boolean;
  valign?: "top" | "middle";
  gap?: number;
  textAlign?: "left" | "center";
}

export function columns(cellsHtml: readonly string[], opts: ColumnsOptions): string {
  const valign = opts.valign ?? "top";
  const ltr = opts.reverse ? ' dir="ltr"' : "";
  const inner = opts.gap || opts.textAlign;
  const share = `${Math.floor(opts.stackBelow / cellsHtml.length)}px`;
  const style =
    cellsHtml.length > 2
      ? css({ display: "inline-block", width: "100%", "min-width": share, "max-width": "100%", "vertical-align": valign }) +
        `;width:calc((${opts.stackBelow}px - 100%) * ${opts.stackBelow})`
      : css({ display: "inline-block", width: "100%", "max-width": share, "vertical-align": valign });
  const column = (cellHtml: string) =>
    `<div${ltr} style="${style}">${
      inner ? `<div style="${css({ padding: opts.gap ? `0 ${opts.gap / 2}px` : null, "text-align": opts.textAlign })}">${cellHtml}</div>` : cellHtml
    }</div>`;
  const cell = `<td width="${Math.floor(100 / cellsHtml.length)}%" valign="${valign}"${ltr}>`;
  return block(
    `<!--[if mso]><table ${TABLE_RESET}${opts.reverse ? ' dir="rtl"' : ""} width="100%" style="${TABLE_RESET_STYLE};width:100%;"><tr>${cell}<![endif]-->${cellsHtml
      .map(column)
      .join(`<!--[if mso]></td>${cell}<![endif]-->`)}<!--[if mso]></td></tr></table><![endif]-->`,
    css({ "text-align": "center", "font-size": 0 }),
    opts.reverse ? 'dir="rtl"' : undefined,
  );
}

export function buttonPair(buttons: [ButtonOptions, ButtonOptions]): string {
  const width = STACK_BELOW / 2;
  return columns(
    buttons.map((b) => button({ ...b, maxWidth: width })),
    { stackBelow: STACK_BELOW },
  );
}

export interface EmailImageOptions {
  src: string;
  width: number;
  height: number;
  alt: string;
  decorative?: boolean;
  href?: string | null;
  plate?: boolean;
}

const PLATE_PADDING = LAYOUT.gutter;

export function emailImage(opts: EmailImageOptions): string {
  const src = safeUrl(opts.src);
  if (!src) return "";
  const pad = opts.plate ? PLATE_PADDING : 0;
  const width = Math.max(1, Math.round(opts.width - 2 * pad));
  const height = Math.max(1, Math.round((opts.height * width) / opts.width));
  const img = `<img src="${src}" width="${width}" height="${height}" alt="${opts.decorative ? "" : escapeHtml(opts.alt)}"${
    opts.decorative ? ' role="presentation"' : ""
  } style="${css({ display: "block", "max-width": "100%", height: "auto", border: 0, outline: "none", "text-decoration": "none", margin: "0 auto" })}" />`;
  const href = opts.href ? safeUrl(opts.href) : "";
  const linked = href ? `<a href="${href}" style="text-decoration:none;">${img}</a>` : img;
  const inner = opts.plate
    ? `<table ${TABLE_RESET} width="${Math.round(opts.width)}" align="center" class="mp-plate" bgcolor="${LIGHT.card}" style="${TABLE_RESET_STYLE};${css({
        width: "100%",
        "max-width": `${Math.round(opts.width)}px`,
        background: LIGHT.card,
        "background-color": LIGHT.card,
        "border-radius": `${RADIUS.xl}px`,
      })}">
  <tr><td align="center" style="${css({ padding: pad, "text-align": "center" })}">${linked}</td></tr>
</table>`
    : linked;
  return `<table ${TABLE_RESET} width="100%" style="${TABLE_RESET_STYLE};width:100%;">
  <tr><td align="center" style="${css({ "text-align": "center", "padding-bottom": LAYOUT.gutter })}">${inner}</td></tr>
</table>`;
}

export function card(opts: {
  bodyHtml: string;
  tone?: "default" | "muted" | "outline";
  padding?: number;
}): string {
  const tone = opts.tone ?? "muted";
  const bg = tone === "outline" ? LIGHT.card : LIGHT.mutedBg;
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
  variant?: "otp" | "identifier";
}

export function codeBlock(code: string, opts: CodeBlockOptions = {}): string {
  const identifier = opts.variant === "identifier";
  return card({
    tone: "muted",
    bodyHtml: `<p class="mp-fg" style="${typeStyle(identifier ? "body" : "code", {
      color: LIGHT.fg,
      margin: 0,
      "text-align": "center",
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

export function footer(opts: {
  origin: string;
  note?: string;
  links?: ReadonlyArray<FooterLink> | false;
  socials?: ReadonlyArray<FooterLink> | false;
  unsubscribeUrl?: string;
  lang?: string;
}): string {
  const year = new Date().getFullYear();
  const parts: string[] = [];
  const zh = opts.lang === "zh-CN";
  const linkLabel = (l: FooterLink) => (zh ? ((FOOTER_WORDS_ZH.links as Record<string, string>)[l.href] ?? l.label) : l.label);

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
        const href = safeUrl(
          /^https?:\/\//.test(l.href) ? l.href : `${opts.origin}${l.href}`,
        );
        if (!href) return "";
        return `<a class="mp-muted" href="${href}" style="${css({
          color: LIGHT.mutedFg,
          "text-decoration": "underline",
          "white-space": "nowrap",
        })}">${escapeHtml(linkLabel(l))}</a>`;
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

  const unsubscribe = opts.unsubscribeUrl ? safeUrl(opts.unsubscribeUrl) : "";
  if (unsubscribe) {
    parts.push(
      `<p class="mp-muted" style="${typeStyle("small", {
        color: LIGHT.mutedFg,
        margin: "0 0 12px",
        "text-align": "center",
      })}">${zh ? escapeHtml(FOOTER_WORDS_ZH.unsubscribeAsk) : "Don&rsquo;t want these emails?"} <a class="mp-muted" href="${unsubscribe}" style="${css({
        color: LIGHT.mutedFg,
        "text-decoration": "underline",
      })}">${zh ? escapeHtml(FOOTER_WORDS_ZH.unsubscribe) : "Unsubscribe"}</a></p>`,
    );
  }

  parts.push(
    `<p class="mp-muted" style="${typeStyle("small", {
      color: LIGHT.mutedFg,
      margin: 0,
      "text-align": "center",
    })}">&copy; ${year} ${escapeHtml(BRAND.legalName)}. ${zh ? escapeHtml(FOOTER_WORDS_ZH.rights) : "All rights reserved."}</p>`,
  );

  return parts.join("\n");
}

export { TYPE, LIGHT, RADIUS, LAYOUT };
export type { PillTone };
