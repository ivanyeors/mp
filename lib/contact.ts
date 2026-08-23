/**
 * Single source of truth for the PUBLIC WhatsApp number — the human sales line
 * customers chat to, shown on marketing, support, and privacy pages.
 *
 * Two different numbers are in play, deliberately:
 *
 *   - This one (+65 8780 5311) is staffed by a person. Customers message it and
 *     get a reply from sales.
 *   - The utility sender (`WHATSAPP_PHONE_NUMBER_ID`, +65 8809 7571) is an
 *     automated Cloud API line that sends appointment templates and handles the
 *     Confirm / Reschedule button replies. Nobody chats to it.
 *
 * So do NOT "keep them in sync" — they are separate on purpose. Never surface
 * the utility number in customer-facing copy, or people will start a
 * conversation nobody is reading.
 *
 * Override with `NEXT_PUBLIC_SUPPORT_WHATSAPP` (E.164 digits, no `+`). Next
 * inlines `NEXT_PUBLIC_*` at build time, so the reference below must stay
 * static — never index `process.env` dynamically, and remember a change needs a
 * redeploy to take effect.
 */

/** The staffed sales line, used when the env override is unset. */
export const DEFAULT_SUPPORT_WHATSAPP = "6587805311";

function toDigits(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || DEFAULT_SUPPORT_WHATSAPP;
}

/** E.164 digits with no leading `+` — the wa.me path segment. */
export const SUPPORT_WHATSAPP_DIGITS = toDigits(
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
);

/** Click-to-chat link. */
export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_DIGITS}`;

/** Human-readable form. SG mobiles group 4+4, e.g. `+65 8780 5311`. */
export function formatWhatsAppDisplay(
  digits: string = SUPPORT_WHATSAPP_DIGITS,
): string {
  if (digits.startsWith("65") && digits.length === 10) {
    const national = digits.slice(2);
    return `+65 ${national.slice(0, 4)} ${national.slice(4)}`;
  }
  return `+${digits}`;
}

export const SUPPORT_WHATSAPP_DISPLAY = formatWhatsAppDisplay();
