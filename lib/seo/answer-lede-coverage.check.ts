/**
 * Slice 08 self-check: answer lede coverage on commercial surfaces.
 * Fills missing/weak product seo_answer (idempotent), then asserts density + wiring.
 *
 * Run: npx tsx --env-file=.env.local lib/seo/answer-lede-coverage.check.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { resolveAnswerLede } from "@/lib/seo/answer-lede";
import { supabaseAdmin } from "@/lib/supabase/server";
import { enUS } from "@/lib/i18n/messages/en-US";
import { zhCN } from "@/lib/i18n/messages/zh-CN";
import type { LocalizedProductContent } from "@/lib/types/ecommerce";

const ROOT = process.cwd();
/** Roughly 60–120 English words; Chinese uses CJK char density. */
const MIN_EN_WORDS = 50;
const MIN_CJK = 70;

const PDP_LEDES: Record<string, { "en-US": string; "zh-CN": string }> = {
  "mpillow-basic": {
    "en-US":
      "Mpillow Basic is Singapore's entry customisable cervical pillow for everyday neck support and better sleep posture. Configure core size and fit options online, then refine in-store if you want a guided fitting with our team. It is designed for ergonomic alignment and washable modular upkeep — a practical custom pillow when you are ready to leave one-size foam behind.",
    "zh-CN":
      "Mpillow Basic 是新加坡入门级可定制颈椎枕，适合日常颈托需求与更好睡姿。可先在线配置核心尺寸与贴合选项，需要时再到店由顾问微调。面向人体工学对齐与可水洗模块化维护——当你准备告别一刀切泡沫枕时的实用定制选择。",
  },
  "mpillow-premium": {
    "en-US":
      "Mpillow Premium is Singapore's full custom-fit cervical pillow, measured and adjusted in-store for your neck curve, sleep style, and body build. Choose size, cover, and support options, then book a fitting for precise cervical alignment. Built for neck pain relief, modular serviceability, and long-term comfort that goes well beyond one-size foam.",
    "zh-CN":
      "Mpillow Premium 是新加坡全贴合定制颈椎枕，按颈曲、睡姿与体型在店内测量并微调。可选尺寸、面料与支撑配件，再预约试配以获得更精准对齐。专为缓解颈椎不适、模块化维护与长期舒适而设计，超越一刀切泡沫枕。",
  },
  mbolster: {
    "en-US":
      "Mbolster is Mpillow's custom-length support bolster for side sleepers in Singapore who want hug-sleep comfort with real structure. Pick short, medium, or long to match your body, choose a washable case, and order online for delivery. It supports hip–spine alignment using the same ergonomic approach as our cervical pillows so your sleep setup stays consistent.",
    "zh-CN":
      "Mbolster 是 Mpillow 为新加坡侧睡者推出的定制长度支撑抱枕，适合需要结构感的环抱睡姿。按身形选择短、中或长，挑选可洗面料后在线下单。用于髋部与脊柱对齐，理念与我们的颈椎枕一致，让整套睡眠配置保持统一。",
  },
};

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function enWords(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

function cjkChars(s: string) {
  return (s.match(/[\u4e00-\u9fff]/g) ?? []).length;
}

function assertEnLede(label: string, text: string) {
  const w = enWords(text);
  assert.ok(w >= MIN_EN_WORDS, `${label} en lede too short (${w} words, need ~${MIN_EN_WORDS}+)`);
  assert.ok(w <= 140, `${label} en lede too long (${w} words)`);
}

function assertZhLede(label: string, text: string) {
  const n = cjkChars(text);
  assert.ok(n >= MIN_CJK, `${label} zh lede too thin (${n} CJK chars, need ~${MIN_CJK}+)`);
}

function isWeakEn(seoAnswer: string | undefined) {
  return !seoAnswer?.trim() || enWords(seoAnswer) < 40;
}

function isWeakZh(seoAnswer: string | undefined) {
  return !seoAnswer?.trim() || cjkChars(seoAnswer) < 40;
}

function extractIntroLede(pageSrc: string, locale: "en-US" | "zh-CN") {
  const block =
    locale === "en-US"
      ? pageSrc.match(/"en-US":\s*\{[\s\S]*?lede:\s*"((?:\\.|[^"\\])*)"/)?.[1]
      : pageSrc.match(/"zh-CN":\s*\{[\s\S]*?lede:\s*"((?:\\.|[^"\\])*)"/)?.[1];
  assert.ok(block, `missing ${locale} lede in page source`);
  return block!.replace(/\\n/g, "\n").replace(/\\"/g, '"');
}

