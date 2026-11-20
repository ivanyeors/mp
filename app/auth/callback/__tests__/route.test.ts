import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn();
const complete = vi.fn();
vi.mock("@/lib/supabase/ssr-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));
vi.mock("@/lib/auth/complete-sign-in", () => ({ completeSignIn: (...a: unknown[]) => complete(...a) }));

const { GET } = await import("../route");

const at = (q: string) => new NextRequest(`http://localhost:3000/auth/callback?${q}`);

beforeEach(() => {
  exchange.mockReset();
  complete.mockReset();
});

describe("/auth/callback", () => {
  it("finishes with the intent the link carried, and leaves the notice for the page", async () => {
    exchange.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    complete.mockResolvedValue({ ok: true, destination: "/zh-CN/shop", notice: "subscribed" });
    const res = await GET(at("code=c1&next=%2Fzh-CN%2Fshop&as=customer&consent=newsletter&lang=zh-CN"));
    expect(complete).toHaveBeenCalledWith(
      { id: "u1" },
      { audience: "customer", next: "/zh-CN/shop", consent: "newsletter", locale: "zh-CN" },
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/zh-CN/shop");
    expect(res.cookies.get("mp_sign_up")?.value).toBe("subscribed");
  });

  it("reads an old link, with only `next`, by its destination", async () => {
    exchange.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    complete.mockResolvedValue({ ok: true, destination: "/en-US/settings", notice: null });
    const res = await GET(at("code=c1&next=%2Fen-US%2Fsettings"));
    expect(complete.mock.calls[0]?.[1]).toMatchObject({ audience: "staff", consent: null });
    expect(res.cookies.get("mp_sign_up")).toBeUndefined();
  });

  it("sends a spent or foreign-browser link back to its tab with why", async () => {
    exchange.mockResolvedValue({ data: { user: null }, error: { message: "code verifier not found" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(at("code=c1&next=%2Fen-US%2Fsettings&as=staff"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/en-US/account/login?as=staff&error=link_expired&next=%2Fen-US%2Fsettings",
    );
    expect(complete).not.toHaveBeenCalled();
    const expired = await GET(at("error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=%2Fen-US%2Fshop"));
    expect(expired.headers.get("location")).toContain("/en-US/account/login?as=customer&error=link_expired");
  });
});
