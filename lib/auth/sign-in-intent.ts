import { safeNextPath } from "@/lib/auth/post-auth-redirect";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export const SIGN_IN_AUDIENCES = ["customer", "staff", "partner"] as const;
export type SignInAudience = (typeof SIGN_IN_AUDIENCES)[number];

export type SignInTab = Exclude<SignInAudience, "partner">;

export const SIGN_UP_CONSENTS = ["sign_in", "newsletter", "explore_claim"] as const;
export type SignUpConsent = (typeof SIGN_UP_CONSENTS)[number];

export interface SignInIntent {
  audience: SignInAudience;
  next: string;
  consent: SignUpConsent | null;
  locale: Locale;
}

const isAudience = (v: unknown): v is SignInAudience =>
  typeof v === "string" && (SIGN_IN_AUDIENCES as readonly string[]).includes(v);
const isConsent = (v: unknown): v is SignUpConsent =>
  typeof v === "string" && (SIGN_UP_CONSENTS as readonly string[]).includes(v);

export function isUnder(path: string, base: string): boolean {
  const bare = stripLocale(path.split(/[?#]/)[0] ?? path);
  return bare === base || bare.startsWith(`${base}/`);
}

export function audienceForPath(next: string | null | undefined): SignInAudience {
  if (!next) return "customer";
  if (isUnder(next, "/settings")) return "staff";
  if (isUnder(next, "/partner")) return "partner";
  return "customer";
}

export function signInTabFor({ as, next }: { as?: string | null; next?: string | null }): SignInTab {
  if (as === "staff" || as === "customer") return as;
  return audienceForPath(next) === "staff" ? "staff" : "customer";
}

export function homeFor(audience: SignInAudience, locale: Locale): string {
  if (audience === "staff") return withLocale("/settings", locale);
  if (audience === "partner") return withLocale("/partner", locale);
  return withLocale("/account", locale);
}

type ParamSource = URLSearchParams | Record<string, string | string[] | null | undefined>;

function param(source: ParamSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const v = source[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" ? v : null;
}

export function readSignInIntent(source: ParamSource): SignInIntent {
  const rawNext = param(source, "next");
  const as = param(source, "as");
  const audience: SignInAudience = isAudience(as) ? as : audienceForPath(rawNext);
  const lang = param(source, "lang");
  const locale: Locale =
    lang && isSupportedLocale(lang) ? lang : (rawNext && getLocaleFromPathname(rawNext)) || DEFAULT_LOCALE;
  const next = safeNextPath(rawNext, homeFor(audience, locale));
  const consent = param(source, "consent");
  return { audience, next, locale, consent: audience === "customer" && isConsent(consent) ? consent : null };
}

export function intentQuery(intent: SignInIntent): string {
  const q = new URLSearchParams({ next: intent.next, as: intent.audience, lang: intent.locale });
  if (intent.audience === "customer" && intent.consent) q.set("consent", intent.consent);
  return q.toString();
}

export function signInCallbackUrl(origin: string, intent: SignInIntent): string {
  return `${origin.replace(/\/$/, "")}/auth/callback?${intentQuery(intent)}`;
}

export function destinationAfterSignIn(intent: SignInIntent): string {
  const inPanel = isUnder(intent.next, "/settings");
  if (intent.audience === "staff") return inPanel ? intent.next : homeFor("staff", intent.locale);
  return inPanel ? homeFor(intent.audience, intent.locale) : intent.next;
}

export const SIGN_IN_ERRORS = {
  not_staff: "That email isn't on the Mpillow team, so it can't open the Admin Panel. Customers sign in on the Customer tab.",
  link_expired:
    "That link has expired or was already used. Some mail filters open links before you do. Enter the 6-digit code from the same email, or ask for a new one below.",
  failed: "We couldn't sign you in. Try again, or use the 6-digit code from the email.",
} as const;
export type SignInError = keyof typeof SIGN_IN_ERRORS;

export const isSignInError = (v: unknown): v is SignInError => typeof v === "string" && v in SIGN_IN_ERRORS;

export function signInErrorPath(intent: SignInIntent, error: SignInError): string {
  const tab: SignInTab = intent.audience === "staff" ? "staff" : "customer";
  const q = new URLSearchParams({ as: tab, error, next: intent.next });
  return `${withLocale("/account/login", intent.locale)}?${q.toString()}`;
}

export function consentToRecord(intent: SignInIntent, isStaff: boolean): SignUpConsent | null {
  if (intent.audience !== "customer" || !intent.consent) return null;
  if (intent.consent === "sign_in" && isStaff) return null;
  return intent.consent;
}

export type SignUpNotice = "subscribed" | "already" | "come_back";
export const SIGN_UP_NOTICES: readonly SignUpNotice[] = ["subscribed", "already", "come_back"];

export function signUpNotice(input: {
  consent: SignUpConsent | null;
  before: MarketingEmailState;
  changed: boolean;
}): SignUpNotice | null {
  if (!input.consent) return null;
  if (input.changed) return "subscribed";
  if (input.consent !== "newsletter") return null;
  if (input.before === "subscribed") return "already";
  if (input.before === "unsubscribed") return "come_back";
  return null;
}

export const SIGN_UP_NOTICE_COOKIE = "mp_sign_up";
export const SIGN_UP_NOTICE_MAX_AGE = 120;

const LINK_TYPES = ["email", "magiclink", "signup", "invite"] as const;
export type EmailLinkType = (typeof LINK_TYPES)[number];

export interface EmailLink {
  tokenHash: string;
  type: EmailLinkType;
  intent: SignInIntent;
}

export function readEmailLink(top: URLSearchParams, siteOrigins: readonly string[]): EmailLink | null {
  const tokenHash = top.get("token_hash");
  const type = top.get("type") ?? "email";
  if (!tokenHash || !(LINK_TYPES as readonly string[]).includes(type)) return null;

  const merged = new URLSearchParams();
  for (const key of ["next", "as", "consent", "lang"]) {
    const v = top.get(key);
    if (v) merged.set(key, v);
  }
  const rawNext = top.get("next");
  if (rawNext && !rawNext.startsWith("/")) {
    merged.delete("next");
    try {
      const nested = new URL(rawNext);
      const origins = siteOrigins.map((o) => o.replace(/\/$/, ""));
      if (origins.includes(nested.origin)) {
        if (nested.pathname === "/auth/callback") {
          for (const key of ["next", "as", "consent", "lang"]) {
            const v = nested.searchParams.get(key);
            if (v && !merged.has(key)) merged.set(key, v);
          }
        } else if (nested.pathname !== "/") {
          merged.set("next", `${nested.pathname}${nested.search}`);
        }
      }
    } catch {}
  }
  return { tokenHash, type: type as EmailLinkType, intent: readSignInIntent(merged) };
}
