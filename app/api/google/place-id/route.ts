import { NextResponse } from "next/server";

type PlacesSearchTextResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    googleMapsUri?: string;
  }>;
};

function getRequiredEnv(name: string): string | null {
  const v = process.env[name];
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

function getOptionalReferrerHeaders(): Record<string, string> {
  const ref = getRequiredEnv("GOOGLE_MAPS_API_REFERRER");
  if (!ref) return {};
  const headers: Record<string, string> = { Referer: ref };
  try {
    headers.Origin = new URL(ref).origin;
  } catch {
    // noop
  }
  return headers;
}

export async function GET(req: Request) {
  const apiKey = getRequiredEnv("GOOGLE_MAPS_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY in environment." },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "Missing query param ?q= (e.g. /api/google/place-id?q=mpillow%20singapore)" },
      { status: 400 }
    );
  }

  const regionCode = (url.searchParams.get("regionCode") ?? "SG").trim();

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri",
      ...getOptionalReferrerHeaders(),
    },
    body: JSON.stringify({
      textQuery: q,
      regionCode,
      maxResultCount: 5,
    }),
    // Don't cache this helper; it's for one-off debugging.
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Places searchText failed", status: res.status, details: text.slice(0, 2000) },
      { status: 500 }
    );
  }

  const data = (await res.json()) as PlacesSearchTextResponse;
  const places =
    (data.places ?? []).map((p) => ({
      placeId: p.id ?? null,
      name: p.displayName?.text ?? null,
      address: p.formattedAddress ?? null,
      googleMapsUri: p.googleMapsUri ?? null,
    })) ?? [];

  return NextResponse.json({ query: q, regionCode, places });
}

