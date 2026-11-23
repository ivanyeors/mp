// @vitest-environment jsdom
import "@/components/block-editor/__tests__/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateBlogSchema, UpdateBlogSchema } from "@/lib/blog-post-input";
import type { BlogEditorRow } from "../blog-editor-client";

const h = vi.hoisted(() => ({ id: "b1", toastError: vi.fn(), toastSuccess: vi.fn(), push: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en-US", id: h.id }),
  usePathname: () => `/en-US/settings/blogs/${h.id}`,
  useRouter: () => ({ push: h.push, replace: () => {}, refresh: () => {} }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/ui/image-picker", () => ({ ImagePicker: () => null }));

const { default: BlogEditorPage } = await import("../blog-editor-client");

const englishOnly: BlogEditorRow = {
  slug: "first-post",
  status: "draft",
  author: "Mpillow",
  image_url: null,
  labels: [],
  content: { "en-US": { title: "First post", body: "Text" } },
};

let answer: { status: number; body: unknown };
let fetchMock: ReturnType<typeof vi.fn>;
let alertMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  h.id = "b1";
  h.toastError.mockClear();
  h.toastSuccess.mockClear();
  h.push.mockClear();
  answer = { status: 200, body: { ok: true, row: { id: "b9", ...englishOnly } } };
  fetchMock = vi.fn(async () => ({ ok: answer.status < 400, status: answer.status, json: async () => answer.body }));
  alertMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("alert", alertMock);
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async (node: ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
};
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const input = (placeholder: string) => host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
const type = async (el: HTMLInputElement, value: string) => {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const sent = (method: string) => {
  const call = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === method)!;
  return JSON.parse((call[1] as RequestInit).body as string);
};

describe("Blog editor save", () => {
  it("sends a post written in English only in a form the API accepts", async () => {
    await mount(<BlogEditorPage initialData={{ ok: true, row: englishOnly }} />);
    await act(async () => button("Save").click());
    expect(UpdateBlogSchema.safeParse(sent("PATCH")).success).toBe(true);
    expect(h.toastSuccess).toHaveBeenCalledWith("Post saved.");
  });

  it("creates a new post from a title alone, making the web address from it", async () => {
    h.id = "new";
    await mount(<BlogEditorPage />);
    await type(input("Blog post title"), "Why Your Pillow Might Be the Reason You Wake Up!");
    await act(async () => button("Save and publish").click());
    const body = sent("POST");
    expect(body.slug).toBe("why-your-pillow-might-be-the-reason-you-wake-up");
    expect(body.status).toBe("published");
    expect(CreateBlogSchema.safeParse(body).success).toBe(true);
    expect(h.toastSuccess).toHaveBeenCalledWith("Post saved and published.");
    expect(h.push).toHaveBeenCalledWith("/en-US/settings/blogs/b9");
  });

  it("turns a title typed into the slug field into a web address", async () => {
    h.id = "new";
    await mount(<BlogEditorPage />);
    await type(input("my-blog-post-url"), "Why Your Pillow Might Be the Reason");
    expect(input("my-blog-post-url").value).toBe("why-your-pillow-might-be-the-reason");
  });

  it("shows the server's reason as a message, and a plain sentence when the reason is not text", async () => {
    await mount(<BlogEditorPage initialData={{ ok: true, row: englishOnly }} />);
    answer = { status: 409, body: { error: "A post with this slug already exists" } };
    await act(async () => button("Save").click());
    expect(h.toastError).toHaveBeenLastCalledWith("A post with this slug already exists");

    answer = { status: 400, body: { error: { formErrors: [], fieldErrors: { content: ["Too small"] } } } };
    await act(async () => button("Save").click());
    expect(h.toastError).toHaveBeenLastCalledWith("Couldn't save the post.");
    expect(alertMock).not.toHaveBeenCalled();
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("says so when the request never reaches the server, and lets the user try again", async () => {
    await mount(<BlogEditorPage initialData={{ ok: true, row: englishOnly }} />);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await act(async () => button("Save").click());
    expect(h.toastError).toHaveBeenLastCalledWith("Couldn't save the post. Check your connection and try again.");
    expect(button("Save").disabled).toBe(false);
  });
});
