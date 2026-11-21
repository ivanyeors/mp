export const DEFAULT_SUPPORT_WHATSAPP = "6587805311";

function toDigits(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits || DEFAULT_SUPPORT_WHATSAPP;
}

export const SUPPORT_WHATSAPP_DIGITS = toDigits(
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
);

export const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_DIGITS}`;

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

export const STAFF_MAILBOX = "sg@mpillow.com";
export const STAFF_MAIL_CC = "admin@mpillow.com";
