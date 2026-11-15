import { isValidPhone, normalizePhone } from "@/lib/appointments/phone";
import { STAFF_MAILBOX, STAFF_MAIL_CC } from "@/lib/contact";

/**
 * The Customer page's Email and WhatsApp buttons (PRD-customer-page-journey
 * slice 02): the link that opens a message to the customer in the app Staff
 * already use. Pure, so the same code builds the link, the copy text and the
 * tests.
 *
 * Nothing here sends anything. A link opens Gmail or WhatsApp with the
 * message filled in, and the Staff member presses send there.
 *
 * | Device   | Email                                   | WhatsApp                |
 * |----------|-----------------------------------------|-------------------------|
 * | computer | Gmail compose, in the Staff mailbox     | WhatsApp Web, the chat  |
 * | iphone   | the Gmail app, then `mailto:` if absent | wa.me (opens the app)   |
 * | android  | `mailto:` (the default mail app)        | wa.me (opens the app)   |
 *
 * WhatsApp documents `wa.me`. Google documents neither Gmail link: both have
 * worked for years and both can change, which is why Copy sits beside every
 * button.
 */

export type ContactDevice = "computer" | "iphone" | "android";

export const CONTACT_DEVICE_NAMES: Record<ContactDevice, string> = {
  computer: "a computer",
  iphone: "an iPhone",
  android: "an Android phone",
};

/**
 * Which links this browser gets. An iPad asks for the desktop site and calls
 * itself a Mac, so a Mac with a touch screen is read as iOS.
 */
export function contactDevice(userAgent: string, maxTouchPoints = 0): ContactDevice {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iphone";
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "iphone";
  return "computer";
}

/**
 * A link carries its text in the address. Browsers and apps differ on how long
 * an address may be; 1,800 characters of text has room to spare in all of
 * them once it is percent-encoded. Copy always has the whole text.
 */
export const LINK_TEXT_MAX = 1800;

/** The text a link carries: whole when it fits, else cut at a word with an ellipsis. */
export function linkText(text: string | null | undefined, max = LINK_TEXT_MAX): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const enc = encodeURIComponent;

/** `a=1&b=2` of the pairs with a value; the order given is the order written. */
function query(pairs: Array<[string, string | null | undefined]>): string {
  return pairs
    .filter((p): p is [string, string] => Boolean(p[1]))
    .map(([k, v]) => `${k}=${enc(v)}`)
    .join("&");
}

export type EmailMessage = { to: string; subject?: string | null; body?: string | null };

export type EmailLink = {
  href: string;
  /** Tried when `href` did not leave the page: an iPhone without the Gmail app. */
  fallback: string | null;
  /** What opens, for the line under the button. */
  opens: string;
};

export type StaffMailFrom = { mailbox: string; cc: string };

/** `mailto:` with the Cc, for the phone's own mail app. */
function mailto(message: EmailMessage, cc: string): string {
  const q = query([
    ["cc", cc],
    ["subject", message.subject?.trim()],
    ["body", linkText(message.body)],
  ]);
  return `mailto:${enc(message.to.trim())}${q ? `?${q}` : ""}`;
}

/** The Email button's link on `device`, from the Staff mailbox with the Cc. */
export function emailLink(
  message: EmailMessage,
  device: ContactDevice,
  from: StaffMailFrom = { mailbox: STAFF_MAILBOX, cc: STAFF_MAIL_CC },
): EmailLink {
  const to = message.to.trim();
  const subject = message.subject?.trim();
  const body = linkText(message.body);
  if (device === "computer") {
    const q = query([
      ["authuser", from.mailbox],
      ["view", "cm"],
      ["fs", "1"],
      ["to", to],
      ["cc", from.cc],
      ["su", subject],
      ["body", body],
    ]);
    return {
      href: `https://mail.google.com/mail/?${q}`,
      fallback: null,
      opens: `Gmail in a new tab, from ${from.mailbox} with ${from.cc} on Cc`,
    };
  }
  if (device === "iphone") {
    const q = query([
      ["to", to],
      ["cc", from.cc],
      ["subject", subject],
      ["body", body],
    ]);
    return {
      href: `googlegmail:///co?${q}`,
      fallback: mailto(message, from.cc),
      opens: `the Gmail app, with ${from.cc} on Cc. Check the From line before you send`,
    };
  }
  return {
    href: mailto(message, from.cc),
    fallback: null,
    opens: `your mail app, with ${from.cc} on Cc. Check the From line before you send`,
  };
}

/**
 * The number as WhatsApp's links want it: digits only, with the country code
 * and no `+`. Null for a number that is missing or does not pass
 * `isValidPhone`, so no button is drawn for one WhatsApp would refuse.
 */
export function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone?.trim() || !isValidPhone(phone)) return null;
  const e164 = normalizePhone(phone);
  return e164 ? e164.replace(/\D/g, "") : null;
}

export type WhatsAppLink = { href: string; opens: string };

/** The WhatsApp button's link on `device`; null without a valid number. */
export function whatsappLink(
  phone: string | null | undefined,
  text: string | null | undefined,
  device: ContactDevice,
): WhatsAppLink | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  const message = linkText(text);
  if (device === "computer") {
    const q = query([
      ["phone", digits],
      ["text", message],
    ]);
    return { href: `https://web.whatsapp.com/send?${q}`, opens: "WhatsApp Web in a new tab, on their chat" };
  }
  return {
    href: `https://wa.me/${digits}${message ? `?text=${enc(message)}` : ""}`,
    opens: "WhatsApp, on their chat",
  };
}

/** `tel:` for the Call button; null without a valid number. */
export function telLink(phone: string | null | undefined): string | null {
  if (!phone?.trim() || !isValidPhone(phone)) return null;
  const e164 = normalizePhone(phone);
  return e164 ? `tel:${e164}` : null;
}

export type SentChannel = "email" | "whatsapp";

/**
 * The Customer note "Sent it" saves (PRD decision: a note, so it needs no
 * table of its own). Says what was done and keeps the words, cut to fit a
 * note.
 */
export function sentNote(
  channel: SentChannel,
  message: { subject?: string | null; body?: string | null },
  max: number,
): string {
  const head = channel === "email" ? "Emailed them from Gmail." : "Messaged them on WhatsApp.";
  const subject = channel === "email" ? message.subject?.trim() : null;
  const body = message.body?.trim();
  const parts = [head];
  if (subject) parts.push(`Subject: ${subject}`);
  if (body) parts.push("", body);
  const note = parts.join("\n");
  return note.length <= max ? note : `${note.slice(0, max - 1).trimEnd()}…`;
}
