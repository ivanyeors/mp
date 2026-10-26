import { describe, expect, it } from "vitest";
import { isSafeUrl, rehypeStripUnsafeHtml } from "@/lib/blog-editor/strip-unsafe-html";

type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[] };
const el = (tagName: string, properties: Record<string, unknown> = {}, children: Node[] = []): Node => ({
  type: "element",
  tagName,
  properties,
  children,
});

function run(children: Node[]): Node {
  const tree: Node = { type: "root", children };
  rehypeStripUnsafeHtml()(tree);
  return tree;
}

describe("rehypeStripUnsafeHtml", () => {
  it("drops elements that run script or load another document", () => {
    const tree = run([
      el("p", {}, [{ type: "text" }]),
      el("iframe", { srcDoc: "<script>alert(1)</script>" }),
      el("div", {}, [el("script"), el("object", { data: "x.svg" }), el("p")]),
    ]);
    expect(tree.children?.map((c) => c.tagName)).toEqual(["p", "div"]);
    expect(tree.children?.[1].children?.map((c) => c.tagName)).toEqual(["p"]);
  });

  it("strips event handlers, srcdoc and script URLs, keeping ordinary links", () => {
    const tree = run([
      el("img", { src: "https://cdn.example/a.png", onError: "alert(1)" }),
      el("a", { href: " javascript:alert(1)" }),
      el("a", { href: "java\tscript:alert(1)" }),
      el("a", { href: "/en-US/shop" }),
      el("a", { href: "data:text/html,<script>alert(1)</script>" }),
    ]);
    const [img, js, tabbed, local, data] = tree.children ?? [];
    expect(img.properties).toEqual({ src: "https://cdn.example/a.png" });
    expect(js.properties).toEqual({});
    expect(tabbed.properties).toEqual({});
    expect(local.properties).toEqual({ href: "/en-US/shop" });
    expect(data.properties).toEqual({});
  });
});

describe("isSafeUrl", () => {
  it("allows web, mail and relative links only", () => {
    for (const url of ["https://mpillow.com", "http://x.test/a", "mailto:hi@x.test", "#top", "/blog", "./a", "a.png"]) {
      expect(isSafeUrl(url)).toBe(true);
    }
    for (const url of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", " vbscript:x", "data:text/html,x"]) {
      expect(isSafeUrl(url)).toBe(false);
    }
  });
});
