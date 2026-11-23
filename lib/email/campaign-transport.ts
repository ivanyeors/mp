import { ResendTransport } from "./transport";
import type { EmailTransport, SendingDomain } from "./types";

type Env = Partial<Record<string, string | undefined>>;

const RESEND_TEST_DOMAIN = "resend.dev";

export function getCampaignTransport(env: Env = process.env): EmailTransport | null {
  const key = env.CAMPAIGN_RESEND_API_KEY?.trim();
  return key ? new ResendTransport(key) : null;
}

export interface CampaignSendLimits {
  daily: number;
  monthly: number;
}

export const RESEND_FREE_SEND_LIMITS: CampaignSendLimits = { daily: 100, monthly: 3000 };

export function campaignSendLimits(env: Env = process.env): CampaignSendLimits {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number of emails, not ${raw}`);
    return n;
  };
  return {
    daily: read("CAMPAIGN_DAILY_SEND_LIMIT", RESEND_FREE_SEND_LIMITS.daily),
    monthly: read("CAMPAIGN_MONTHLY_SEND_LIMIT", RESEND_FREE_SEND_LIMITS.monthly),
  };
}

export function emailAddressOf(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  const inner = /<([^<>]+)>\s*$/.exec(raw)?.[1] ?? raw;
  const address = inner.trim().toLowerCase();
  return /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address) ? address : null;
}

export function emailDomainOf(value: string | null | undefined): string | null {
  const address = emailAddressOf(value);
  return address ? address.slice(address.indexOf("@") + 1) : null;
}

export function transactionalFromAddress(env: Env = process.env): string | null {
  return env.EMAIL_FROM?.trim() || env.GMAIL_SENDER?.trim() || null;
}

export type CampaignFromCheck =
  | { ok: true; from: string; domain: string }
  | { ok: false; reason: string };

export function checkCampaignFrom({
  from,
  domain,
  orderFrom,
}: {
  from: string | null | undefined;
  domain: string | null | undefined;
  orderFrom: string | null | undefined;
}): CampaignFromCheck {
  const subdomain = domain?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  if (!subdomain) return { ok: false, reason: "CAMPAIGN_EMAIL_DOMAIN (the sending subdomain, owner decision 4) is not set" };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/.test(subdomain)) {
    return { ok: false, reason: `CAMPAIGN_EMAIL_DOMAIN ${subdomain} is not a subdomain, such as hello.mpillow.com` };
  }
  if (subdomain === RESEND_TEST_DOMAIN || subdomain.endsWith(`.${RESEND_TEST_DOMAIN}`)) {
    return { ok: false, reason: "CAMPAIGN_EMAIL_DOMAIN is Resend's test domain, not the campaign's own" };
  }

  if (!from?.trim()) return { ok: false, reason: "CAMPAIGN_EMAIL_FROM is not set" };
  const fromDomain = emailDomainOf(from);
  if (!fromDomain) return { ok: false, reason: `CAMPAIGN_EMAIL_FROM is not an email address: ${from}` };
  if (fromDomain !== subdomain) {
    return { ok: false, reason: `CAMPAIGN_EMAIL_FROM is on ${fromDomain}, not the campaign subdomain ${subdomain}` };
  }

  const orderDomain = emailDomainOf(orderFrom);
  if (orderDomain && orderDomain === subdomain) {
    return { ok: false, reason: `${subdomain} is the domain order email is sent from; campaign mail needs its own` };
  }
  return { ok: true, from: from.trim(), domain: subdomain };
}

const UNVERIFIED_DOMAIN_STATUSES = new Set(["not_started", "pending", "failed"]);
const DOMAINS_NAMED = 5;

const domainWords = (d: SendingDomain) => `${d.name} (${d.status.replace(/_/g, " ")})`;

export async function checkCampaignDomain(
  transport: Pick<EmailTransport, "sendingDomains"> | null,
  domain: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!transport?.sendingDomains) {
    return { ok: true, detail: `not checked: this email account cannot say whether ${domain} is verified` };
  }
  let domains: SendingDomain[];
  try {
    domains = await transport.sendingDomains();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      ok: true,
      detail: /restricted_api_key/.test(reason)
        ? `not checked: the Resend key can only send, so Resend will not say whether ${domain} is verified. A test send shows it.`
        : `not checked: Resend did not say whether ${domain} is verified (${reason}). A test send shows it.`,
    };
  }
  const found = domains.find((d) => d.name === domain);
  if (!found) {
    const has = domains.length
      ? `It has ${domains.slice(0, DOMAINS_NAMED).map(domainWords).join(", ")}${domains.length > DOMAINS_NAMED ? " and more" : ""}`
      : "It has no domains yet";
    return {
      ok: false,
      detail: `Resend has no domain ${domain}, so it refuses mail sent from it. ${has}. Set CAMPAIGN_EMAIL_FROM and CAMPAIGN_EMAIL_DOMAIN in Vercel to a verified domain and redeploy, or add ${domain} in Resend → Domains.`,
    };
  }
  if (found.status === "verified") return { ok: true, detail: `Resend has verified ${domain}` };
  if (UNVERIFIED_DOMAIN_STATUSES.has(found.status)) {
    return {
      ok: false,
      detail: `${domain} is in Resend but not verified (${found.status.replace(/_/g, " ")}), so Resend refuses mail sent from it. Add the DNS records Resend → Domains lists for it, then press Verify there.`,
    };
  }
  return { ok: true, detail: `Resend reports ${domain} as ${found.status.replace(/_/g, " ")}: look at Resend → Domains if a test does not arrive` };
}
