/**
 * Who is signing in, and what happens once they have (PRD-campaign-audiences
 * slice 03, redesigned 2026-11-01). Pure, so the Sign in page, the footer, the
 * three ways a sign-in finishes and the tests share one set of rules.
 *
 * Sign in has two tabs, kept apart:
 *  - **Customer**, the default: sign in or create an account in one step, with
 *    Google, an emailed link or its 6-digit code. There is no separate sign-up
 *    and no password. The first sign-in makes their Customer, so the CRM and
 *    every campaign see them at once. A box, ticked by default (owner decision
 *    1), records `sign_in` consent; the footer's "Get our emails" records
 *    `newsletter`. Neither is recorded before the address is proven.
 *  - **Staff**: the Admin Panel. It never makes a Customer and never records
 *    consent; an email that is not on the team is signed out again.
 * The **Partner Hub** keeps its own sign-in (a destination under `/partner`),
 * with no box and no Customer made at sign-in, as before.
 *
 * The intent rides in the sign-in link's return address
 * (`/auth/callback?next=…&as=…&consent=…&lang=…`), so it survives the email,
 * a second device and Google, and is read back by `readSignInIntent`.
 */

import { safeNextPath } from "@/lib/auth/post-auth-redirect";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, stripLocale, withLocale } from "@/lib/i18n/routing";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export const SIGN_IN_AUDIENCES = ["customer", "staff", "partner"] as const;
export type SignInAudience = (typeof SIGN_IN_AUDIENCES)[number];

/** The two tabs. The Partner Hub has none. */
export type SignInTab = Exclude<SignInAudience, "partner">;

/** The consent a customer sign-in may carry: the Sign in box, or the footer sign-up. */
export const SIGN_UP_CONSENTS = ["sign_in", "newsletter"] as const;
export type SignUpConsent = (typeof SIGN_UP_CONSENTS)[number];

export interface SignInIntent {
  audience: SignInAudience;
  /** Where to go once signed in: a same-site path. */
  next: string;
  /** Customer only: what they asked for, or null for nothing. */
  consent: SignUpConsent | null;
  /** The site language they signed in on: a new Customer's `locale`, and the language of the pages after. */
  locale: Locale;
}

const isAudience = (v: unknown): v is SignInAudience =>
  typeof v === "string" && (SIGN_IN_AUDIENCES as readonly string[]).includes(v);
const isConsent = (v: unknown): v is SignUpConsent =>
  typeof v === "string" && (SIGN_UP_CONSENTS as readonly string[]).includes(v);

