import { getIndexNowKey } from "@/lib/seo/indexnow";

/** IndexNow ownership proof (slice 15): the key, as plain text, at the site root. */
export function GET() {
  const key = getIndexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
