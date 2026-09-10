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

/**
 * Graph rejects the whole request when one requested field is unsupported
 * (#100), and the supported set drifts between API versions. Retry once with a
 * minimal set so a single unknown field cannot mask every other check.
 */
async function getNode(id: string, fields: string[], token: string, minimal: string[]) {
  const full = await get(`${GRAPH}/${id}?fields=${fields.join(",")}`, token);
  if (full.ok || full.json.error?.code !== 100) return full;
  return get(`${GRAPH}/${id}?fields=${minimal.join(",")}`, token);
}

/**
 * The phone-number node does not expose its owning WABA, and there is no single
 * route to it that every token type can take — so try each in turn:
 *
 *   1. WHATSAPP_WABA_ID, when ops has pinned it explicitly.
 *   2. debug_token with an app access token (needs WHATSAPP_APP_ID + _SECRET).
 *   3. debug_token with the token itself — only works when it is a user token
 *      owned by an app owner/developer, not for a system-user token.
 *   4. The business route: every WABA the token's businesses own or client.
 *
 * Whichever route wins, the answer is confirmed the same way: the owning WABA
 * is the one whose phone_numbers list contains this phone id.
 */
async function wabaOwnsNumber(waba: string, phoneId: string, token: string): Promise<boolean> {
  const nums = await get(`${GRAPH}/${waba}/phone_numbers?fields=id&limit=100`, token);
  const list = (nums.json.data as Array<{ id?: string }>) ?? [];
  return list.some((n) => n.id === phoneId);
}

async function wabaIdsFromDebugToken(token: string, appToken?: string): Promise<string[]> {
  const auth = encodeURIComponent(appToken ?? token);
  const dbg = await get(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${auth}`,
    token,
  );
  if (!dbg.ok) return [];
  const scopes =
    ((dbg.json.data as { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> })
      ?.granular_scopes) ?? [];
  const out: string[] = [];
  for (const s of scopes) {
    if (/whatsapp_business/.test(s.scope)) out.push(...(s.target_ids ?? []));
  }
  return out;
}

async function wabaIdsFromBusinesses(token: string): Promise<string[]> {
  const me = await get(`${GRAPH}/me?fields=businesses{id}`, token);
  const businesses =
    ((me.json.businesses as { data?: Array<{ id?: string }> })?.data ?? [])
      .map((b) => b.id)
      .filter((x): x is string => Boolean(x));

  const out: string[] = [];
  for (const biz of businesses) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const res = await get(`${GRAPH}/${biz}/${edge}?fields=id&limit=100`, token);
      for (const w of (res.json.data as Array<{ id?: string }>) ?? []) {
        if (w.id) out.push(w.id);
      }
    }
  }
  return out;
}

async function resolveWaba(
  phoneId: string,
  token: string,
): Promise<{ id: string | null; detail: string }> {
  const pinned = process.env.WHATSAPP_WABA_ID?.trim();
  if (pinned) {
    if (await wabaOwnsNumber(pinned, phoneId, token)) {
      return { id: pinned, detail: `${pinned} (pinned via WHATSAPP_WABA_ID)` };
    }
    return { id: null, detail: `WHATSAPP_WABA_ID ${pinned} does not own this phone number` };
  }

  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const appToken = appId && appSecret ? `${appId}|${appSecret}` : undefined;

  const tried: string[] = [];
  const candidates = new Set<string>();
  for (const [label, ids] of [
    ["debug_token(app)", appToken ? await wabaIdsFromDebugToken(token, appToken) : []],
    ["debug_token", await wabaIdsFromDebugToken(token)],
    ["businesses", await wabaIdsFromBusinesses(token)],
  ] as [string, string[]][]) {
    tried.push(`${label}:${ids.length}`);
    for (const id of ids) candidates.add(id);
    for (const waba of ids) {
      if (await wabaOwnsNumber(waba, phoneId, token)) return { id: waba, detail: waba };
    }
  }

  if (candidates.size === 0) {
    return {
      id: null,
      detail:
        `no WABA reachable from this token (${tried.join(", ")}). ` +
        "Run scripts/whatsapp-discover.ts, then set WHATSAPP_WABA_ID, " +
        "or set WHATSAPP_APP_ID so debug_token can use an app access token",
    };
  }
  return {
    id: null,
    detail: `reachable WABAs (${[...candidates].join(", ")}) do not own this phone number`,
  };
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
    const v = process.env[key]?.trim();
    if (!v) {
      fail(`env ${key}`, "missing — sends throw and the webhook rejects");
      continue;
    }
    // Echo the tail of the ids. An edit that silently did not land (unsaved
    // file, or a duplicate key later in .env.local winning) otherwise looks
    // identical to a correct run, which costs a diagnostic round trip.
    const ident = key.endsWith("_ID") || key === "WHATSAPP_TOKEN";
    pass(`env ${key}`, ident ? `set (…${v.slice(-4)})` : "set");
  }

  const pinnedWaba = process.env.WHATSAPP_WABA_ID?.trim();
  pass(
    "env WHATSAPP_WABA_ID",
    pinnedWaba ? `set (…${pinnedWaba.slice(-4)})` : "unset — will be discovered from the token",
  );

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
  const num = await getNode(
    phoneId,
    [
      "display_phone_number",
      "verified_name",
      "quality_rating",
      "platform_type",
      "code_verification_status",
    ],
    token,
    ["display_phone_number", "verified_name"],
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

  // Meta auto-provisions a sandbox number (+1 555-…, the reserved test prefix)
  // with every new app. It reads healthy everywhere else — verified name, a
  // quality rating, CLOUD_API, and a normal messaging-limit tier — while
  // delivery stays restricted to a short list of verified test recipients. The
  // tier and that restriction are separate axes, so a healthy-looking limit is
  // no evidence the number can reach guests. Confirm in API Setup, where the
  // recipient list is capped and the number is labelled a test number.
  if (/^\+?1\s*555/.test(sender)) {
    fail(
      "test number",
      `${sender} is on Meta's +1 555 sandbox prefix — not a production sender; confirm the recipient list in API Setup`,
    );
  } else {
    pass("test number", "not a +1 555 sandbox number");
  }

  const platform = String(num.json.platform_type ?? "");
  if (platform && platform.toUpperCase() !== "CLOUD_API") {
    fail(
      "cloud api registration",
      `platform_type is ${platform} — run scripts/whatsapp-register.ts (else error #133010)`,
    );
  } else {
    pass("cloud api registration", platform || "assumed (field not returned)");
  }

  const resolved = await resolveWaba(phoneId, token);
  if (!resolved.id) {
    fail("waba", resolved.detail);
    report();
    return;
  }
  const waba = resolved.id;
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
