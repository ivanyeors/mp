alter table blog_posts add column labels text[] not null default '{}';
create index if not exists idx_blog_posts_labels on blog_posts using gin (labels);
