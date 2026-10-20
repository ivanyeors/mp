/**
 * Create + submit the 4 appointment templates and the 2 aftercare templates on a
 * WABA, with body-param counts that exactly match lib/appointments/whatsapp.ts
 * (day_before/morning_of/confirmation = 4, cancelled = 5, aftercare = 5).
 * Category UTILITY, language en. Idempotent-ish:
 * a duplicate name+lang just returns an error we print and skip.
 *
 * The day-before template carries the Confirm / Reschedule quick replies the
 * webhook acts on. It is `appointment_day_before_v2` because the first
 * `appointment_day_before` was approved without them: adding buttons to an
 * approved template sends it back to review, so a new name keeps the old one
 * sending until the new one is approved and WHATSAPP_TEMPLATE_DAY_BEFORE is
 * switched over.
 *
 * `appointment_cancelled_v2` is the same story: the first took only the type
 * and a rebook link, with nowhere to name the staffed line a guest can talk
 * to. Until v2 is approved and WHATSAPP_TEMPLATE_CANCEL names it, the code
 * keeps sending the first one's shape.
 *
 * After appointment_confirmation shows Approved, set WHATSAPP_TEMPLATE_CONFIRM=
 * appointment_confirmation to activate the immediate booking confirmation in
 * app/api/appointments/book/route.ts (it stays dormant until then).
 *
 * The two aftercare templates (CRM slice 13), `aftercare_review_request` and
 * `aftercare_checkup`, are 5 body params each plus a URL button whose one
 * variable ends the URL. Their copy is approved by the owner word for word and
 * lives in lib/whatsapp/aftercare-templates.ts, where a test pins it. Once each
 * shows Approved, set WHATSAPP_TEMPLATE_AFTERCARE_REVIEW / _CHECKUP to its name;
 * until then aftercare goes by email only. Meta may file either as Marketing
 * instead of Utility: run scripts/whatsapp-preflight.ts to see the category.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-create-templates.ts <WABA_ID>
 *   npx tsx --env-file=.env.local scripts/whatsapp-create-templates.ts <WABA_ID> aftercare_review_request,aftercare_checkup
 */
import { AFTERCARE_WA_TEMPLATES } from "@/lib/whatsapp/aftercare-templates";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * `buttons` are QUICK_REPLY labels; a tap arrives at the webhook as that text.
 * `urlButton` is one URL button with a variable at the end of its URL, filled
 * at send by sendTemplateMessage's `urlButtonParam`.
 */
type Def = {
  name: string;
  text: string;
  example: string[];
  buttons?: string[];
  urlButton?: { text: string; url: string; example: string };
};

const TEMPLATES: Def[] = [
  {
    name: "appointment_day_before_v2",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} type
    text: "Hi {{1}}, a reminder that your {{4}} appointment is tomorrow, {{2}} at {{3}}. Tap Confirm if you can make it, or Reschedule to pick a new time.",
    example: ["Ivan", "6 Aug", "3:00 PM", "Chiropractic"],
    // Labels must keep the words the webhook matches (parseInboundActions).
    buttons: ["Confirm", "Reschedule"],
  },
  {
    name: "appointment_morning_of",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} venue — body must not END with a variable
    text: "Hi {{1}}, see you today at {{4}}! Your appointment is on {{2}} at {{3}}. See you soon!",
    example: ["Ivan", "6 Aug", "3:00 PM", "Mpillow Studio"],
  },
  {
    name: "appointment_cancelled_v2",
    // {{1}} name, {{2}} type, {{3}} date + time, {{4}} rebook url, {{5}} staffed
    // line's number (WhatsApp makes it tappable) — body must not END with a variable
    text: "Hi {{1}}, your {{2}} appointment on {{3}} has been cancelled.\n\nYou can rebook here: {{4}}\n\nIf you have any questions, please message our team on WhatsApp at {{5}}. Hope to see you soon!",
    example: ["Ivan", "Customisation", "Tue 20 Oct 2026 at 17:00", "https://mpillow.com/book", "+65 8780 5311"],
  },
  {
    name: "appointment_confirmation",
    // {{1}} name, {{2}} date, {{3}} time, {{4}} type — body must not END with a variable
    text: "Hi {{1}}, your {{4}} appointment is booked for {{2}} at {{3}}. We'll remind you the day before — see you then!",
    example: ["Ivan", "6 Aug", "3:00 PM", "Chiropractic"],
  },
  // aftercare_review_request, aftercare_checkup (CRM slice 13).
  ...AFTERCARE_WA_TEMPLATES.map(({ name, text, example, urlButton }) => ({ name, text, example, urlButton })),
];

/** The template's BUTTONS component, or none. */
function buttonsOf(t: Def): Record<string, unknown>[] {
  const buttons: Record<string, unknown>[] = [
    ...(t.buttons ?? []).map((text) => ({ type: "QUICK_REPLY", text })),
    ...(t.urlButton
      ? [{ type: "URL", text: t.urlButton.text, url: t.urlButton.url, example: [t.urlButton.example] }]
      : []),
  ];
  return buttons.length ? [{ type: "BUTTONS", buttons }] : [];
}

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
        ...buttonsOf(t),
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
      // Meta's `message` is a generic "Invalid parameter"; the user_title /
      // user_msg pair names the rule broken (e.g. 2388024: this name already
      // has English content — it was submitted before; look up its status).
      const e = json?.error ?? {};
      const why = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ");
      console.log(
        `✗ ${t.name}: ${e.code ?? res.status}${e.error_subcode ? `/${e.error_subcode}` : ""} — ${why || e.message || "failed"}`,
      );
    }
  }
  console.log("\nUtility templates usually approve within minutes. Re-run the send test after they show Approved.");
}

main();
