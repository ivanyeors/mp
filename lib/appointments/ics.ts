// Hand-built RFC 5545 iCalendar. No dependency: a VEVENT is a dozen lines of text.

type VEventInput = {
  summary: string;
  startIso: string; // ISO datetime, may carry +08:00 (SGT) or Z
  endIso: string;
  location?: string;
  description?: string;
  uid: string;
  /** DTSTAMP source; defaults to startIso (never Date.now — keeps output deterministic). */
  stampIso?: string;
};

/** ISO (with offset or Z) → iCalendar UTC basic format `YYYYMMDDTHHMMSSZ`. */
export function toIcsUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid datetime: ${iso}`);
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT value per RFC 5545 §3.3.11. Order matters: backslash first. */
function esc(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Build a single-event VCALENDAR string (CRLF line endings, per RFC 5545). */
export function buildVEvent(input: VEventInput): string {
  const dtstamp = toIcsUtc(input.stampIso ?? input.startIso);
  // ponytail: no line-folding. RFC 5545 SHOULDs fold at 75 octets and LOCATION/DESCRIPTION
  // can exceed that, but iOS/Google/Outlook all parse unfolded lines. Add folding only if a
  // strict validator ever enters the loop.
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mpillow//Appointments//EN",
    "BEGIN:VEVENT",
    `UID:${esc(input.uid)}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${toIcsUtc(input.startIso)}`,
    `DTEND:${toIcsUtc(input.endIso)}`,
    `SUMMARY:${esc(input.summary)}`,
  ];
  if (input.location) lines.push(`LOCATION:${esc(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${esc(input.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
