/**
 * One-shot config check for the appointment WhatsApp integration. Verifies in a
 * single pass everything that has to line up before reminders can send, and
 * exits non-zero if any of it does not — so it doubles as a smoke test after a
 * number move or a token rotation.
 *
 *   npx tsx --env-file=.env.local scripts/whatsapp-preflight.ts
 *
 * It reads config only and never sends a WhatsApp message (the one write is
 * the empty webhook probe below). Use scripts/whatsapp-test.ts for a send.
 *
 * `scripts/**` is excluded from tsconfig.ci.json, so `pnpm typecheck` does NOT
 * cover this file. Check it explicitly after editing:
 *
 *   npx tsc --noEmit --strict --target es2022 --module esnext \
 *     --moduleResolution bundler --lib es2022,dom --types node \
 *     --skipLibCheck scripts/whatsapp-preflight.ts
 *
 * Checks: required env, that the phone-number ID resolves to the number you
 * expect and is registered for Cloud API, that every template the code names is
 * APPROVED in the language that code sends it as and takes the number of body
 * params the code passes, that the day-before template has the Confirm /
 * Reschedule quick replies, that guest replies can reach the site (app
 * subscribed to the WABA, its webhook pointed here for `messages`, the app
 * secret matching what Meta signs with, and the live endpoint accepting a POST
 * signed with it), and that the public sales number is not the automated sender.
 *
 * The webhook probe POSTs an empty, signed payload to the live endpoint: it
 * carries no message, so nothing is sent or changed.
 */
import { createHmac } from "node:crypto";

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

