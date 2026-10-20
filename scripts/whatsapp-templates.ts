/**
 * Diagnostic: list the message templates on the WABA that owns the configured
 * phone number. Helps diagnose #132001 "template name does not exist" — usually the
 * templates live on a different WABA than the number, or under a different language.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-templates.ts
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function get(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!id || !token) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN");

  // 1) find the WABA that owns this phone number
  const num = await get(
    `${GRAPH}/${id}?fields=display_phone_number,verified_name,whatsapp_business_account`,
    token,
  );
  console.log(`phone node (${num.status}):`, JSON.stringify(num.json));
  const waba = (num.json as { whatsapp_business_account?: { id?: string } })
    ?.whatsapp_business_account?.id;
  if (!waba) {
    console.error("Could not resolve WABA id from the phone number node (see above).");
    process.exit(1);
  }

  // 2) list every template on that WABA
  const tpl = await get(
    `${GRAPH}/${waba}/message_templates?fields=name,status,language,category&limit=200`,
    token,
  );
  const rows = (tpl.json as { data?: Array<{ name: string; status: string; language: string }> })
    ?.data ?? [];
  console.log(`\nWABA ${waba} has ${rows.length} template(s):`);
  for (const r of rows) console.log(`  - ${r.name}  [${r.language}]  ${r.status}`);
  const need = ["appointment_day_before_v2", "appointment_morning_of", "appointment_cancelled_v2"];
  console.log("\nNeeded by the code (lang en):");
  for (const n of need) {
    const hit = rows.find((r) => r.name === n);
    console.log(`  ${hit ? "✓" : "✗ MISSING"} ${n}${hit ? `  [${hit.language}] ${hit.status}` : ""}`);
  }
}

main();
