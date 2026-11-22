import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ editorCode: [] as string[] }));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdminPage: async () => undefined }));
vi.mock("@/lib/ecommerce/admin/products", () => ({
  getAdminProduct: async (id: string) => {
    calls.editorCode.push(`getAdminProduct ${id}`);
    return { ok: false };
  },
}));
vi.mock("@/lib/ecommerce/categories", () => ({
  getCategoryTree: async () => {
    calls.editorCode.push("getCategoryTree");
    return [];
  },
}));
vi.mock("@/lib/ai/page-availability", () => ({
  readAiWritingAvailability: async () => {
    calls.editorCode.push("readAiWritingAvailability");
    return { on: false, configured: false };
  },
}));
vi.mock("@/lib/stripe/mode", () => ({ stripeMode: () => "test" }));
vi.mock("../product-editor-client", () => ({ ProductEditorClient: () => null }));

const { default: ProductEditorPage } = await import("../page");

async function open(lang: string, id: string): Promise<string | null> {
  try {
    await ProductEditorPage({ params: Promise.resolve({ lang, id }) });
    return null;
  } catch (e) {
    const m = /^REDIRECT (.*)$/.exec(e instanceof Error ? e.message : "");
    if (m) return m[1];
    throw e;
  }
}

beforeEach(() => {
  calls.editorCode = [];
});

describe("/settings/products/new", () => {
  it("redirects to the Products list in the visitor's language before any editor code runs", async () => {
    expect(await open("zh-CN", "new")).toBe("/zh-CN/settings/products");
    expect(await open("en-US", "new")).toBe("/en-US/settings/products");
    expect(calls.editorCode).toEqual([]);
  });

  it("still opens the editor for a product id", async () => {
    expect(await open("en-US", "p1")).toBeNull();
    expect(calls.editorCode).toContain("getAdminProduct p1");
  });
});
