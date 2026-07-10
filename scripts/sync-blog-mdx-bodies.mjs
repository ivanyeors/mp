/**
 * Sync retrofitted data/blogs/*.mdx bodies into blog_posts.content (en-US).
 * Run: node --env-file=.env.local scripts/sync-blog-mdx-bodies.mjs
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const SLUGS = [
  "what-is-the-best-pillow-for-neck-pain-in-singapore",
  "how-to-choose-the-best-pillow-in-singapore",
  "finding-the-perfect-neck-support-pillow-in-singapore",
  "neck-support-pillows-in-singapore-your-key-to-comfortable-sleep",
  "what-is-tech-neck-and-how-can-a-pillow-help-fix-it-in-singapore",
  "cervical-pillow-for-neck-pain-a-comprehensive-guide",
  "the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief",
  "top-5-pillows-for-neck-pain-relief-what-to-look-for-and-why-it-matters",
  "ergonomic-pillow-vs-regular-pillow-is-it-worth-the-investment",
  "the-complete-guide-to-choosing-the-right-bolster-in-singapore",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const dir = path.join(process.cwd(), "data/blogs");

let ok = 0;
for (const slug of SLUGS) {
  const file = path.join(dir, `${slug}.mdx`);
  if (!fs.existsSync(file)) {
    console.warn(`skip missing file: ${slug}`);
    continue;
  }
  const { data: fm, content: body } = matter(fs.readFileSync(file, "utf8"));

  const { data: row, error: fetchErr } = await admin
    .from("blog_posts")
    .select("id, content")
    .eq("slug", slug)
    .maybeSingle();

  if (fetchErr) {
    console.error(slug, fetchErr.message);
    continue;
  }
  if (!row) {
    console.warn(`skip not in DB: ${slug}`);
    continue;
  }

  const content = { ...(row.content ?? {}) };
  const en = { ...(content["en-US"] ?? {}) };
  en.body = body.trim() + "\n";
  if (typeof fm.description === "string" && fm.description.trim()) {
    en.description = fm.description.trim();
  }
  if (typeof fm.title === "string" && fm.title.trim()) {
    en.title = fm.title.trim();
  }
  content["en-US"] = en;

  const { error: updErr } = await admin
    .from("blog_posts")
    .update({ content })
    .eq("id", row.id);

  if (updErr) {
    console.error(slug, updErr.message);
    continue;
  }
  ok++;
  console.log(`synced ${slug} (${(en.body.match(/^## /gm) || []).length} ##)`);
}

console.log(`done: ${ok}/${SLUGS.length}`);
