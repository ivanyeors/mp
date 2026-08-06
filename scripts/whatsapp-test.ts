/**
 * One-off WhatsApp send test (not a seed). Verifies WHATSAPP_TOKEN +
 * WHATSAPP_PHONE_NUMBER_ID work and that the `appointment_morning_of` template's
 * placeholder count matches what the code sends (4 body params).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/whatsapp-test.ts +65XXXXXXXX
 *   # or, if WHATSAPP_ALLOWLIST / WHATSAPP_TEST_TO is set, no arg needed:
 *   npx tsx --env-file=.env.local scripts/whatsapp-test.ts
 *
 * Meta TEST numbers only deliver to recipients you've verified in API Setup.
 * Never prints the token; the recipient is masked to its last 4 digits.
 */
import { sendMorningOfTemplate } from "../lib/appointments/whatsapp";

function pickRecipient(): string | null {
  const fromArg = process.argv[2]?.trim();
  if (fromArg) return fromArg;
  const fromEnv = process.env.WHATSAPP_TEST_TO?.trim();
  if (fromEnv) return fromEnv;
  const allow = process.env.WHATSAPP_ALLOWLIST?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow?.[0] ?? null;
}

const mask = (n: string) =>
  n.length <= 4 ? "****" : `${"*".repeat(Math.max(0, n.length - 4))}${n.slice(-4)}`;

async function main() {
  if (!process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  if (!process.env.WHATSAPP_TOKEN) throw new Error("Missing WHATSAPP_TOKEN");

  const to = pickRecipient();
  if (!to) {
    console.error(
      "No recipient. Pass one:\n  npx tsx --env-file=.env.local scripts/whatsapp-test.ts +65XXXXXXXX",
    );
    console.error("(Meta test numbers only deliver to numbers you've verified in API Setup.)");
    process.exit(2);
  }

  console.log(`Sending appointment_morning_of (4 params, lang en) to ${mask(to)} …`);
  try {
    const id = await sendMorningOfTemplate(to, {
      guestName: "Ivan",
      dateLabel: "6 Aug",
      timeLabel: "3:00 PM",
      venue: "Mpillow Studio",
    });
    console.log(`✓ Sent. Provider message id: ${id ?? "(none returned)"}`);
    console.log("→ Creds + template name + 4-param count all good. Check WhatsApp on that phone.");
  } catch (e) {
    console.error(`✗ Send failed: ${e instanceof Error ? e.message : String(e)}`);
    console.error(
      "Codes: 132000 = param-count mismatch · 132001 = template name/lang mismatch · " +
        "131030 = recipient not in the test number's allowed list (verify it in API Setup) · " +
        "190/appuser = bad/expired token.",
    );
    process.exit(1);
  }
}

main();
