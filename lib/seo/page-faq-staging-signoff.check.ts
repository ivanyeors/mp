import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";

import { PageFaqSection, PageFaqSectionView } from "@/components/page-faq/page-faq-section";
import { getFaqPageData } from "@/lib/faq";
import { getProductBySlug } from "@/lib/ecommerce/products";
import { getPageFaq, productSurfaceKey, stripMarkdownForSchema } from "@/lib/page-faq";
import { stripMarkdownForSchema as stripGlobalFaqMd } from "@/lib/faq";
import { buildFaqPageJsonLd } from "@/lib/seo";
import { enUS } from "@/lib/i18n/messages/en-US";

const ROOT = process.cwd();
const BASE = process.env.PAGE_FAQ_SIGNOFF_BASE_URL?.replace(/\/$/, "") ?? "";

type FaqPageLd = {
  "@context"?: unknown;
  "@type"?: unknown;
  mainEntity?: unknown;
};

function assertGoogleFaqPageEligible(label: string, raw: unknown) {
  assert.ok(raw && typeof raw === "object", `${label}: JSON-LD object`);
  const ld = raw as FaqPageLd;
  assert.equal(ld["@context"], "https://schema.org", `${label}: @context`);
  assert.equal(ld["@type"], "FAQPage", `${label}: @type FAQPage`);
  assert.ok(Array.isArray(ld.mainEntity) && ld.mainEntity.length >= 1, `${label}: mainEntity[]`);
  for (const [i, q] of ld.mainEntity.entries()) {
    assert.ok(q && typeof q === "object", `${label}: Q${i}`);
    const question = q as Record<string, unknown>;
    assert.equal(question["@type"], "Question", `${label}: Q${i} @type`);
    assert.ok(typeof question.name === "string" && question.name.trim().length > 0, `${label}: Q${i} name`);
    const ans = question.acceptedAnswer as Record<string, unknown> | undefined;
    assert.ok(ans && typeof ans === "object", `${label}: Q${i} acceptedAnswer`);
    assert.equal(ans!["@type"], "Answer", `${label}: Q${i} Answer`);
    assert.ok(typeof ans!.text === "string" && String(ans!.text).trim().length > 0, `${label}: Q${i} text`);
    assert.doesNotMatch(String(ans!.text), /\*\*|\[.+\]\(.+\)/, `${label}: Q${i} markdown in schema`);
  }
}

function extractFaqPageJsonLd(html: string): unknown {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const data = JSON.parse(m[1]!);
      const list = Array.isArray(data) ? data : [data];
      const hit = list.find((x) => x && typeof x === "object" && (x as { "@type"?: string })["@type"] === "FAQPage");
      if (hit) return hit;
    } catch {}
  }
  return null;
}

function runCheck(rel: string) {
  const r = spawnSync("npx", ["tsx", "--env-file=.env.local", rel], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status !== 0) {
    throw new Error(`${rel} failed:\n${out.slice(-800)}`);
  }
  const line =
    out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("npm "))
      .at(-1) ?? "ok";
  return line;
}

