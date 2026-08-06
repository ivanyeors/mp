// ============================================================
// Branded HTML email base (#84)
// ============================================================
//
// ONE shared wrapper for every outbound email — customer AND partner. Table-based
// with inline styles so it renders in Gmail / Outlook / Apple Mail (which strip
// <style> blocks and ignore modern CSS). Templates pass only their own body copy;
// the logo, typography and footer chrome live here so they never drift again.
//
// The logo must be an ABSOLUTE url (email clients have no page origin), so it is
// resolved through getSiteOrigin() + the public asset path.

import { getSiteOrigin } from "@/lib/site-url";

/** Public logo asset; served absolute for email clients (getSiteOrigin + path). */
const LOGO_PATH = "/mpillow_logo_2026.png";

/** Shared HTML escaper (was copy-pasted across templates.ts / rma.ts / contact.ts). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap body HTML in the branded base. `title` renders an <h1> when given (some
 * templates carry the heading as copy); omit it to let the body stand alone.
 * `footer` overrides the default brand line. Body HTML is inserted verbatim —
 * callers escape their own interpolated values.
 */
export function renderEmailShell(opts: {
  title?: string;
  bodyHtml: string;
  footer?: string;
}): string {
  const logo = `${getSiteOrigin()}${LOGO_PATH}`;
  const footer = opts.footer ?? "mpillow";
  const heading = opts.title
    ? `<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px;color:#111;">${escapeHtml(
        opts.title,
      )}</h1>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;">
    <tr><td align="center" style="padding:24px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
        <tr><td align="center" style="padding:0 0 20px;">
          <img src="${logo}" alt="mpillow" width="132" style="display:block;border:0;width:132px;max-width:60%;height:auto;" />
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #eeeeee;border-radius:12px;padding:28px;">
          ${heading}
          ${opts.bodyHtml}
        </td></tr>
        <tr><td align="center" style="padding:16px 0 0;color:#999999;font-size:12px;">${escapeHtml(
          footer,
        )}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