/** Labels of the template's QUICK_REPLY buttons, lower-cased. */
function quickReplies(components: unknown): string[] {
  const list = Array.isArray(components) ? components : [];
  const out: string[] = [];
  for (const c of list) {
    const comp = c as { type?: string; buttons?: Array<{ type?: string; text?: string }> };
    if (comp.type?.toUpperCase() !== "BUTTONS") continue;
    for (const b of comp.buttons ?? []) {
      if (b.type?.toUpperCase() === "QUICK_REPLY" && b.text) out.push(b.text.toLowerCase());
    }
  }
  return out;
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

  // Meta's auto-provisioned test number (display name "Test Number") delivers
  // only to the short recipient list in API Setup, and sends to anyone else fail
  // with #131030. The +1 555 prefix alone settles nothing: a number on it can
  // carry the business's own verified name, a quality rating and a normal tier.
  // So the test name is the blocker, the prefix only warns, and the proof is a
  // send to a phone that is not on that list.
  const testName = /^test number$/i.test(String(num.json.verified_name ?? "").trim());
  if (testName) {
    fail(
      "test number",
      `${sender} is Meta's test number — it only reaches API Setup's recipient list (#131030 otherwise)`,
    );
  } else if (/^\+?1\s*555/.test(sender)) {
    fail(
      "test number",
      `${sender} is on the +1 555 prefix — prove it reaches guests with a send to a phone NOT on API Setup's recipient list`,
      false,
    );
  } else {
    pass("test number", "not a +1 555 number");
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
  // customers at the sender starts conversations nobody reads — the webhook only
  // auto-replies with the sales line.
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
  // `buttons` are words a QUICK_REPLY label must contain for the webhook to act
  // on the tap (parseInboundActions matches by substring).
  const wanted: {
    env: string;
    fallback: string;
    lang: string;
    params: number;
    note: string;
    buttons?: string[];
  }[] = [
    {
      env: "WHATSAPP_TEMPLATE_DAY_BEFORE",
      fallback: "appointment_day_before_v2",
      lang: "en",
      params: 4,
      note: "day-before reminder",
      buttons: ["confirm", "reschedule"],
    },
    { env: "WHATSAPP_TEMPLATE_MORNING_OF", fallback: "appointment_morning_of", lang: "en", params: 4, note: "morning-of nudge" },
  ];
  // lib/appointments/whatsapp.ts sends the first cancel template's 2-param
  // shape only under its exact name; anything else gets v2's five.
  const cancelName = process.env.WHATSAPP_TEMPLATE_CANCEL?.trim() || "appointment_cancelled_v2";
  if (cancelName === "appointment_cancelled") {
    wanted.push({ env: "WHATSAPP_TEMPLATE_CANCEL", fallback: cancelName, lang: "en", params: 2, note: "cancel + rebook link" });
    fail(
      "cancel template",
      "appointment_cancelled cannot name the staffed line — create appointment_cancelled_v2 and switch WHATSAPP_TEMPLATE_CANCEL",
      false,
    );
  } else {
    wanted.push({ env: "WHATSAPP_TEMPLATE_CANCEL", fallback: cancelName, lang: "en", params: 5, note: "cancel + rebook link + staffed line" });
  }
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
      const replies = quickReplies(exact.components);
      const missing = (w.buttons ?? []).filter((b) => !replies.some((r) => r.includes(b)));
      if (missing.length) {
        fail(
          `template ${name}`,
          `no ${missing.join(" / ")} button — guests cannot tap to reply; create appointment_day_before_v2 (scripts/whatsapp-create-templates.ts)`,
        );
        continue;
      }
      const btn = w.buttons?.length ? ` · buttons ${replies.join(" / ")}` : "";
      pass(`template ${name}`, `APPROVED [${w.lang}] · ${w.params} params${btn} · ${w.note}`);
    }
  }

  // --- 5. Webhook ----------------------------------------------------------
  // A guest's tap or reply reaches the site only if every link holds: the WABA
  // has our app subscribed, that app's webhook points at this site for the
  // `messages` field, and Meta signs with the secret the site checks. Break any
  // one and every Confirm, Reschedule and reply vanishes with no error anywhere
  // — the guest simply hears nothing back.
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  const appLookup = await get(`${GRAPH}/app?fields=id,name`, token);
  const appId =
    process.env.WHATSAPP_APP_ID?.trim() || (appLookup.json.id as string | undefined);
  const appLabel = appId
    ? `${(appLookup.json.name as string | undefined) ?? "app"} (${appId})`
    : "the token's app";
  if (appId) pass("token app", appLabel);
  else fail("token app", `could not tell which app the token belongs to — set WHATSAPP_APP_ID`, false);

  const subs = await get(`${GRAPH}/${waba}/subscribed_apps`, token);
  const apps =
    (subs.json.data as Array<{ whatsapp_business_api_data?: { id?: string; name?: string } }>) ?? [];
  if (!subs.ok) {
    fail("webhook subscription", `could not read (${subs.status}): ${subs.json.error?.message ?? "?"}`, false);
  } else if (apps.length === 0) {
    fail("webhook subscription", `no app subscribed — run: curl -X POST -H "Authorization: Bearer $WHATSAPP_TOKEN" ${GRAPH}/${waba}/subscribed_apps`);
  } else if (appId && !apps.some((a) => a.whatsapp_business_api_data?.id === appId)) {
    fail(
      "webhook subscription",
      `${appLabel} is not subscribed to WABA ${waba} (subscribed: ${apps.map((a) => a.whatsapp_business_api_data?.name ?? "?").join(", ")}) — its webhook never hears this number`,
    );
  } else {
    pass(
      "webhook subscription",
      apps.map((a) => a.whatsapp_business_api_data?.name ?? "app").join(", "),
    );
  }

  let callback: string | undefined;
  if (secret) {
    // Graph checks appsecret_proof against the token's own app, so this says
    // whether the secret here is that app's — the one Meta signs webhooks with.
    const proof = createHmac("sha256", secret).update(token).digest("hex");
    const me = await get(`${GRAPH}/me?fields=id&appsecret_proof=${proof}`, token);
    if (me.ok) {
      pass("app secret", `WHATSAPP_APP_SECRET is ${appLabel}'s secret`);
    } else if (/appsecret_proof/i.test(me.json.error?.message ?? "")) {
      fail(
        "app secret",
        `WHATSAPP_APP_SECRET is not ${appLabel}'s secret — Meta signs every webhook POST with the real one, so the site rejects every guest reply (401). Copy it from App Dashboard → App settings → Basic`,
      );
    } else {
      fail("app secret", `could not verify (${me.status}): ${me.json.error?.message ?? "?"}`, false);
    }

    if (appId) {
      const res = await fetch(
        `${GRAPH}/${appId}/subscriptions?access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
      );
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<{ object?: string; callback_url?: string; active?: boolean; fields?: Array<{ name?: string } | string> }>;
        error?: { message?: string };
      };
      const wa = json.data?.find((o) => o.object === "whatsapp_business_account");
      const fields = (wa?.fields ?? []).map((f) => (typeof f === "string" ? f : f.name ?? ""));
      if (!res.ok) {
        fail("webhook callback", `could not read (${res.status}): ${json.error?.message ?? "?"}`, false);
      } else if (!wa) {
        fail("webhook callback", `${appLabel} has no WhatsApp webhook — App Dashboard → WhatsApp → Configuration`);
      } else if (!wa.active) {
        fail("webhook callback", `${wa.callback_url} is set but inactive`);
      } else if (!fields.includes("messages")) {
        fail(
          "webhook callback",
          `${wa.callback_url} is not subscribed to the "messages" field — taps and replies never arrive (subscribed: ${fields.join(", ") || "none"})`,
        );
      } else if (!/\/api\/webhooks\/whatsapp\/?$/.test(wa.callback_url ?? "")) {
        fail("webhook callback", `${wa.callback_url} is not this site's /api/webhooks/whatsapp`);
      } else {
        callback = wa.callback_url;
        pass("webhook callback", `${callback} · messages`);
      }
    }
  }

  // The live endpoint must accept a POST signed with this secret. Vercel's copy
  // of WHATSAPP_APP_SECRET is not this file's: a 401 here means the deployed one
  // differs, and Meta's POSTs fail the same way. The payload has no messages, so
  // the site does nothing with it.
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://custom.mpillow.com").replace(/\/$/, "");
  const endpoint = callback ?? `${site}/api/webhooks/whatsapp`;
  if (secret) {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    try {
      // Meta does not follow redirects, so neither does the probe: a callback on
      // a host that redirects (work.mpillow.com → custom.) loses every message.
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
        body,
        redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        fail(
          "webhook endpoint",
          `${endpoint} redirects (${res.status}) to ${res.headers.get("location") ?? "?"} — Meta does not follow redirects, so no message arrives. Set the callback to the final URL`,
        );
      } else if (res.ok) {
        pass("webhook endpoint", `${endpoint} accepts a POST signed with this secret`);
      } else if (res.status === 401) {
        fail(
          "webhook endpoint",
          `${endpoint} rejected a POST signed with this WHATSAPP_APP_SECRET — the deployed value differs (Vercel env → redeploy)`,
        );
      } else {
        fail("webhook endpoint", `${endpoint} answered ${res.status}`);
      }
    } catch (e) {
      fail("webhook endpoint", `${endpoint} unreachable: ${e instanceof Error ? e.message : e}`);
    }
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
