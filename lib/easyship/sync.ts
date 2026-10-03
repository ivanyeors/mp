import { getSiteOrigin } from "@/lib/site-url";
import { easyship, easyshipList } from "./client";
import {
  WEBHOOK_PATH,
  type EasyshipSettings,
  type EasyshipAddress,
  type LiveAddress,
  type LiveBox,
  type LiveRule,
  type LiveWebhook,
  type RuleClause,
} from "./schema";
import type { SyncReport, SyncStep } from "./sync-report";

type SyncOutcome = {
  report: SyncReport;
  webhook_secret_token: string | null;
  easyship_company_id: string | null;
};

/** Easyship can only post to a public https origin; dev and previews skip the webhook step. */
export function webhookEndpoint(): string | null {
  const origin = getSiteOrigin();
  if (!/^https:\/\//.test(origin) || /localhost|127\.0\.0\.1|\.vercel\.app$/.test(origin)) return null;
  return `${origin}${WEBHOOK_PATH}`;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function sameAddress(a: EasyshipAddress, b: LiveAddress): boolean {
  return (
    norm(a.line_1) === norm(b.line_1) &&
    norm(a.postal_code) === norm(b.postal_code) &&
    norm(a.country_alpha2) === norm(b.country_alpha2) &&
    norm(a.company_name) === norm(b.company_name)
  );
}

function addressFields(a: EasyshipAddress): Omit<EasyshipAddress, "default_for"> {
  const fields: Partial<EasyshipAddress> = { ...a };
  delete fields.default_for;
  return fields as Omit<EasyshipAddress, "default_for">;
}

function addressDiffers(a: EasyshipAddress, b: LiveAddress): boolean {
  const f = addressFields(a);
  return (Object.keys(f) as (keyof typeof f)[]).some((k) => norm(f[k] as string | null) !== norm(b[k] as string | null));
}

/** PATCH only accepts `true` flags; omitted flags are left as they are. */
function trueFlags(df: EasyshipAddress["default_for"]): Record<string, true> {
  return Object.fromEntries(Object.entries(df).filter(([, v]) => v).map(([k]) => [k, true as const]));
}

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

function clausesEqual(a: RuleClause[], b: Array<RuleClause & { id?: string }>): boolean {
  const strip = (xs: Array<RuleClause & { id?: string }>) =>
    xs.map(({ type, options }) => ({ type, options })).sort((x, y) => stableJson(x).localeCompare(stableJson(y)));
  return stableJson(strip(a)) === stableJson(strip(b));
}

function trackingBody<T extends { advertising: unknown; allowed_statuses?: string[] }>(t: T) {
  const { advertising, allowed_statuses, ...rest } = t;
  return {
    ...rest,
    ...(advertising ? { advertising } : {}),
    // ponytail: an empty list is omitted (left unchanged); clear statuses in the dashboard
    ...(allowed_statuses && allowed_statuses.length ? { allowed_statuses } : {}),
  };
}

export async function syncEasyship(desired: EasyshipSettings, endpoint: string | null): Promise<SyncOutcome> {
  const started_at = new Date().toISOString();
  const steps: SyncStep[] = [];
  const step = (s: SyncStep) => steps.push(s);
  const fail = (area: string, target: string, e: unknown) =>
    step({ area, action: "error", target, detail: e instanceof Error ? e.message : String(e) });

  let easyship_company_id: string | null = null;
  let webhook_secret_token: string | null = null;

  try {
    const { account } = await easyship<{ account: { easyship_company_id: string } }>("/account");
    easyship_company_id = account.easyship_company_id;
  } catch (e) {
    fail("account", "account", e);
  }

  try {
    await easyship("/account/settings", {
      method: "POST",
      body: { tracking_email: trackingBody(desired.tracking_email), tracking_page: trackingBody(desired.tracking_page) },
    });
    step({ area: "tracking", action: "updated", target: "tracking email + page" });
  } catch (e) {
    fail("tracking", "account/settings", e);
  }

  try {
    const live = await easyshipList<LiveAddress>("/addresses", "addresses");
    for (const a of desired.addresses) {
      const target = `${a.company_name} · ${a.line_1}`;
      const match = live.find((l) => sameAddress(a, l));
      const flags = trueFlags(a.default_for);
      if (!match) {
        await easyship("/addresses", { method: "POST", body: { ...addressFields(a), default_for: a.default_for } });
        step({ area: "addresses", action: "created", target });
        continue;
      }
      const flagsMissing = (Object.keys(flags) as (keyof EasyshipAddress["default_for"])[]).some((k) => !match.default_for?.[k]);
      if (!addressDiffers(a, match) && !flagsMissing && match.status === "active") {
        step({ area: "addresses", action: "unchanged", target });
        continue;
      }
      if (match.status !== "active") await easyship(`/addresses/${match.id}/activate`, { method: "POST" });
      await easyship(`/addresses/${match.id}`, {
        method: "PATCH",
        body: { ...addressFields(a), ...(Object.keys(flags).length ? { default_for: flags } : {}) },
      });
      step({ area: "addresses", action: "updated", target });
    }
  } catch (e) {
    fail("addresses", "addresses", e);
  }

  try {
    const live = (await easyshipList<LiveBox>("/boxes", "boxes")).filter((b) => b.type === "box");
    const seen = new Set<string>();
    for (const b of desired.boxes) {
      const match = live.find((l) => norm(l.name) === norm(b.name));
      const body = { name: b.name, outer_length: b.outer_length, outer_width: b.outer_width, outer_height: b.outer_height, weight: b.weight };
      if (!match) {
        await easyship("/boxes", { method: "POST", body });
        step({ area: "boxes", action: "created", target: b.name });
        continue;
      }
      seen.add(match.id);
      const d = match.outer_dimensions;
      const same = d.length === b.outer_length && d.width === b.outer_width && d.height === b.outer_height && (match.weight ?? 0) === b.weight;
      if (same) {
        step({ area: "boxes", action: "unchanged", target: b.name });
        continue;
      }
      await easyship(`/boxes/${match.id}`, { method: "PATCH", body });
      step({ area: "boxes", action: "updated", target: b.name });
    }
    for (const l of live) {
      if (seen.has(l.id) || desired.boxes.some((b) => norm(b.name) === norm(l.name))) continue;
      try {
        await easyship(`/boxes/${l.id}`, { method: "DELETE" });
        step({ area: "boxes", action: "deleted", target: l.name });
      } catch (e) {
        fail("boxes", l.name, e);
      }
    }
  } catch (e) {
    fail("boxes", "boxes", e);
  }

  try {
    const live = await easyshipList<LiveRule>("/shipping_rules", "shipping_rules");
    const keep = new Set<string>();
    for (const r of desired.shipping_rules) {
      let match = live.find((l) => norm(l.name) === norm(r.name)) ?? null;
      const body = { name: r.name, description: r.description, priority: r.priority, conditions: r.conditions, actions: r.actions };
      if (match && !(clausesEqual(r.conditions, match.conditions) && clausesEqual(r.actions, match.actions))) {
        // ponytail: clauses changed → recreate; per-clause PATCH/DELETE reconciliation if rule ids ever matter
        await easyship(`/shipping_rules/${match.id}`, { method: "DELETE" });
        match = null;
        step({ area: "shipping_rules", action: "deleted", target: r.name, detail: "recreated with new conditions/actions" });
      }
      if (!match) {
        const created = await easyship<{ shipping_rule: LiveRule }>("/shipping_rules", { method: "POST", body });
        match = created.shipping_rule;
        step({ area: "shipping_rules", action: "created", target: r.name });
      } else if ((match.description ?? "") !== r.description || match.priority !== r.priority) {
        await easyship(`/shipping_rules/${match.id}`, { method: "PATCH", body: { description: r.description, priority: r.priority } });
        step({ area: "shipping_rules", action: "updated", target: r.name });
      } else {
        step({ area: "shipping_rules", action: "unchanged", target: r.name });
      }
      keep.add(match.id);
      if (match.active !== r.active) {
        await easyship(`/shipping_rules/${match.id}/${r.active ? "activate" : "deactivate"}`, { method: "POST" });
        step({ area: "shipping_rules", action: r.active ? "activated" : "deactivated", target: r.name });
      }
    }
    for (const l of live) {
      if (keep.has(l.id) || desired.shipping_rules.some((r) => norm(r.name) === norm(l.name))) continue;
      await easyship(`/shipping_rules/${l.id}`, { method: "DELETE" });
      step({ area: "shipping_rules", action: "deleted", target: l.name });
    }
  } catch (e) {
    fail("shipping_rules", "shipping_rules", e);
  }

  try {
    if (!endpoint) {
      step({ area: "webhook", action: "skipped", target: "webhook", detail: "site origin is not public https" });
    } else {
      const live = await easyshipList<LiveWebhook>("/webhooks", "webhooks");
      let match = live.find((w) => w.endpoint === endpoint) ?? null;
      const body = { endpoint: endpoint, version: "2024-09", event_types: desired.webhook.event_types };
      if (desired.webhook.enabled) {
        if (!match) {
          match = (await easyship<{ webhook: LiveWebhook }>("/webhooks", { method: "POST", body })).webhook;
          step({ area: "webhook", action: "created", target: endpoint });
        } else if (stableJson([...match.event_types].sort()) !== stableJson([...body.event_types].sort()) || match.version !== "2024-09") {
          match = (await easyship<{ webhook: LiveWebhook }>(`/webhooks/${match.id}`, { method: "PATCH", body })).webhook;
          step({ area: "webhook", action: "updated", target: endpoint });
        } else {
          step({ area: "webhook", action: "unchanged", target: endpoint });
        }
        if (match.state !== "active") {
          await easyship(`/webhooks/${match.id}/activate`, { method: "POST" });
          step({ area: "webhook", action: "activated", target: endpoint });
        }
        webhook_secret_token = match.secret_token ?? null;
      } else if (match) {
        if (match.state === "active") {
          await easyship(`/webhooks/${match.id}/deactivate`, { method: "POST" });
          step({ area: "webhook", action: "deactivated", target: endpoint });
        } else {
          step({ area: "webhook", action: "unchanged", target: endpoint, detail: "inactive" });
        }
        webhook_secret_token = match.secret_token ?? null;
      } else {
        step({ area: "webhook", action: "unchanged", target: endpoint, detail: "not registered" });
      }
      for (const w of live) {
        if (w.endpoint !== endpoint) {
          step({ area: "webhook", action: "skipped", target: w.endpoint, detail: `foreign webhook (${w.state}) left alone` });
        }
      }
    }
  } catch (e) {
    fail("webhook", endpoint ?? "webhook", e);
  }

  return {
    report: {
      ok: steps.every((s) => s.action !== "error"),
      started_at,
      finished_at: new Date().toISOString(),
      steps,
    },
    webhook_secret_token,
    easyship_company_id,
  };
}

/** Read-only snapshot of everything the settings page mirrors. */
export async function readLiveSnapshot() {
  const [account, setting, addresses, boxes, shipping_rules, webhooks] = await Promise.all([
    easyship<{ account: { name: string; easyship_company_id: string } }>("/account").then((r) => r.account).catch(() => null),
    easyship<{ setting: { tracking_email: unknown; tracking_page: unknown } }>("/account/settings").then((r) => r.setting).catch(() => null),
    easyshipList<LiveAddress>("/addresses", "addresses"),
    easyshipList<LiveBox>("/boxes", "boxes"),
    easyshipList<LiveRule>("/shipping_rules", "shipping_rules"),
    easyshipList<LiveWebhook>("/webhooks", "webhooks").then((ws) => ws.map((w) => ({ ...w, secret_token: null }))),
  ]);
  return { account, setting, addresses, boxes, shipping_rules, webhooks };
}
