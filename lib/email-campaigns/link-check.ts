/**
 * Whether an email's links answer (PRD-campaign-email-editor slice 11): a
 * dead link in a sent email cannot be fixed, so before a wave the server asks
 * each one. Server only.
 *
 * Each address gets a HEAD, then a GET when the HEAD is not answered with a
 * 2xx or 3xx (some sites refuse HEAD); a 2xx or 3xx is an answer, and a
 * redirect is never followed. Five seconds an address, at most
 * {@link LINK_CHECK_MAX} addresses a check, all at once. Every request goes
 * through `publicRequest` (lib/net/public-request.ts): https only, public
 * hosts only, so a link Staff type cannot reach this server's own network.
 * The site's own pages are not asked at all: the checks hold them to the
 * site's route list (`isSitePage`).
 *
 * Answers are kept for ten minutes, so *Ready to send?*, *Check who it goes
 * to* and a save in between ask once. The wave's own check asks again
 * (`fresh`), so a link that died since is caught.
 */
import { NotPublicAddressError, publicRequest } from "@/lib/net/public-request";
import type { LinkAnswer } from "./content-checks";

/** The most addresses one check asks; the checks say the rest were not checked. */
export const LINK_CHECK_MAX = 20;
/** How long one address may take, HEAD and GET together. */
export const LINK_CHECK_TIMEOUT_MS = 5000;
/** How long an answer is kept. */
export const LINK_ANSWER_KEPT_MS = 10 * 60_000;

/** One request for an address's status; it throws when there is no answer. `publicRequest`, or a test's fake. */
export type LinkRequest = (url: string, init: { method: "HEAD" | "GET"; timeoutMs: number }) => Promise<{ status: number }>;

/** The production request: `publicRequest`. */
export const publicLinkRequest: LinkRequest = (url, init) => publicRequest(url, init);

/** Answers kept, by address, with when they were asked. */
export type LinkAnswers = Map<string, { answer: LinkAnswer; at: number }>;

/** This server's answers, for ten minutes. */
const KEPT: LinkAnswers = new Map();

const answers = (status: number) => status >= 200 && status < 400;

/** One address, HEAD then GET, within the time left. */
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

/**
 * What each of the first {@link LINK_CHECK_MAX} addresses answers, by
 * address; one past them is left out, and the checks say it was not checked.
 * An answer from the last ten minutes is reused unless `fresh`. Never throws.
 */
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
  // An answer past its ten minutes is never read again: keep the map small.
  for (const [url, { at }] of kept) if (now() - at >= LINK_ANSWER_KEPT_MS) kept.delete(url);
  return out;
}
