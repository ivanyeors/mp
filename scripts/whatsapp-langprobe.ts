/**
 * Probe: send `appointment_morning_of` under several language codes to tell apart
 *  - #132001 on every lang  → template not on THIS number's WABA (wrong/empty WABA)
 *  - success on one lang     → template exists, code just sends the wrong lang code
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-langprobe.ts +6596374631
 */
const GRAPH = "https://graph.facebook.com/v21.0";
const TEMPLATE = "appointment_morning_of";
const LANGS = ["en", "en_US", "en_GB"];

async function main() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const to = process.argv[2]?.trim() || process.env.WHATSAPP_ALLOWLIST?.split(",")[0]?.trim();
  if (!id || !token) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN");
  if (!to) throw new Error("Pass a recipient number as arg 1");

  for (const lang of LANGS) {
    const res = await fetch(`${GRAPH}/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: TEMPLATE,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: ["Ivan", "6 Aug", "3:00 PM", "Mpillow Studio"].map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`[${lang}] ✓ SENT — id ${json?.messages?.[0]?.id ?? "?"}  → template exists in ${lang}`);
    } else {
      const e = json?.error ?? {};
      console.log(`[${lang}] ✗ ${e.code ?? res.status} ${e.error_subcode ?? ""} — ${e.message ?? ""}`);
    }
  }
  console.log("\nAll langs 132001 ⇒ template is on a different WABA than this number.");
}

main();
