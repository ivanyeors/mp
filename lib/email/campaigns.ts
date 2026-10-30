// ============================================================
// Campaign emails Staff write: Admin Panel → Email campaigns
// ============================================================
//
// PRD-email-marketing. Staff write the subject, an inbox preview line, the
// body and one optional button; this renders it in the branded shell with the
// footer's unsubscribe link. It is campaign mail: the sender
// (lib/email-campaigns/sender.ts) sends it through the campaign transport
// only, with `List-Unsubscribe`.
//
// The body is plain text, never HTML, so nothing Staff type can inject markup:
//
//   a blank line         starts a new paragraph
//   a line "- item"      is a bullet (a run of them is one list)
//   a line "## Heading"  is a heading
//   https://…            becomes a link, in a paragraph, shown without the https://
//
// The renderer is pure: the sender resolves the button's link per recipient.
//
// Campaigns written since the block editor (PRD-campaign-email-editor slice
// 03) are typed blocks, rendered by ./campaign-blocks.ts. This renderer stays
// for the campaigns written before it, byte for byte (that PRD's decision 5,
// held by __tests__/legacy-campaign-html.test.ts).
//
// The editor's preview alone passes `placeholders` (PRD-campaign-email-editor
// decision 7): an empty subject, message or button label then shows its
// placeholder, dashed and muted, where the words would go. A send never
// passes them, so a placeholder is never sent.

import { renderEmailShell } from "./base";
import { linkLabel, parseCampaignBody, URL_IN_TEXT } from "./campaign-body";
import { bulletList, heading, link, paragraphHtml, placeholderHint } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

export { linkLabel, parseCampaignBody, type CampaignBlock } from "./campaign-body";

/** Why they get it: the footer's note on every composed campaign. */
export const COMPOSED_CAMPAIGN_NOTE = "You're getting this because you agreed to receive emails from Mpillow.";

/** One line of text, escaped, with its https links as links. */
function lineHtml(text: string): string {
  let out = "";
  let at = 0;
  for (const m of text.matchAll(URL_IN_TEXT)) {
    out += escapeHtml(text.slice(at, m.index));
    out += link({ href: m[0], label: linkLabel(m[0]) });
    at = m.index! + m[0].length;
  }
  return out + escapeHtml(text.slice(at));
}

export interface ComposedCampaignContent {
  subject: string;
  /** The inbox preview line; null uses the start of the body. */
  preheader: string | null;
  body: string;
  /** Open with "Hi <first name>,". */
  greeting: boolean;
}

/** What an empty field shows in the editor's preview. */
export interface ComposedCampaignPlaceholders {
  subject: string;
  body: string;
  buttonLabel: string;
}

export interface ComposedCampaignEmailData extends ComposedCampaignContent {
  firstName: string | null;
  /** The button, resolved for this recipient; null for none. */
  button: { label: string; href: string } | null;
  /** The Customer's unsubscribe confirm page. */
  unsubscribeUrl: string;
  /** The editor's preview only: drawn in place of an empty field. Never set for a send. */
  placeholders?: ComposedCampaignPlaceholders;
}

const greet = (firstName: string | null) => {
  const name = firstName?.replace(/\s+/g, " ").trim();
  return name ? `Hi ${name},` : "Hi,";
};

export function renderComposedCampaignEmail(p: ComposedCampaignEmailData): RenderedEmail {
  const subject = p.subject.replace(/\s+/g, " ").trim();
  const blocks = parseCampaignBody(p.body);
  const greeting = p.greeting ? greet(p.firstName) : null;
  const hint = p.placeholders;
  // A button without words is no button, unless the preview shows its placeholder.
  const button = p.button?.label.trim() ? p.button : null;

  const html: string[] = [];
  const text: string[] = [];
  // In the shell's <h1> place: the shell draws the subject only when there is one.
  if (!subject && hint) html.push(placeholderHint(hint.subject, "h1"));
  if (greeting) {
    html.push(paragraphHtml(escapeHtml(greeting)));
    text.push(greeting, "");
  }
  blocks.forEach((b, i) => {
    if (b.kind === "heading") {
      html.push(heading(b.text, 2, { top: i === 0 && !greeting ? 0 : 12 }));
      text.push(b.text, "");
    } else if (b.kind === "bullets") {
      html.push(bulletList(b.items));
      text.push(...b.items.map((item) => `- ${item}`), "");
    } else {
      html.push(paragraphHtml(b.lines.map(lineHtml).join("<br />")));
      text.push(...b.lines, "");
    }
  });
  if (!blocks.length && hint) html.push(placeholderHint(hint.body));
  // In the shell's button place, which follows the body.
  if (p.button && !button && hint) html.push(placeholderHint(hint.buttonLabel, "button"));
  if (button) text.push(`${button.label}: ${button.href}`, "");
  text.push(COMPOSED_CAMPAIGN_NOTE, `Unsubscribe: ${p.unsubscribeUrl}`);

  const preheader = p.preheader?.replace(/\s+/g, " ").trim();
  return {
    subject,
    html: renderEmailShell({
      ...(subject ? { title: subject } : {}),
      ...(preheader ? { preheader } : {}),
      bodyHtml: html.join("\n"),
      ...(button ? { cta: { href: button.href, label: button.label } } : {}),
      footer: COMPOSED_CAMPAIGN_NOTE,
      unsubscribeUrl: p.unsubscribeUrl,
    }),
    text: text.join("\n"),
  };
}
