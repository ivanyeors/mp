/**
 * One-shot config check for the appointment WhatsApp integration. Verifies in a
 * single pass everything that has to line up before reminders can send, and
 * exits non-zero if any of it does not — so it doubles as a smoke test after a
 * number move or a token rotation.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-preflight.ts
 *
 * It reads config only; it never sends a message. Use scripts/whatsapp-test.ts
 * for an actual send.
 *
 * Checks: required env, that the phone-number ID resolves to the number you
 * expect and is registered for Cloud API, that every template the code names is
 * APPROVED in the language that code sends it as and takes the number of body
 * params the code passes, that the webhook is subscribed, and that the public
 * sales number is not the automated sender.
 */
const GRAPH = "https://graph.facebook.com/v21.0";

type Check = { label: string; ok: boolean; detail: string; fatal: boolean };
const checks: Check[] = [];

function pass(label: string, detail = "") {
  checks.push({ label, ok: true, detail, fatal: false });
}
function fail(label: string, detail: string, fatal = true) {
  checks.push({ label, ok: false, detail, fatal });
}

async function get(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string; code?: number };
  };
  return { ok: res.ok, status: res.status, json };
}

/** Highest {{n}} in the approved BODY text — how many params Meta expects. */
function bodyParamCount(components: unknown): number {
  const list = Array.isArray(components) ? components : [];
  for (const c of list) {
    const comp = c as { type?: string; text?: string };
    if (comp.type?.toUpperCase() !== "BODY" || typeof comp.text !== "string") continue;
    let max = 0;
    for (const m of comp.text.matchAll(/\{\{(\d+)\}\}/g)) {
      max = Math.max(max, Number(m[1]));
    }
    return max;
  }
  return 0;
}

