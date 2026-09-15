import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { roleHasPermission, type AdminRole } from "@/lib/auth/permissions";

/**
 * The blog GETs return drafts, so they answer only a Staff session holding the
 * same `blogs` permission the writes need. Public blog pages read lib/blogs on
 * the server and never call these.
 */

const h = vi.hoisted(() => ({
  role: null as AdminRole | null,
  listAdminBlogPosts: vi.fn(),
  getAdminBlogPostById: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async (permission: Parameters<typeof roleHasPermission>[1]) => {
    if (!h.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return roleHasPermission(h.role, permission)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }),
}));
vi.mock("@/lib/blogs", () => ({
  listAdminBlogPosts: h.listAdminBlogPosts,
  getAdminBlogPostById: h.getAdminBlogPostById,
}));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: vi.fn() }));

const { GET: listGet } = await import("@/app/api/blogs/route");
const { GET: postGet } = await import("@/app/api/blogs/[id]/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.role = null;
  h.listAdminBlogPosts.mockResolvedValue([]);
  h.getAdminBlogPostById.mockResolvedValue({ row: { id: ID }, error: null });
});

describe("GET /api/blogs", () => {
  it("refuses an anonymous caller, before reading drafts", async () => {
    const res = await listGet(new Request("http://x/api/blogs?status=draft"));
    expect([401, 403]).toContain(res.status);
    expect(h.listAdminBlogPosts).not.toHaveBeenCalled();
  });

  it("serves a Staff session holding blogs", async () => {
    h.role = "manager";
    const res = await listGet(new Request("http://x/api/blogs"));
    expect(res.status).toBe(200);
  });
});

describe("GET /api/blogs/[id]", () => {
  it("refuses an anonymous caller", async () => {
    const res = await postGet(new Request(`http://x/api/blogs/${ID}`), params);
    expect([401, 403]).toContain(res.status);
    expect(h.getAdminBlogPostById).not.toHaveBeenCalled();
  });
});