// --- No new TL;DR component ---
assert.doesNotMatch(read("lib/seo/answer-lede.ts"), /tldr|TL;DR/i);
const componentFiles = readdirSync(join(ROOT, "components"), { recursive: true }).map(String);
assert.ok(!componentFiles.some((f) => /tldr/i.test(f)), "no new TL;DR component file");

// --- Wiring: home / PDP / configs use existing answer-lede fields ---
assert.match(read("components/sections/landing/hero-section.tsx"), /m\.home\.hero\.seoAnswer/);
assert.match(read("app/[lang]/shop/[slug]/page.tsx"), /resolveAnswerLede/);
assert.match(read("app/[lang]/shop/[slug]/product-detail-client.tsx"), /answerLede/);
assert.match(read("app/[lang]/mp-config/page.tsx"), /answerLede=\{intro\.lede\}/);
assert.match(read("app/[lang]/mbolster-config/page.tsx"), /answerLede=\{intro\.lede\}/);
assert.match(read("components/seo/configurator-seo-intro.tsx"), /answerLede/);

// --- Home i18n density ---
assertEnLede("home", enUS.home.hero.seoAnswer);
assertZhLede("home", zhCN.home.hero.seoAnswer);

// --- Configurator shell density ---
const mpSrc = read("app/[lang]/mp-config/page.tsx");
const mbSrc = read("app/[lang]/mbolster-config/page.tsx");
assertEnLede("mp-config", extractIntroLede(mpSrc, "en-US"));
assertZhLede("mp-config", extractIntroLede(mpSrc, "zh-CN"));
assertEnLede("mbolster-config", extractIntroLede(mbSrc, "en-US"));
assertZhLede("mbolster-config", extractIntroLede(mbSrc, "zh-CN"));

// ConfiguratorSeoIntro still renders lede under H1 (crawlable)
const introHtml = renderToStaticMarkup(
  createElement(ConfiguratorSeoIntro, {
    h1: "Customise Your Mpillow Pillow",
    answerLede: extractIntroLede(mpSrc, "en-US"),
    jsonLd: { "@type": "Product", name: "Mpillow" },
  })
);
assert.match(introHtml, /<h1/);
assert.match(introHtml, /Customise your Mpillow cervical pillow/);

async function fillAndAssertProducts() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("products")
    .select("id, slug, content")
    .eq("status", "active");
  if (error) throw error;
  assert.ok((data?.length ?? 0) >= 1, "expected active products");

  const filled: string[] = [];
  for (const row of data ?? []) {
    const seed = PDP_LEDES[row.slug];
    const content = { ...(row.content as Record<string, LocalizedProductContent>) };
    let changed = false;

    for (const locale of ["en-US", "zh-CN"] as const) {
      const loc = { ...(content[locale] ?? { title: row.slug }) };
      const weak = locale === "en-US" ? isWeakEn(loc.seo_answer) : isWeakZh(loc.seo_answer);
      if (seed && weak) {
        loc.seo_answer = seed[locale];
        content[locale] = loc;
        changed = true;
      }
    }

    if (changed) {
      const { error: upErr } = await admin.from("products").update({ content }).eq("id", row.id);
      if (upErr) throw upErr;
      filled.push(row.slug);
    }

    // Re-read path: assert dedicated seo_answer resolves
    const en = content["en-US"];
    const zh = content["zh-CN"];
    assert.ok(en?.seo_answer?.trim(), `${row.slug} missing en-US seo_answer`);
    assert.ok(zh?.seo_answer?.trim(), `${row.slug} missing zh-CN seo_answer`);
    assertEnLede(row.slug, en!.seo_answer!);
    assertZhLede(row.slug, zh!.seo_answer!);

    const lede = resolveAnswerLede({
      seo_answer: en!.seo_answer,
      seo_description: en!.seo_description,
      description: en!.description,
    });
    assert.equal(lede, en!.seo_answer!.trim());
  }

  return filled;
}

async function main() {
  const filled = await fillAndAssertProducts();
  console.log(
    "answer-lede-coverage self-check ok" +
      (filled.length ? ` (filled: ${filled.join(", ")})` : " (PDP seo_answer already present)")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
