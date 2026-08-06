/**
 * Emit paste-ready Vercel env values from a service-account JSON key — no hand
 * transcription of the private key. GMAIL_PRIVATE_KEY is written as one line
 * with literal \n (the app converts them back).
 *
 *   npx tsx scripts/gmail-env-write.ts <key.json> <out.txt>
 */
import { readFileSync, writeFileSync } from "fs";

const keyPath = process.argv[2]?.trim();
const out = process.argv[3]?.trim();
if (!keyPath || !out) throw new Error("usage: gmail-env-write.ts <key.json> <out.txt>");

const d = JSON.parse(readFileSync(keyPath, "utf8")) as {
  client_email: string;
  private_key: string;
};
const pk = d.private_key.replace(/\n/g, "\\n");

writeFileSync(
  out,
  [
    "Vercel -> mpillow -> Settings -> Environment Variables (Production).",
    "Add these 3 (no surrounding quotes), then Redeploy.",
    "",
    "GMAIL_CLIENT_EMAIL",
    d.client_email,
    "",
    "GMAIL_SENDER",
    "sg@mpillow.com",
    "",
    "GMAIL_PRIVATE_KEY",
    pk,
    "",
  ].join("\n")
);
console.log(`wrote ${out}`);
