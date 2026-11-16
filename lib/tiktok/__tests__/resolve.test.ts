import { describe, expect, it } from "vitest";

import { resolveTikTokLink } from "@/lib/tiktok/resolve";

const ID = "7301234567890123456";
const POST = `https://www.tiktok.com/@thempillow/video/${ID}`;

/** A fetch that answers from a table of URL prefixes. */
function fakeFetch(routes: Array<[string, () => Response]>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = routes.find(([prefix]) => url.startsWith(prefix));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    return hit[1]();
  }) as typeof fetch;
}

const oembedOk = (): Response => Response.json({ embed_product_id: ID, html: "<iframe>" });
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } });

describe("resolveTikTokLink", () => {
  it("keeps a full post link, without tracking, once TikTok confirms it", async () => {
    const result = await resolveTikTokLink(`${POST}?is_from_webapp=1`, fakeFetch([["https://www.tiktok.com/oembed", oembedOk]]));
    expect(result).toEqual({ ok: true, id: ID, url: POST, verified: true });
  });

  it("follows a share link to the post", async () => {
    const result = await resolveTikTokLink(
      "https://vt.tiktok.com/ZSabc123/",
      fakeFetch([
        ["https://vt.tiktok.com/ZSabc123", redirect(`${POST}?_r=1&_t=xyz`)],
        ["https://www.tiktok.com/oembed", oembedOk],
      ]),
    );
    expect(result).toEqual({ ok: true, id: ID, url: POST, verified: true });
  });

  it("refuses a share link that lands on the home page", async () => {
    const result = await resolveTikTokLink(
      "https://vm.tiktok.com/ZMnope/",
      fakeFetch([["https://vm.tiktok.com/ZMnope", redirect("https://www.tiktok.com/?_r=1")]]),
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a private or deleted video", async () => {
    const result = await resolveTikTokLink(
      POST,
      fakeFetch([["https://www.tiktok.com/oembed", () => Response.json({ code: 400 }, { status: 400 })]]),
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("keeps a well-formed link unverified when TikTok can't be reached", async () => {
    const result = await resolveTikTokLink(
      POST,
      fakeFetch([["https://www.tiktok.com/oembed", () => { throw new Error("offline"); }]]),
    );
    expect(result).toEqual({ ok: true, id: ID, url: POST, verified: false });
  });

  it("refuses links that are not TikTok posts without calling out", async () => {
    const result = await resolveTikTokLink("https://www.tiktok.com/@thempillow", fakeFetch([]));
    expect(result.ok).toBe(false);
  });
});
