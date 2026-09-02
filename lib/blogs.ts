import { supabaseAdmin } from '@/lib/supabase/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';

// ---------- Types ----------

export type BlogLocalizedContent = {
    title: string;
    sub_header?: string;
    description: string;
    body: string;
    seo_answer?: string;
    seo_keywords?: string[];
};

export type BlogPostRow = {
    id: string;
    slug: string;
    status: 'draft' | 'published' | 'unpublished';
    content: Record<string, BlogLocalizedContent>;
    image_url: string | null;
    author: string;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    labels: string[];
};

/** Flattened blog post for rendering (already resolved to a specific locale). */
export type BlogPost = {
    id: string;
    slug: string;
    status: string;
    title: string;
    sub_header: string;
    description: string;
    body: string;
    image_url: string | null;
    author: string;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    seo_keywords: string[];
    seo_answer?: string;
    labels: string[];
};

// ---------- Supabase fetchers ----------

function resolveLocale(row: BlogPostRow, locale: string): BlogPost {
    const loc = row.content[locale] ?? row.content[DEFAULT_LOCALE] ?? Object.values(row.content)[0];
    return {
        id: row.id,
        slug: row.slug,
        status: row.status,
        title: loc?.title ?? '',
        sub_header: loc?.sub_header ?? '',
        description: loc?.description ?? '',
        body: loc?.body ?? '',
        seo_answer: loc?.seo_answer,
        image_url: row.image_url,
        author: row.author,
        published_at: row.published_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        seo_keywords: loc?.seo_keywords ?? [],
        labels: row.labels ?? [],
    };
}

export async function getBlogPostsFromDb(opts?: { locale?: string; status?: string }): Promise<BlogPost[]> {
    const locale = opts?.locale ?? DEFAULT_LOCALE;
    const admin = supabaseAdmin();
    let query = admin.from('blog_posts').select('*').order('published_at', { ascending: false, nullsFirst: false });

    if (opts?.status) {
        query = query.eq('status', opts.status);
    }

    const { data, error } = await query;
    if (error) {
        console.error('getBlogPostsFromDb error:', error.message);
        return [];
    }
    return (data as BlogPostRow[]).map((row) => resolveLocale(row, locale));
}

export async function getBlogPostBySlugFromDb(slug: string, locale?: string): Promise<BlogPost | null> {
    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error || !data) return null;
    return resolveLocale(data as BlogPostRow, locale ?? DEFAULT_LOCALE);
}

export async function getAllBlogPostsRaw(): Promise<BlogPostRow[]> {
    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from('blog_posts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('getAllBlogPostsRaw error:', error.message);
        return [];
    }
    return (data ?? []) as BlogPostRow[];
}


// ---------- Admin (settings) fetchers ----------

/** The columns the admin blogs list renders. */
export type AdminBlogListRow = Pick<
    BlogPostRow,
    'id' | 'slug' | 'status' | 'content' | 'image_url' | 'author' | 'published_at' | 'created_at'
>;

/**
 * Rows for the admin blogs list, newest first. Only the columns the list
 * renders (content carries the localized title); capped so it can never grow
 * unbounded. Throws on a Supabase error so callers can map it to a status.
 */
export async function listAdminBlogPosts(status?: string | null): Promise<AdminBlogListRow[]> {
    const admin = supabaseAdmin();
    let query = admin
        .from('blog_posts')
        .select('id, slug, status, content, image_url, author, published_at, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminBlogListRow[];
}

/** One blog post by id for the admin editor; `error` mirrors the Supabase message. */
export async function getAdminBlogPostById(
    id: string,
): Promise<{ row: BlogPostRow | null; error: string | null }> {
    const admin = supabaseAdmin();
    const { data, error } = await admin.from('blog_posts').select('*').eq('id', id).single();
    if (error) return { row: null, error: error.message };
    return { row: data as BlogPostRow, error: null };
}
