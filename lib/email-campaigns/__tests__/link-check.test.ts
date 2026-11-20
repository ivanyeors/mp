import { describe, expect, it } from "vitest";
import { NotPublicAddressError } from "@/lib/net/public-request";
import { checkLinks, LINK_ANSWER_KEPT_MS, LINK_CHECK_MAX, LINK_CHECK_TIMEOUT_MS, publicLinkRequest, type LinkAnswers, type LinkRequest } from "../link-check";

const A = "https://shop.example.com/a";
const B = "https://shop.example.com/b";

function web(answers: Record<string, Partial<Record<"HEAD" | "GET", number | Error>>>) {
  const asked: string[] = [];
  const request: LinkRequest = async (url, { method }) => {
    asked.push(`${method} ${url}`);
    const a = answers[url]?.[method];
    if (a instanceof Error) throw a;
    return { status: a ?? 404 };
  };
  return { request, asked };
}

const fresh = (): LinkAnswers => new Map();

describe("checkLinks", () => {
  it("asks with HEAD, and takes a 2xx or a 3xx as an answer without following it", async () => {
    const { request, asked } = web({ [A]: { HEAD: 200 }, [B]: { HEAD: 301 } });
    expect(await checkLinks([A, B], { request, kept: fresh() })).toEqual({
      [A]: { ok: true, reason: "answered 200" },
      [B]: { ok: true, reason: "answered 301" },
    });
    expect(asked).toEqual([`HEAD ${A}`, `HEAD ${B}`]);
  });

  it("asks with GET when HEAD is refused, and names the status when neither answers", async () => {
    const { request, asked } = web({ [A]: { HEAD: 405, GET: 200 }, [B]: { HEAD: 404, GET: 410 } });
    expect(await checkLinks([A, B], { request, kept: fresh() })).toEqual({
      [A]: { ok: true, reason: "answered 200" },
      [B]: { ok: false, reason: "answered 410" },
    });
    expect(asked).toEqual([`HEAD ${A}`, `HEAD ${B}`, `GET ${A}`, `GET ${B}`]);
  });

  it("gives each address five seconds, says when one did not answer, and never asks a private one", async () => {
    const timeouts: number[] = [];
    const request: LinkRequest = async (url, { timeoutMs }) => {
      timeouts.push(timeoutMs);
      if (url === A) throw new Error("no answer within 5 seconds");
      if (url === B) throw new NotPublicAddressError(`${url} is not a public address`);
      throw Object.assign(new Error("getaddrinfo ENOTFOUND nowhere.example"), { code: "ENOTFOUND" });
    };
    const answers = await checkLinks([A, B, "https://nowhere.example/"], { request, kept: fresh() });
    expect(answers).toEqual({
      [A]: { ok: false, reason: "didn't answer within 5 seconds" },
      [B]: { ok: false, reason: "is not a public https address" },
      "https://nowhere.example/": { ok: false, reason: "couldn't be reached" },
    });
    expect(Math.max(...timeouts)).toBeLessThanOrEqual(LINK_CHECK_TIMEOUT_MS);
  });

  it("asks at most twenty addresses, each once", async () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://shop.example.com/${i}`);
    const { request, asked } = web(Object.fromEntries(urls.map((u) => [u, { HEAD: 200 }])));
    const answers = await checkLinks([...urls, urls[0]], { request, kept: fresh() });
    expect(Object.keys(answers)).toEqual(urls.slice(0, LINK_CHECK_MAX));
    expect(asked).toHaveLength(LINK_CHECK_MAX);
  });

  it("keeps an answer for ten minutes, and asks again when fresh or once they are up", async () => {
    let now = 1_000_000;
    const kept = fresh();
    const { request, asked } = web({ [A]: { HEAD: 200 } });
    await checkLinks([A], { request, kept, now: () => now });
    now += LINK_ANSWER_KEPT_MS - 1;
    await checkLinks([A], { request, kept, now: () => now });
    expect(asked).toHaveLength(1);
    await checkLinks([A], { request, kept, now: () => now, fresh: true });
    expect(asked).toHaveLength(2);
    now += LINK_ANSWER_KEPT_MS;
    await checkLinks([A], { request, kept, now: () => now });
    expect(asked).toHaveLength(3);
  });

  it("goes through the public-only request in production, which refuses this server's own network unasked", async () => {
    const answers = await checkLinks(["https://127.0.0.1/admin", "https://169.254.169.254/latest/meta-data", "https://localhost/", "http://example.com/"], {
      request: publicLinkRequest,
      kept: fresh(),
    });
    for (const a of Object.values(answers)) expect(a).toEqual({ ok: false, reason: "is not a public https address" });
  });
});
