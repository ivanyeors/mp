import { NotPublicAddressError, publicRequest } from "@/lib/net/public-request";
import type { LinkAnswer } from "./content-checks";

export const LINK_CHECK_MAX = 20;
export const LINK_CHECK_TIMEOUT_MS = 5000;
export const LINK_ANSWER_KEPT_MS = 10 * 60_000;

export type LinkRequest = (url: string, init: { method: "HEAD" | "GET"; timeoutMs: number }) => Promise<{ status: number }>;

export const publicLinkRequest: LinkRequest = (url, init) => publicRequest(url, init);

export type LinkAnswers = Map<string, { answer: LinkAnswer; at: number }>;

const KEPT: LinkAnswers = new Map();

const answers = (status: number) => status >= 200 && status < 400;

async function ask(url: string, request: LinkRequest): Promise<LinkAnswer> {
  const until = Date.now() + LINK_CHECK_TIMEOUT_MS;
  let last: { status: number } | null = null;
  let error: unknown = null;
  for (const method of ["HEAD", "GET"] as const) {
    const timeoutMs = until - Date.now();
    if (timeoutMs <= 0) break;
    try {
      last = await request(url, { method, timeoutMs });
      if (answers(last.status)) return { ok: true, reason: `answered ${last.status}` };
    } catch (err) {
      if (err instanceof NotPublicAddressError) return { ok: false, reason: "is not a public https address" };
      error = err;
    }
  }
  if (last) return { ok: false, reason: `answered ${last.status}` };
  const timedOut = Date.now() >= until || /no answer within|timed? ?out|abort/i.test(error instanceof Error ? error.message : String(error));
  return { ok: false, reason: timedOut ? `didn't answer within ${LINK_CHECK_TIMEOUT_MS / 1000} seconds` : "couldn't be reached" };
}

export async function checkLinks(
  urls: readonly string[],
  {
    request = publicLinkRequest,
    fresh = false,
    now = Date.now,
    kept = KEPT,
  }: { request?: LinkRequest; fresh?: boolean; now?: () => number; kept?: LinkAnswers } = {},
): Promise<Record<string, LinkAnswer>> {
  const asked = [...new Set(urls)].slice(0, LINK_CHECK_MAX);
  const out: Record<string, LinkAnswer> = {};
  await Promise.all(
    asked.map(async (url) => {
      const was = kept.get(url);
      if (!fresh && was && now() - was.at < LINK_ANSWER_KEPT_MS) {
        out[url] = was.answer;
        return;
      }
      const answer = await ask(url, request);
      kept.set(url, { answer, at: now() });
      out[url] = answer;
    }),
  );
  for (const [url, { at }] of kept) if (now() - at >= LINK_ANSWER_KEPT_MS) kept.delete(url);
  return out;
}
