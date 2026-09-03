import { getGoogleAccessToken } from "./google-auth";
import { normalizePhone } from "./phone";

const PEOPLE_BASE = "https://people.googleapis.com/v1";

/**
 * Google Contacts (People API) sync for appointment guests.
 *
 * Runs as admin@mpillow.com (same OAuth grant as Calendar, see google-auth.ts) so
 * the WhatsApp Business phone that syncs that account's contacts shows guest names.
 *
 * Flow for every guest: search existing contacts by phone (then email) → if none,
 * create; if found but name / phone / email differ, update; if identical, skip.
 * All callers treat this as best-effort — a People API failure never blocks a
 * booking or a reminder.
 */

export type GuestContact = {
  name: string;
  /** E.164, e.g. +6587805311 */
  phone: string;
  email?: string | null;
};

export type ContactSyncResult = "created" | "updated" | "skipped";

export type PeoplePerson = {
  resourceName?: string;
  etag?: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
    unstructuredName?: string;
  }>;
  phoneNumbers?: Array<{ value?: string; canonicalForm?: string; type?: string }>;
  emailAddresses?: Array<{ value?: string; type?: string }>;
};

const PERSON_FIELDS = "names,phoneNumbers,emailAddresses";

export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

function normName(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Loose phone equality: same digits, or one is a national suffix of the other (8780 5311 vs +65 8780 5311). */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = phoneDigits(a);
  const y = phoneDigits(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length < y.length ? x : y;
  const longer = x.length < y.length ? y : x;
  return shorter.length >= 8 && longer.endsWith(shorter);
}

function personHasPhone(person: PeoplePerson, phone: string): boolean {
  return (person.phoneNumbers ?? []).some(
    (p) => phonesMatch(p.canonicalForm, phone) || phonesMatch(p.value, phone),
  );
}

function personHasEmail(person: PeoplePerson, email: string | null | undefined): boolean {
  const want = normEmail(email);
  if (!want) return false;
  return (person.emailAddresses ?? []).some((e) => normEmail(e.value) === want);
}

function personDisplayName(person: PeoplePerson): string {
  const n = person.names?.[0];
  return (
    n?.displayName?.trim() ||
    n?.unstructuredName?.trim() ||
    [n?.givenName, n?.familyName].filter(Boolean).join(" ").trim()
  );
}

/**
 * Pick the existing contact for a guest from People search results.
 * Phone is the primary key (WhatsApp is keyed by number); email is the fallback
 * for contacts saved without a number.
 */
export function findMatchingPerson(
  candidates: PeoplePerson[],
  guest: GuestContact,
): PeoplePerson | null {
  const byPhone = candidates.find((p) => p.resourceName && personHasPhone(p, guest.phone));
  if (byPhone) return byPhone;
  if (guest.email) {
    const byEmail = candidates.find(
      (p) => p.resourceName && personHasEmail(p, guest.email),
    );
    if (byEmail) return byEmail;
  }
  return null;
}

export type ContactDiff = {
  /** True when the stored contact already carries this name, phone and email. */
  same: boolean;
  /** Which People fields need updating (subset of names,phoneNumbers,emailAddresses). */
  updateFields: string[];
  /** Merged body for updateContact — existing phones/emails are kept, ours is added. */
  body: {
    etag?: string;
    names?: PeoplePerson["names"];
    phoneNumbers?: PeoplePerson["phoneNumbers"];
    emailAddresses?: PeoplePerson["emailAddresses"];
  };
};

/** Compare an existing contact against the guest and build a minimal merge body. */
export function diffContact(person: PeoplePerson, guest: GuestContact): ContactDiff {
  const name = guest.name.trim().replace(/\s+/g, " ");
  const updateFields: string[] = [];
  const body: ContactDiff["body"] = { etag: person.etag };

  if (normName(personDisplayName(person)) !== normName(name)) {
    updateFields.push("names");
    body.names = [buildName(name)];
  }

  if (!personHasPhone(person, guest.phone)) {
    updateFields.push("phoneNumbers");
    body.phoneNumbers = [
      ...(person.phoneNumbers ?? [])
        .filter((p) => p.value)
        .map((p) => ({ value: p.value, type: p.type })),
      { value: guest.phone, type: "mobile" },
    ];
  }

  if (guest.email && !personHasEmail(person, guest.email)) {
    updateFields.push("emailAddresses");
    body.emailAddresses = [
      ...(person.emailAddresses ?? [])
        .filter((e) => e.value)
        .map((e) => ({ value: e.value, type: e.type })),
      { value: guest.email.trim(), type: "home" },
    ];
  }

  return { same: updateFields.length === 0, updateFields, body };
}

/** People API `names[]` entry. `displayName` is output-only; givenName carries the full name. */
function buildName(name: string): NonNullable<PeoplePerson["names"]>[number] {
  return { givenName: name };
}

export function buildCreateBody(guest: GuestContact): {
  names: PeoplePerson["names"];
  phoneNumbers: PeoplePerson["phoneNumbers"];
  emailAddresses?: PeoplePerson["emailAddresses"];
} {
  const name = guest.name.trim().replace(/\s+/g, " ");
  const body: ReturnType<typeof buildCreateBody> = {
    names: [buildName(name)],
    phoneNumbers: [{ value: guest.phone, type: "mobile" }],
  };
  if (guest.email?.trim()) {
    body.emailAddresses = [{ value: guest.email.trim(), type: "home" }];
  }
  return body;
}

async function peopleFetch(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${PEOPLE_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
}

async function searchContacts(query: string, token: string): Promise<PeoplePerson[]> {
  const qs = new URLSearchParams({ query, readMask: PERSON_FIELDS, pageSize: "10" });
  const res = await peopleFetch(`/people:searchContacts?${qs}`, token);
  if (!res.ok) {
    throw new Error(
      `People searchContacts failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { results?: Array<{ person?: PeoplePerson }> };
  return (json.results ?? [])
    .map((r) => r.person)
    .filter((p): p is PeoplePerson => Boolean(p));
}

/**
 * Google recommends an empty-query "warm-up" call before searchContacts so a
 * cold cache does not miss recently created contacts. Failures are ignored.
 */
async function warmupSearch(token: string): Promise<void> {
  try {
    const qs = new URLSearchParams({ query: "", readMask: "names" });
    await peopleFetch(`/people:searchContacts?${qs}`, token);
  } catch {
    /* best-effort */
  }
}

/** Find the existing Google contact for a guest, if any. Searches phone first, then email. */
export async function findGuestContact(
  guest: GuestContact,
  token?: string,
): Promise<PeoplePerson | null> {
  const t = token ?? (await getGoogleAccessToken());
  await warmupSearch(t);

  // National digits match how most contacts are typed (8780 5311) as well as +65 forms.
  const national = guest.phone.startsWith("+65") ? guest.phone.slice(3) : guest.phone;
  const queries = [national];
  if (guest.email?.trim()) queries.push(guest.email.trim());

  for (const q of queries) {
    const results = await searchContacts(q, t);
    const match = findMatchingPerson(results, guest);
    if (match) return match;
  }
  return null;
}

/**
 * Create / update / skip a guest's Google contact.
 *
 * - no existing contact → createContact → "created"
 * - existing contact with different name / missing phone / missing email → updateContact → "updated"
 * - existing contact already identical → "skipped"
 */
export async function syncGuestContact(guest: GuestContact): Promise<ContactSyncResult> {
  const name = guest.name.trim();
  if (!name) throw new Error("syncGuestContact: name is required");
  if (!phoneDigits(guest.phone)) throw new Error("syncGuestContact: phone is required");

  const token = await getGoogleAccessToken();
  const existing = await findGuestContact({ ...guest, name }, token);

  if (existing?.resourceName) {
    const diff = diffContact(existing, { ...guest, name });
    if (diff.same) return "skipped";

    const qs = new URLSearchParams({ updatePersonFields: diff.updateFields.join(",") });
    const res = await peopleFetch(`/${existing.resourceName}:updateContact?${qs}`, token, {
      method: "PATCH",
      body: JSON.stringify(diff.body),
    });
    if (!res.ok) {
      throw new Error(`People updateContact failed (${res.status}): ${await res.text()}`);
    }
    return "updated";
  }

  const res = await peopleFetch("/people:createContact", token, {
    method: "POST",
    body: JSON.stringify(buildCreateBody({ ...guest, name })),
  });
  if (!res.ok) {
    throw new Error(`People createContact failed (${res.status}): ${await res.text()}`);
  }
  return "created";
}

export type ContactSweepSummary = {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Sync a batch of guests (e.g. every appointment in the next N days), one People
 * round-trip per distinct phone. Per-guest failures are collected, not thrown.
 */
export async function syncGuestContacts(
  guests: Array<GuestContact & { id?: string }>,
  sync: (g: GuestContact) => Promise<ContactSyncResult> = syncGuestContact,
): Promise<ContactSweepSummary> {
  const summary: ContactSweepSummary = {
    scanned: guests.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  const seen = new Set<string>();
  for (const g of guests) {
    const key = normalizePhone(g.phone) ?? phoneDigits(g.phone);
    if (!key || !g.name.trim()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const r = await sync({ name: g.name, phone: g.phone, email: g.email ?? null });
      summary[r] += 1;
    } catch (e) {
      summary.errors.push(
        `${g.id ?? g.phone}: contacts ${e instanceof Error ? e.message : "failed"}`,
      );
    }
  }
  return summary;
}
