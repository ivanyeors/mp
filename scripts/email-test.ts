/**
 * Prove the configured email transport actually delivers. Uses the same
 * auto-detected transport prod uses (Resend → Gmail → console), so if it
 * prints transport=console your provider env is NOT set and nothing sends.
 *
 *   npx tsx --env-file=.env.local scripts/email-test.ts you@example.com
 * On the host, run with that host's env instead of .env.local.
 */
import { getDefaultTransport, getDefaultFromAddress } from "../lib/email/transport";

async function main() {
  const to = process.argv[2]?.trim() || process.env.SUPPORT_EMAIL?.trim();
  if (!to) throw new Error("Pass a recipient: scripts/email-test.ts you@example.com");

  const transport = getDefaultTransport();
  const from = getDefaultFromAddress();
  const masked = to.replace(/^(.).*(@.*)$/, "$1***$2");
  console.log(`transport=${transport.name}  from="${from}"  to=${masked}`);
  if (transport.name === "console") {
    console.log("⚠ transport is console — no provider env set, this will NOT deliver. Set RESEND_API_KEY (+ EMAIL_FROM).");
  }

  const res = await transport.send({
    to,
    from,
    subject: "Mpillow email transport test",
    text: "If you can read this, prod email delivery works.",
    html: "<p>If you can read this, prod email delivery works.</p>",
  });
  console.log(`✓ sent. provider id: ${res.id ?? "(none)"}`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
