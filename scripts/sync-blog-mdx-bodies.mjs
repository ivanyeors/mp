/**
 * Sync data/blogs/*.mdx into blog_posts.content["en-US"]: title, description,
 * body, seo_answer and keywords from each file, plus the author.
 * Only rows whose text changes are written, and those get content_updated_at,
 * so dateModified moves on an editorial change and on nothing else (slice 17).
 * Every file in data/blogs is a live post; merged and retired posts live in
 * lib/blog-redirects.ts and have no file.
 *
 * Run: node --env-file=.env.local scripts/sync-blog-mdx-bodies.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const dir = path.join(process.cwd(), "data/blogs");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

let changed = 0;
for (const file of files) {
  const slug = file.slice(0, -".mdx".length);
  const { data: fm, content: body } = matter(fs.readFileSync(path.join(dir, file), "utf8"));

  const { data: row, error: fetchErr } = await admin
    .from("blog_posts")
    .select("id, content, author")
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

  const before = row.content?.["en-US"] ?? {};
  const en = {
    ...before,
    body: body.trim() + "\n",
    ...(text(fm.title) && { title: text(fm.title) }),
    ...(text(fm.description) && { description: text(fm.description) }),
    ...(text(fm.seo_answer) && { seo_answer: text(fm.seo_answer) }),
    ...(Array.isArray(fm.keywords) && { seo_keywords: fm.keywords.map(String) }),
  };
  const author = text(fm.author) ?? row.author;
  if (JSON.stringify(en) === JSON.stringify(before) && author === row.author) continue;

  changed++;
  if (dryRun) {
    console.log(`would sync ${slug}`);
    continue;
  }
  const { error: updErr } = await admin
    .from("blog_posts")
    .update({ content: { ...row.content, "en-US": en }, author, content_updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (updErr) console.error(slug, updErr.message);
  else console.log(`synced ${slug} (${(en.body.match(/^## /gm) || []).length} ##)`);
}

console.log(`${dryRun ? "would change" : "changed"}: ${changed}/${files.length}`);
