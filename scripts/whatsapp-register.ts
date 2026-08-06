/**
 * One-time Cloud API registration for the business phone number (fixes error
 * #133010 "Account not registered"). Sets the number's two-step-verification PIN.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/whatsapp-register.ts          # generates a PIN
 *   npx tsx --env-file=.env.local scripts/whatsapp-register.ts 246813   # use your own 6-digit PIN
 *
 * SAVE THE PIN — you need it to re-register or move the number later.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

async function main() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!id) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  if (!token) throw new Error("Missing WHATSAPP_TOKEN");

  const arg = process.argv[2]?.trim();
  const pin = arg && /^\d{6}$/.test(arg)
    ? arg
    : String(Math.floor(100000 + Math.random() * 900000));

  console.log(`Registering phone number id …${id.slice(-4)} for Cloud API …`);
  const res = await fetch(`${GRAPH}/${id}/register`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`✗ Register failed (${res.status}): ${JSON.stringify(json)}`);
    console.error(
      "If it says a PIN is required/incorrect, the number already had 2FA — re-run with that PIN. " +
        "If it says verification needed, verify the number in API Setup first.",
    );
    process.exit(1);
  }

  console.log(`✓ Registered: ${JSON.stringify(json)}`);
  console.log("");
  console.log(`★★★  SAVE THIS PIN → ${pin}  ★★★`);
  console.log("(the number's two-step-verification PIN — needed to re-register/move it)");
}

main();
