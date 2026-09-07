/**
 * Create + submit the 4 appointment templates on a WABA, with body-param counts
 * that exactly match lib/appointments/whatsapp.ts (day_before/morning_of/
 * confirmation = 4, cancelled = 2). Category UTILITY, language en. Idempotent-ish:
 * a duplicate name+lang just returns an error we print and skip.
 *
 * After appointment_confirmation shows Approved, set WHATSAPP_TEMPLATE_CONFIRM=
 * appointment_confirmation to activate the immediate booking confirmation in
 * app/api/appointments/book/route.ts (it stays dormant until then).
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-create-templates.ts <WABA_ID>
 */
const GRAPH = "https://graph.facebook.com/v21.0";

type Def = { name: string; text: string; example: string[] };

const TEMPLATES: Def[] = [
  {
    name: "appointment_day_before",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} type
    text: "Hi {{1}}, a reminder that your {{4}} appointment is tomorrow, {{2}} at {{3}}. See you then!",
    example: ["Ivan", "6 Aug", "3:00 PM", "Chiropractic"],
  },
  {
    name: "appointment_morning_of",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} venue — body must not END with a variable
    text: "Hi {{1}}, see you today at {{4}}! Your appointment is on {{2}} at {{3}}. See you soon!",
    example: ["Ivan", "6 Aug", "3:00 PM", "Mpillow Studio"],
  },
  {
    name: "appointment_cancelled",
    // {{1}} type, {{2}} rebook url — body must not END with a variable
    text: "Your {{1}} appointment has been cancelled. Rebook anytime here: {{2}} — hope to see you soon.",
    example: ["Chiropractic", "https://mpillow.com/book"],
  },
  {
    name: "appointment_confirmation",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} type — body must not END with a variable
    text: "Hi {{1}}, your {{4}} appointment is booked for {{2}} at {{3}}. We'll remind you the day before — see you then!",
    example: ["Ivan", "6 Aug", "3:00 PM", "Chiropractic"],
  },
];

async function main() {
  const waba = process.argv[2]?.trim();
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!waba) throw new Error("Pass the WABA id as arg 1");
  if (!token) throw new Error("Missing WHATSAPP_TOKEN");

  // Optional filter: names to create (comma-separated) as arg 2. Default = all.
  const only = process.argv[3]?.split(",").map((s) => s.trim()).filter(Boolean);
  const todo = only?.length ? TEMPLATES.filter((t) => only.includes(t.name)) : TEMPLATES;

  for (const t of todo) {
    const body = {
      name: t.name,
      language: "en",
      category: "UTILITY",
      components: [
        { type: "BODY", text: t.text, example: { body_text: [t.example] } },
      ],
    };
    const res = await fetch(`${GRAPH}/${waba}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`✓ ${t.name}: ${json?.status ?? "submitted"} (id ${json?.id ?? "?"})`);
    } else {
      console.log(`✗ ${t.name}: ${json?.error?.code ?? res.status} — ${json?.error?.message ?? "failed"}`);
    }
  }
  console.log("\nUtility templates usually approve within minutes. Re-run the send test after they show Approved.");
}

main();