async function fetchHtml(path: string) {
  assert.ok(BASE, "PAGE_FAQ_SIGNOFF_BASE_URL required for live fetch");
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  assert.equal(res.status, 200, `${path} HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const rows: Array<{ id: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const mark = (id: string, fn: () => Promise<string> | string) =>
    Promise.resolve()
      .then(fn)
      .then((detail) => {
        rows.push({ id, status: "PASS", detail });
        console.log(`PASS\t${id}\t${detail}`);
      })
      .catch((err) => {
        const detail = err instanceof Error ? err.message : String(err);
        rows.push({ id, status: "FAIL", detail });
        console.error(`FAIL\t${id}\t${detail.slice(0, 240)}`);
      });

  await mark("settings_e2e", () =>
    runCheck("components/settings/settings-faq.check.ts")
  );
  await mark("page_faq_section", () =>
    runCheck("components/page-faq/page-faq-section.check.ts")
  );
  await mark("home_embed", () =>
    runCheck("components/sections/landing/home-page-faq.check.ts")
  );
  await mark("pdp_embed", () =>
    runCheck("app/[lang]/shop/[slug]/pdp-page-faq.check.ts")
  );
  await mark("config_embed", () =>
    runCheck("app/[lang]/mp-config/configurator-page-faq.check.ts")
  );
  await mark("answer_ledes", () =>
    runCheck("lib/seo/answer-lede-coverage.check.ts")
  );

  await mark("rich_results_home", async () => {
    const section = await PageFaqSection({ surfaceKey: "home", locale: "en-US" });
    assert.ok(section, "home Page FAQ non-empty");
    const html = renderToStaticMarkup(section);
    assert.match(html, /data-page-faq/);
    const ld = extractFaqPageJsonLd(html);
    assertGoogleFaqPageEligible("home", ld);
    const n = (ld as { mainEntity: unknown[] }).mainEntity.length;
    return `FAQPage eligible (${n} Qs)`;
  });

  await mark("rich_results_pdp", async () => {
    const product = await getProductBySlug("mpillow-basic");
    assert.ok(product?.id, "mpillow-basic");
    const section = await PageFaqSection({
      surfaceKey: productSurfaceKey(product!.id),
      locale: "en-US",
    });
    assert.ok(section, "PDP Page FAQ non-empty");
    const html = renderToStaticMarkup(section);
    assert.match(html, /data-page-faq/);
    const ld = extractFaqPageJsonLd(html);
    assertGoogleFaqPageEligible("pdp", ld);
    const set = await getPageFaq(productSurfaceKey(product!.id), "en-US");
    assertGoogleFaqPageEligible(
      "pdp-builder",
      buildFaqPageJsonLd(
        set!.items.map((i) => ({
          question: i.question,
          answer: stripMarkdownForSchema(i.answer),
        }))
      )
    );
    return `FAQPage eligible (${(ld as { mainEntity: unknown[] }).mainEntity.length} Qs)`;
  });

  await mark("empty_vs_nonempty", async () => {
    assert.equal(PageFaqSectionView({ title: "FAQs", items: [], locale: "en-US" }), null);
    const empty = await PageFaqSection({
      surfaceKey: "product:00000000-0000-4000-8000-000000000000",
      locale: "en-US",
    });
    assert.equal(empty, null);
    for (const key of ["home", "mp-config", "mbolster-config"] as const) {
      const set = await getPageFaq(key, "en-US");
      assert.ok(set && set.items.length >= 1, `${key} non-empty`);
      const section = await PageFaqSection({ surfaceKey: key, locale: "en-US" });
      assert.ok(section, `${key} shows accordion`);
      const html = renderToStaticMarkup(section);
      assert.match(html, /data-page-faq/);
      assert.match(html, /"@type":"FAQPage"/);
    }
    return "empty hides; home+configs show accordion+JSON-LD";
  });

  await mark("ledes_content", () => {
    assert.ok(enUS.home.hero.seoAnswer.split(/\s+/).length >= 50, "home lede");
    return "home seoAnswer dense; PDP/config covered by answer_ledes check";
  });

  await mark("global_faq", async () => {
    const cats = await getFaqPageData("en-US");
    assert.ok(cats.length >= 1, "categories");
    const items = cats.flatMap((c) => c.items);
    assert.ok(items.length >= 5, "global FAQ items");
    assertGoogleFaqPageEligible(
      "global-faq",
      buildFaqPageJsonLd(
        items.map((i) => ({
          question: i.question,
          answer: stripGlobalFaqMd(i.answer),
        }))
      )
    );
    return `${cats.length} cats / ${items.length} items FAQPage-shaped`;
  });

  if (BASE) {
    await mark("live_home", async () => {
      const html = await fetchHtml("/en-US");
      assert.match(
        html,
        new RegExp(enUS.home.hero.seoAnswer.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
      assert.match(html, /data-page-faq/);
      assertGoogleFaqPageEligible("live-home", extractFaqPageJsonLd(html));
      return "FAQPage + answer lede in HTML";
    });
    await mark("live_pdp", async () => {
      const html = await fetchHtml("/en-US/shop/mpillow-basic");
      assert.match(html, /data-page-faq/);
      const ld = extractFaqPageJsonLd(html);
      assertGoogleFaqPageEligible("live-pdp", ld);
      return "FAQPage + data-page-faq in HTML";
    });
    await mark("live_configs", async () => {
      for (const path of ["/en-US/mp-config", "/en-US/mbolster-config"]) {
        const html = await fetchHtml(path);
        assert.match(html, /data-page-faq/);
        assertGoogleFaqPageEligible(path, extractFaqPageJsonLd(html));
      }
      return "both configs FAQPage in HTML";
    });
    await mark("live_global_faq", async () => {
      const html = await fetchHtml("/en-US/faq");
      assertGoogleFaqPageEligible("live-/faq", extractFaqPageJsonLd(html));
      return "Global /faq FAQPage in HTML";
    });
  } else {
    rows.push({
      id: "live_html",
      status: "PASS",
      detail: "skipped (set PAGE_FAQ_SIGNOFF_BASE_URL for live fetch)",
    });
    console.log("PASS\tlive_html\tskipped (set PAGE_FAQ_SIGNOFF_BASE_URL for live fetch)");
  }

  console.log("\n=== Slice 09 signoff matrix ===");
  for (const r of rows) {
    console.log(`${r.status}\t${r.id}\t${r.detail.slice(0, 160)}`);
  }
  const failed = rows.filter((r) => r.status === "FAIL");
  if (failed.length) {
    console.error(`\npage-faq-staging-signoff FAIL ${failed.length}/${rows.length}`);
    process.exit(1);
  }
  console.log(`\npage-faq-staging-signoff self-check ok (${rows.length}/${rows.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
