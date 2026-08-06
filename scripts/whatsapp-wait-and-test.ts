/**
 * Poll template approval, then auto-send the test once appointment_morning_of is
 * APPROVED. Times out after ~12 min.
 *   npx tsx --env-file=.env.local scripts/whatsapp-wait-and-test.ts <WABA_ID> +6596374631
 */
import { sendMorningOfTemplate } from "../lib/appointments/whatsapp";

const GRAPH = "https://graph.facebook.com/v21.0";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function statuses(waba: string, token: string): Promise<Record<string, string>> {
  const res = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,status&limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json: any = await res.json().catch(() => ({}));
  const map: Record<string, string> = {};
  for (const t of json?.data ?? []) map[t.name] = t.status;
  return map;
}

async function main() {
  const waba = process.argv[2]?.trim();
  const to = process.argv[3]?.trim() || "+6596374631";
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!waba || !token) throw new Error("Missing WABA id / WHATSAPP_TOKEN");

  const key = "appointment_morning_of";
  for (let i = 0; i < 36; i++) {
    const s = await statuses(waba, token);
    console.log(`[${i}] day_before=${s.appointment_day_before ?? "?"} morning_of=${s.appointment_morning_of ?? "?"} cancelled=${s.appointment_cancelled ?? "?"}`);
    if (s[key] === "APPROVED") {
      console.log(`\n${key} APPROVED — sending test to …${to.slice(-4)} …`);
      try {
        const id = await sendMorningOfTemplate(to, {
          guestName: "Ivan",
          dateLabel: "6 Aug",
          timeLabel: "3:00 PM",
          venue: "Mpillow Studio",
        });
        console.log(`✓ SENT. Provider message id: ${id ?? "(none)"} — check WhatsApp on that phone.`);
      } catch (e) {
        console.error(`✗ Send failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      return;
    }
    if (s[key] === "REJECTED") {
      console.error(`\n${key} was REJECTED by Meta. Check the rejection reason in WhatsApp Manager.`);
      process.exit(1);
    }
    await sleep(20000);
  }
  console.log("\nStill pending after ~12 min. Re-run: npx tsx --env-file=.env.local scripts/whatsapp-test.ts +6596374631");
}

main();
