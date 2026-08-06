/**
 * Verify the Gmail service-account transport end to end by reading the SA JSON
 * key directly (no env transcription) and sending one real email. Proves the
 * key + domain-wide delegation are working before you paste creds into Vercel.
 *
 *   npx tsx scripts/email-test-gmail.ts <path-to-key.json> [to@addr]
 */
import { readFileSync } from "fs";
import { GmailTransport } from "../lib/email/transport";

async function main() {
  const keyPath = process.argv[2]?.trim();
  const to = process.argv[3]?.trim() || "sg@mpillow.com";
  if (!keyPath) throw new Error("usage: email-test-gmail.ts <key.json> [to@addr]");

  const key = JSON.parse(readFileSync(keyPath, "utf8")) as {
    client_email: string;
    private_key: string;
  };
  const sender = process.env.GMAIL_SENDER?.trim() || "sg@mpillow.com";

  const transport = new GmailTransport(key.client_email, key.private_key, sender);
  const res = await transport.send({
    to,
    from: sender,
    subject: "Mpillow Gmail transport test",
    text: "If you can read this, Gmail service-account delivery works.",
    html: "<p>If you can read this, Gmail service-account delivery works.</p>",
  });
  console.log(`✓ sent via gmail as ${sender} -> ${to}. provider id: ${res.id ?? "(none)"}`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
