import { getGoogleAccessToken } from "./google-auth";

const PEOPLE_BASE = "https://people.googleapis.com/v1";

/**
 * Best-effort upsert of guest name + phone into Google Contacts (People API).
 * Failures should be logged by the caller — never block WhatsApp send.
 */
export async function upsertContactByPhone(
  displayName: string,
  e164Phone: string,
): Promise<"created" | "updated" | "skipped"> {
  const token = await getGoogleAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Search by phone
  const searchQs = new URLSearchParams({
    query: e164Phone,
    readMask: "names,phoneNumbers",
    pageSize: "5",
  });
  const searchRes = await fetch(
    `${PEOPLE_BASE}/people:searchContacts?${searchQs}`,
    { headers, cache: "no-store" },
  );
  if (!searchRes.ok) {
    throw new Error(
      `People searchContacts failed (${searchRes.status}): ${await searchRes.text()}`,
    );
  }
  const searchJson = (await searchRes.json()) as {
    results?: Array<{
      person?: {
        resourceName?: string;
        etag?: string;
        names?: Array<{ displayName?: string }>;
        phoneNumbers?: Array<{ value?: string }>;
      };
    }>;
  };

  const match = (searchJson.results ?? []).find((r) => {
    const phones = r.person?.phoneNumbers ?? [];
    return phones.some((p) => {
      const v = (p.value ?? "").replace(/\D/g, "");
      const want = e164Phone.replace(/\D/g, "");
      return v.endsWith(want) || want.endsWith(v);
    });
  })?.person;

  if (match?.resourceName) {
    const res = await fetch(
      `${PEOPLE_BASE}/${match.resourceName}:updateContact?updatePersonFields=names,phoneNumbers`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          etag: match.etag,
          names: [{ givenName: displayName, displayName }],
          phoneNumbers: [{ value: e164Phone, type: "mobile" }],
        }),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      throw new Error(
        `People updateContact failed (${res.status}): ${await res.text()}`,
      );
    }
    return "updated";
  }

  const createRes = await fetch(
    `${PEOPLE_BASE}/people:createContact`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        names: [{ givenName: displayName, displayName }],
        phoneNumbers: [{ value: e164Phone, type: "mobile" }],
      }),
      cache: "no-store",
    },
  );
  if (!createRes.ok) {
    throw new Error(
      `People createContact failed (${createRes.status}): ${await createRes.text()}`,
    );
  }
  return "created";
}
