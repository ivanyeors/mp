-- Editorial "last updated" for blog posts (PRD-search-visibility, slice 17).
--
-- `updated_at` moves on every write (status flips, image swaps, bulk syncs), and
-- was used as Article dateModified — so one sync made all 91 posts look freshly
-- updated. `content_updated_at` is set only when the text a reader sees changes,
-- by PATCH /api/blogs/[id]. Null means "never edited since publishing".
alter table blog_posts add column if not exists content_updated_at timestamptz;
