import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isValidElement, Suspense, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userAgent = vi.hoisted(() => ({ value: "" }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": userAgent.value }),
}));

import { LoadingUntilReady, MpillowLoading } from "./mpillow-loading";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const page = <p>the page</p>;

describe("LoadingUntilReady", () => {
  beforeEach(() => {
    userAgent.value = IPHONE;
  });

  it("gives a visitor the loading animation until the page is ready", async () => {
    const out = (await LoadingUntilReady({ label: "Loading", children: page })) as ReactElement<{
      fallback: ReactElement<{ label: string }>;
      children: unknown;
    }>;
    expect(out.type).toBe(Suspense);
    expect(out.props.fallback.type).toBe(MpillowLoading);
    expect(out.props.fallback.props.label).toBe("Loading");
    expect(out.props.children).toBe(page);
  });

  it.each([
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  ])("gives a crawler the page itself, with no loading placeholder: %s", async (crawler) => {
    userAgent.value = crawler;
    expect(await LoadingUntilReady({ label: "Loading", children: page })).toBe(page);
  });
});

describe("MpillowLoading", () => {
  it("announces itself to a screen reader in the page's language", () => {
    const out = MpillowLoading({ label: "正在加载" });
    expect(out.props.role).toBe("status");
    const texts: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string") texts.push(node);
      if (Array.isArray(node)) node.forEach(walk);
      if (isValidElement<{ children?: unknown }>(node)) walk(node.props.children);
    };
    walk(out);
    expect(texts).toEqual(["正在加载"]);
  });
});

const ROOT = path.resolve(import.meta.dirname, "..");

function pagesUsingTheLoader(): string[] {
  return readdirSync(path.join(ROOT, "app"), { recursive: true, encoding: "utf8" })
    .filter((file) => /(^|\/)(page|layout)\.tsx$/.test(file))
    .map((file) => path.join("app", file))
    .filter((file) => readFileSync(path.join(ROOT, file), "utf8").includes("LoadingUntilReady"));
}

function defaultExportBody(source: string): string {
  const start = source.indexOf("export default async function");
  return source.slice(start, source.indexOf("\n}\n", start));
}

describe("pages that show the loading animation", () => {
  const pages = pagesUsingTheLoader();

  it("are the home page and Explore", () => {
    expect(pages.sort()).toEqual(["app/[lang]/explore/page.tsx", "app/[lang]/page.tsx"]);
  });

  it.each(pages)("%s sends the animation before it reads any data", (file) => {
    const body = defaultExportBody(readFileSync(path.join(ROOT, file), "utf8"));
    expect(body).toContain("<LoadingUntilReady");
    const awaited = [...body.matchAll(/await\s+([\w.]+)/g)].map((m) => m[1]);
    expect(awaited.filter((name) => !/^(props\.)?params$/.test(name))).toEqual([]);
    expect(body).not.toMatch(/supabase|getAuthUser|load[A-Z]\w*\(|get[A-Z]\w*Sections\(/);
  });

  it.each(pages)("%s never answers 404 or redirects, which a response already streaming cannot do", (file) => {
    expect(readFileSync(path.join(ROOT, file), "utf8")).not.toMatch(/\b(notFound|redirect|permanentRedirect)\(/);
  });
});
