import { readdirSync, readFileSync } from "node:fs";
import matter from "gray-matter";
import { renderToStaticMarkup } from "react-dom/server";
import { compileMDX } from "next-mdx-remote/rsc";
import { describe, expect, it } from "vitest";
import { POST_MDX_OPTIONS, postComponents } from "@/components/blog/post-body";
import { extractHeadings } from "@/lib/blog-structure";

async function render(source: string, locale: "en-US" | "zh-CN" = "en-US") {
  const { content } = await compileMDX({ source, options: POST_MDX_OPTIONS, components: postComponents(locale) });
  return renderToStaticMarkup(content);
}

describe("post body", () => {
  it("treats braces and angle brackets as text, renders GFM tables, ids headings and keeps links in locale", async () => {
    const html = await render("## What is a bolster?\n\nUse { 2 } bolsters < 1 m apart, see [the guide](/blog/x).\n\n| Option | Height |\n| --- | --- |\n| Low | 8 cm |", "zh-CN");
    expect(html).toContain('<h2 id="what-is-a-bolster" class="scroll-mt-24">');
    expect(html).toContain("{ 2 } bolsters &lt; 1 m apart");
    expect(html).toContain("<table>");
    expect(html).toContain('href="/zh-CN/blog/x"');
  });

  it("leaves external links alone", async () => {
    expect(await render("[NHS](https://www.nhs.uk/)")).toContain('href="https://www.nhs.uk/"');
  });

  const files = readdirSync("data/blogs").filter((f) => f.endsWith(".mdx"));
  it.each(files)("%s compiles and its contents links resolve", async (file) => {
    const body = matter(readFileSync(`data/blogs/${file}`, "utf8")).content;
    const html = await render(body);
    for (const h of extractHeadings(body)) expect(html).toContain(`id="${h.id}"`);
  });

  it.each(files)("%s has no unresolved citation markers", (file) => {
    expect(readFileSync(`data/blogs/${file}`, "utf8").match(/\[\[cite:[^\]]*\]\]/g) ?? []).toEqual([]);
  });
});
