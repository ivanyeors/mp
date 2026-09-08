/**
 * Send the real registered templates to a real inbox, through the transport
 * production uses. This is the only true fidelity check: the dev preview and
 * docs/email-templates-preview.html render in a browser, and forwarding HTML
 * through a mail client's compose window silently sanitizes it (Gmail's strips
 * every <img>, every CSS background and the whole <style> block).
 *
 *   pnpm email:send you@example.com                        # all templates
 *   pnpm email:send you@example.com order.payment_receipt  # one, or a prefix
 *   pnpm email:send you@example.com order.                 # every order email
 *   pnpm email:send you@example.com --fixture=hostile      # injection probes
 *   pnpm email:send you@example.com --no-prefix            # true subject lines
 *   pnpm email:send you@example.com --origin=https://…    # override the site url
 *
 * THIS SENDS REAL EMAIL. It refuses to run without an explicit recipient, and
 * refuses outright if the transport resolves to `console` (no provider env),
 * because a silent no-op reads exactly like a successful send.
 */

// Set BEFORE importing anything that reads it. An explicit --origin wins over
// .env.local, because the value that matters here is the one the RECIPIENT's
// mail client will fetch from, not the one this machine develops against.
const originFlag = process.argv
  .slice(2)
  .find((a) => a.startsWith("--origin="))
  ?.slice("--origin=".length)
  .trim();
if (originFlag) process.env.NEXT_PUBLIC_SITE_URL = originFlag;
process.env.NEXT_PUBLIC_SITE_URL ||= "https://custom.mpillow.com";

import { EMAIL_REGISTRY, type EmailFixture } from "../lib/email/registry";
import { getSiteOrigin } from "../lib/site-url";
import { getDefaultTransport, getDefaultFromAddress } from "../lib/email/transport";

/** Providers rate-limit bursts; 24 sends back-to-back is a burst. */
const GAP_MS = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith("--"));
  const positional = args.filter((a) => !a.startsWith("--"));

  const to = positional[0]?.trim();
  if (!to || !to.includes("@")) {
    throw new Error("usage: send-email-previews.ts <to@addr> [id-or-prefix] [--fixture=hostile] [--no-prefix]");
  }

  const filter = positional[1]?.trim();
  const fixture: EmailFixture = flags.includes("--fixture=hostile") ? "hostile" : "happy";
  // The id prefix keeps 24 mails apart in a threaded inbox, and stops clients
  // grouping the ones that legitimately share a subject. Drop it to review the
  // subject lines exactly as a customer sees them.
  const prefixIds = !flags.includes("--no-prefix");

  const entries = filter
    ? EMAIL_REGISTRY.filter((e) => e.id === filter || e.id.startsWith(filter))
    : [...EMAIL_REGISTRY];

  if (entries.length === 0) {
    const ids = EMAIL_REGISTRY.map((e) => e.id).join("\n  ");
    throw new Error(`No template matches "${filter}". Available:\n  ${ids}`);
  }

  const transport = getDefaultTransport();
  const from = getDefaultFromAddress();
  if (transport.name === "console") {
    throw new Error(
      "transport=console — no provider env is set, so nothing would be delivered. " +
        "Run with --env-file=.env.local, or set RESEND_API_KEY / GMAIL_* first.",
    );
  }

  // Every logo, link and button in an email is an ABSOLUTE url built from this
  // origin — a mail client has no page to resolve against. So a .env.local
  // pointing at localhost (right for `pnpm dev`, and loaded by --env-file
  // before this script runs) produces mail whose images are broken and whose
  // buttons go nowhere, while still reporting a clean send.
  const origin = getSiteOrigin();
  if (!origin.startsWith("https://")) {
    throw new Error(
      `origin=${origin} — not reachable from a mail client, so every image and link would be dead.\n` +
        `  This is almost always NEXT_PUBLIC_SITE_URL in .env.local pointing at localhost.\n` +
        `  Override it for this run:  pnpm email:send ${to} --origin=https://custom.mpillow.com`,
    );
  }

  const masked = to.replace(/^(.).*(@.*)$/, "$1***$2");
  console.log(
    `transport=${transport.name}  from="${from}"  to=${masked}  fixture=${fixture}`,
  );
  console.log(`origin=${origin}  (logo: ${origin}/mpillow_logo_2026.png)`);
  console.log(`sending ${entries.length} template${entries.length === 1 ? "" : "s"}…\n`);

  let sent = 0;
  const failed: Array<{ id: string; error: string }> = [];

  for (const [i, entry] of entries.entries()) {
    const rendered = entry.render(fixture);
    const subject = prefixIds ? `[${entry.id}] ${rendered.subject}` : rendered.subject;
    try {
      const res = await transport.send({
        to,
        from,
        subject,
        text: rendered.text,
        html: rendered.html,
      });
      sent += 1;
      console.log(`✓ ${entry.id.padEnd(32)} ${res.id ?? ""}`);
    } catch (err) {
      // Keep going: one bad template should not strand the other 23.
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ id: entry.id, error: message });
      console.error(`✗ ${entry.id.padEnd(32)} ${message}`);
    }
    if (i < entries.length - 1) await sleep(GAP_MS);
  }

  console.log(`\n${sent}/${entries.length} sent to ${masked}`);
  if (failed.length > 0) {
    console.error(`${failed.length} failed:`);
    for (const f of failed) console.error(`  ${f.id}: ${f.error}`);
    process.exit(1);
  }
  console.log(
    "\nNote: the 4 Supabase auth templates are not included — Supabase renders and\n" +
      "sends those itself. To see one for real, trigger a password reset; sending it\n" +
      "from here would show the literal {{ .Token }} placeholder instead of a code.",
  );
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