async function main() {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  // --- 1. Required env -----------------------------------------------------
  for (const key of [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
  ]) {
    if (process.env[key]?.trim()) pass(`env ${key}`, "set");
    else fail(`env ${key}`, "missing — sends throw and the webhook rejects");
  }
  if (!process.env.CRON_SECRET?.trim()) {
    fail("env CRON_SECRET", "unset — the reminders cron is open in non-prod", false);
  } else {
    pass("env CRON_SECRET", "set");
  }

  if (!token || !phoneId) {
    report();
    return;
  }

  // --- 2. Who is the sender? ----------------------------------------------
  const num = await get(
    `${GRAPH}/${phoneId}?fields=display_phone_number,verified_name,quality_rating,platform_type,code_verification_status,whatsapp_business_account`,
    token,
  );
  if (!num.ok) {
    fail(
      "sender lookup",
      `phone-number ID did not resolve (${num.status}): ${num.json.error?.message ?? "unknown"}`,
    );
    report();
    return;
  }

  const sender = String(num.json.display_phone_number ?? "");
  const senderDigits = sender.replace(/\D/g, "");
  pass(
    "sender",
    `${sender} — "${num.json.verified_name ?? "?"}" · quality ${num.json.quality_rating ?? "?"}`,
  );

  const platform = String(num.json.platform_type ?? "");
  if (platform && platform.toUpperCase() !== "CLOUD_API") {
    fail(
      "cloud api registration",
      `platform_type is ${platform} — run scripts/whatsapp-register.ts (else error #133010)`,
    );
  } else {
    pass("cloud api registration", platform || "assumed (field not returned)");
  }

  const waba = (
    num.json.whatsapp_business_account as { id?: string } | undefined
  )?.id;
  if (!waba) {
    fail("waba", "could not resolve the owning WABA from the phone-number node");
    report();
    return;
  }
  pass("waba", waba);

  // --- 3. The two numbers must stay distinct -------------------------------
  // The public number is a staffed sales line; the sender is automated. Pointing
  // customers at the sender starts conversations the webhook silently drops.
  const publicDigits = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() || "6587805311")
    .replace(/\D/g, "");
  if (senderDigits && publicDigits === senderDigits) {
    fail(
      "number separation",
      `NEXT_PUBLIC_SUPPORT_WHATSAPP (+${publicDigits}) is the automated sender — it should be the staffed sales line`,
    );
  } else {
    pass("number separation", `public +${publicDigits} ≠ sender ${sender || "?"}`);
  }

  // --- 4. Templates --------------------------------------------------------
  // Language and param count are per call site, because the code is not uniform:
  // three helpers hardcode "en", while sendTemplateMessage honours the env.
  const envLang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en";
  const wanted: { env: string; fallback: string; lang: string; params: number; note: string }[] = [
    { env: "WHATSAPP_TEMPLATE_DAY_BEFORE", fallback: "appointment_day_before", lang: "en", params: 4, note: "day-before reminder" },
    { env: "WHATSAPP_TEMPLATE_MORNING_OF", fallback: "appointment_morning_of", lang: "en", params: 4, note: "morning-of nudge" },
    { env: "WHATSAPP_TEMPLATE_CANCEL", fallback: "appointment_cancelled", lang: "en", params: 2, note: "cancel + rebook link" },
  ];
  const confirm = process.env.WHATSAPP_TEMPLATE_CONFIRM?.trim();
  if (confirm) {
    wanted.push({ env: "WHATSAPP_TEMPLATE_CONFIRM", fallback: confirm, lang: envLang, params: 4, note: "booking confirmation" });
  } else {
    fail(
      "booking confirmation",
      "WHATSAPP_TEMPLATE_CONFIRM unset — bookings send no immediate confirmation",
      false,
    );
  }

  const tpl = await get(
    `${GRAPH}/${waba}/message_templates?fields=name,status,language,components&limit=200`,
    token,
  );
  const rows =
    (tpl.json.data as Array<{
      name: string;
      status: string;
      language: string;
      components?: unknown;
    }>) ?? [];
  if (!tpl.ok) {
    fail("templates", `could not list templates (${tpl.status}): ${tpl.json.error?.message ?? "?"}`);
  } else {
    for (const w of wanted) {
      const name = process.env[w.env]?.trim() || w.fallback;
      const sameName = rows.filter((r) => r.name === name);
      if (sameName.length === 0) {
        fail(`template ${name}`, `not on this WABA (${w.note})`);
        continue;
      }
      const exact = sameName.find((r) => r.language === w.lang);
      if (!exact) {
        fail(
          `template ${name}`,
          `exists as [${sameName.map((r) => r.language).join(", ")}] but code sends "${w.lang}" — silent #132001`,
        );
        continue;
      }
      if (exact.status.toUpperCase() !== "APPROVED") {
        fail(`template ${name}`, `status ${exact.status} (needs APPROVED)`);
        continue;
      }
      const actual = bodyParamCount(exact.components);
      if (actual !== w.params) {
        fail(
          `template ${name}`,
          `body takes ${actual} param(s), code passes ${w.params} — #132000 at send`,
        );
        continue;
      }
      pass(`template ${name}`, `APPROVED [${w.lang}] · ${w.params} params · ${w.note}`);
    }
  }

  // --- 5. Webhook ----------------------------------------------------------
  const subs = await get(`${GRAPH}/${waba}/subscribed_apps`, token);
  const apps = (subs.json.data as Array<{ whatsapp_business_api_data?: { name?: string } }>) ?? [];
  if (!subs.ok) {
    fail("webhook subscription", `could not read (${subs.status}): ${subs.json.error?.message ?? "?"}`, false);
  } else if (apps.length === 0) {
    fail("webhook subscription", "no app subscribed — Confirm/Reschedule replies never arrive");
  } else {
    pass(
      "webhook subscription",
      apps.map((a) => a.whatsapp_business_api_data?.name ?? "app").join(", "),
    );
  }

  // --- 6. Allowlist --------------------------------------------------------
  const allow = process.env.WHATSAPP_ALLOWLIST?.trim();
  const env = process.env.NODE_ENV ?? "development";
  if (env === "production") {
    pass("allowlist", "ignored in production — every guest receives messages");
  } else if (allow) {
    pass("allowlist", `non-prod, restricted to ${allow}`);
  } else {
    fail("allowlist", "non-prod and empty — messages would reach real guests", false);
  }

  report();
}

function report() {
  const width = Math.max(...checks.map((c) => c.label.length));
  console.log("");
  for (const c of checks) {
    const mark = c.ok ? "✓" : c.fatal ? "✗" : "!";
    console.log(`  ${mark} ${c.label.padEnd(width)}  ${c.detail}`);
  }
  const fatal = checks.filter((c) => !c.ok && c.fatal);
  const warn = checks.filter((c) => !c.ok && !c.fatal);
  console.log("");
  if (fatal.length) {
    console.log(`✗ ${fatal.length} blocking problem(s), ${warn.length} warning(s).`);
    process.exit(1);
  }
  console.log(`✓ All blocking checks passed${warn.length ? `, ${warn.length} warning(s)` : ""}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