/** Whether `path` (with or without a locale, query or hash) is `base` or under it. */
export function isUnder(path: string, base: string): boolean {
  const bare = stripLocale(path.split(/[?#]/)[0] ?? path);
  return bare === base || bare.startsWith(`${base}/`);
}

/** Who a destination is for, when nothing else says: the Admin Panel is Staff's, the Partner Hub partners'. */
export function audienceForPath(next: string | null | undefined): SignInAudience {
  if (!next) return "customer";
  if (isUnder(next, "/settings")) return "staff";
  if (isUnder(next, "/partner")) return "partner";
  return "customer";
}

/** The tab Sign in opens on: `?as=` when given, else Staff for an Admin Panel destination, else Customer. */
export function signInTabFor({ as, next }: { as?: string | null; next?: string | null }): SignInTab {
  if (as === "staff" || as === "customer") return as;
  return audienceForPath(next) === "staff" ? "staff" : "customer";
}

/** The home each audience lands on when `next` does not suit it. */
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

/**
 * The intent a sign-in link, the code step or Google brought back. Anything
 * missing or unknown falls back safely: the audience from the destination,
 * no consent, a same-site destination only.
 */
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

/** The query that carries an intent: `next`, `as`, `lang`, and `consent` when there is one. */
export function intentQuery(intent: SignInIntent): string {
  const q = new URLSearchParams({ next: intent.next, as: intent.audience, lang: intent.locale });
  if (intent.audience === "customer" && intent.consent) q.set("consent", intent.consent);
  return q.toString();
}

/** The return address a sign-in link and Google come back to. */
export function signInCallbackUrl(origin: string, intent: SignInIntent): string {
  return `${origin.replace(/\/$/, "")}/auth/callback?${intentQuery(intent)}`;
}

/**
 * Where a finished sign-in goes. Staff go to `next` when it is in the Admin
 * Panel, else its home; everyone else goes to `next`, never into the Admin
 * Panel. The tab decides, not who the person is: Staff who sign in on the
 * Customer tab are a customer for that visit.
 */
export function destinationAfterSignIn(intent: SignInIntent): string {
  const inPanel = isUnder(intent.next, "/settings");
  if (intent.audience === "staff") return inPanel ? intent.next : homeFor("staff", intent.locale);
  return inPanel ? homeFor(intent.audience, intent.locale) : intent.next;
}

/** Why Sign in sent someone back: shown on the tab they came from. */
export const SIGN_IN_ERRORS = {
  not_staff: "That email isn't on the Mpillow team, so it can't open the Admin Panel. Customers sign in on the Customer tab.",
  link_expired:
    "That link has expired or was already used. Some mail filters open links before you do. Enter the 6-digit code from the same email, or ask for a new one below.",
  failed: "We couldn't sign you in. Try again, or use the 6-digit code from the email.",
} as const;
export type SignInError = keyof typeof SIGN_IN_ERRORS;

export const isSignInError = (v: unknown): v is SignInError => typeof v === "string" && v in SIGN_IN_ERRORS;

/** Sign in, on the right tab, with what went wrong and the same destination. */
export function signInErrorPath(intent: SignInIntent, error: SignInError): string {
  const tab: SignInTab = intent.audience === "staff" ? "staff" : "customer";
  const q = new URLSearchParams({ as: tab, error, next: intent.next });
  return `${withLocale("/account/login", intent.locale)}?${q.toString()}`;
}

/**
 * The consent to record for this sign-in. The ticked box is not recorded for
 * a Staff login, even on the Customer tab: a box left ticked out of habit
 * must not put the team on the list. The footer sign-up is their own request,
 * so it is.
 */
export function consentToRecord(intent: SignInIntent, isStaff: boolean): SignUpConsent | null {
  if (intent.audience !== "customer" || !intent.consent) return null;
  if (intent.consent === "sign_in" && isStaff) return null;
  return intent.consent;
}

/**
 * What the page says once they land: "subscribed" when this sign-in put them
 * on the list; after a footer sign-up, "already" when they were on it, and
 * "come_back" when they had unsubscribed, which only their own click
 * reverses (the notice offers it). The box says nothing when it changed
 * nothing.
 */
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

/** A short-lived cookie carries the notice to whatever page they land on. */
export const SIGN_UP_NOTICE_COOKIE = "mp_sign_up";
export const SIGN_UP_NOTICE_MAX_AGE = 120;

/** Supabase's email link types that `verifyOtp({ token_hash })` takes. */
const LINK_TYPES = ["email", "magiclink", "signup", "invite"] as const;
export type EmailLinkType = (typeof LINK_TYPES)[number];

export interface EmailLink {
  tokenHash: string;
  type: EmailLinkType;
  intent: SignInIntent;
}

/**
 * The scanner-safe link (`/auth/confirm`), read from its query. The templates
 * send `token_hash`, `type` and `next={{ .RedirectTo }}`, where RedirectTo is
 * the callback address the form asked for, with the intent in its query.
 * Depending on how the template engine escapes it, that query arrives nested
 * inside `next` or spread over the top level; both read the same. A
 * RedirectTo that is not on this site is ignored.
 */
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
    } catch {
      // Not a URL: no destination from it.
    }
  }
  return { tokenHash, type: type as EmailLinkType, intent: readSignInIntent(merged) };
}
