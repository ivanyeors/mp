import { describe, expect, it } from "vitest";
import {
    BLOG_SLUG_MESSAGE,
    blogInputError,
    blogSlug,
    blogSlugWhileTyping,
    CreateBlogSchema,
    errorText,
    UpdateBlogSchema,
} from "./blog-post-input";

const english = { title: "Why your pillow matters", sub_header: "", description: "", body: "Text", seo_keywords: [] };
const blank = { title: "", sub_header: "", description: "", body: "", seo_keywords: [] };
const post = (over: Record<string, unknown> = {}) => ({
    slug: "why-your-pillow-matters",
    status: "published",
    author: "Mpillow",
    image_url: null,
    media_asset_id: null,
    labels: [],
    content: { "en-US": english, "zh-CN": blank },
    ...over,
});

const messageFor = (schema: typeof CreateBlogSchema | typeof UpdateBlogSchema, input: unknown) => {
    const parsed = schema.safeParse(input);
    return parsed.success ? null : blogInputError(parsed.error);
};

describe("blog post input", () => {
    it("accepts a post written in English only and stores no empty 中文 entry", () => {
        const parsed = CreateBlogSchema.parse(post());
        expect(Object.keys(parsed.content)).toEqual(["en-US"]);
        const updated = UpdateBlogSchema.parse(post());
        expect(Object.keys(updated.content ?? {})).toEqual(["en-US"]);
    });

    it("keeps a translated tab", () => {
        const parsed = CreateBlogSchema.parse(post({ content: { "en-US": english, "zh-CN": { ...blank, title: "枕头" } } }));
        expect(Object.keys(parsed.content)).toEqual(["en-US", "zh-CN"]);
    });

    it("names the tab that has text but no title, in a sentence", () => {
        const message = messageFor(CreateBlogSchema, post({ content: { "en-US": english, "zh-CN": { ...blank, body: "正文" } } }));
        expect(message).toBe("The 中文 tab has text but no title. Add a title there, or clear that tab.");
    });

    it("asks for a title when every tab is empty, on create and on update", () => {
        expect(messageFor(CreateBlogSchema, post({ content: { "en-US": blank, "zh-CN": blank } }))).toBe("Add a title before saving.");
        expect(messageFor(UpdateBlogSchema, post({ content: { "en-US": blank } }))).toBe("Add a title before saving.");
        expect(messageFor(CreateBlogSchema, post({ content: undefined }))).toMatch(/^content: /);
    });

    it("refuses a title pasted as the slug of a new post", () => {
        const pasted = "Why Your Pillow Might Be the Reason You Wake Up with Neck and Shoulder Pain";
        expect(messageFor(CreateBlogSchema, post({ slug: pasted }))).toBe(BLOG_SLUG_MESSAGE);
        expect(messageFor(CreateBlogSchema, post({ slug: "" }))).toBe(BLOG_SLUG_MESSAGE);
        expect(messageFor(UpdateBlogSchema, { slug: " " })).toBe(BLOG_SLUG_MESSAGE);
    });

    it("lets a status-only update through", () => {
        expect(UpdateBlogSchema.parse({ status: "unpublished" })).toEqual({ status: "unpublished" });
    });

    it("turns a title into a slug", () => {
        expect(blogSlug("Why Your Pillow Might Be the Reason — You Wake Up!")).toBe("why-your-pillow-might-be-the-reason-you-wake-up");
        expect(blogSlug("  Night's rest  ")).toBe("nights-rest");
        expect(blogSlug("枕头")).toBe("");
        expect(blogSlugWhileTyping("My post ")).toBe("my-post-");
    });

    it("never hands an object to the screen as an error", () => {
        expect(errorText({ formErrors: [], fieldErrors: {} }, "Couldn't save the post.")).toBe("Couldn't save the post.");
        expect(errorText("A post with this slug already exists", "x")).toBe("A post with this slug already exists");
    });
});
