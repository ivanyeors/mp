import { renderEmailShell } from "./base";
import { linkLabel, parseCampaignBody, URL_IN_TEXT } from "./campaign-body";
import { bulletList, heading, link, paragraphHtml, placeholderHint } from "./components";
import { escapeHtml } from "./html";
import type { RenderedEmail } from "./types";

export { linkLabel, parseCampaignBody, type CampaignBlock } from "./campaign-body";

export const COMPOSED_CAMPAIGN_NOTE = "You're getting this because you agreed to receive emails from Mpillow.";

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
  preheader: string | null;
  body: string;
  greeting: boolean;
}

export interface ComposedCampaignPlaceholders {
  subject: string;
  body: string;
  buttonLabel: string;
}

export interface ComposedCampaignEmailData extends ComposedCampaignContent {
  firstName: string | null;
  button: { label: string; href: string } | null;
  unsubscribeUrl: string;
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
  const button = p.button?.label.trim() ? p.button : null;

  const html: string[] = [];
  const text: string[] = [];
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
