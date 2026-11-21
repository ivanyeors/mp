function digitsOnly(raw: string): string {
  const trimmed = raw.trim();
  const keepPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return keepPlus ? `+${digits}` : digits;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = digitsOnly(raw);
  if (!s) return null;

  let national: string;
  if (s.startsWith("+65") && s.length === 11) {
    national = s.slice(3);
  } else if (s.startsWith("65") && s.length === 10) {
    national = s.slice(2);
  } else if (s.startsWith("065") && s.length === 11) {
    national = s.slice(3);
  } else if (/^\d{8}$/.test(s)) {
    national = s;
  } else if (s.startsWith("+") && /^\+\d{8,15}$/.test(s)) {
    return s;
  } else {
    return null;
  }

  if (!/^[689]\d{7}$/.test(national)) return null;
  return `+65${national}`;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) != null;
}

export function isPhoneAllowed(
  e164: string,
  opts: { nodeEnv?: string; allowlistEnv?: string } = {},
): boolean {
  const env = opts.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (env === "production") return true;

  const raw = opts.allowlistEnv ?? process.env.WHATSAPP_ALLOWLIST ?? "";
  const entries = raw
    .split(",")
    .map((s) => normalizePhone(s.trim()))
    .filter((x): x is string => Boolean(x));
  if (entries.length === 0) return true;
  return entries.includes(e164);
}
