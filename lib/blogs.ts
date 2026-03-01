import { supabaseAdmin } from '@/lib/supabase/server';
import { DEFAULT_LOCALE } from '@/lib/i18n/locales';

// ---------- Types ----------

export type BlogLocalizedContent = {
    title: string;
    sub_header?: string;
    description: string;
    body: string;
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
        image_url: row.image_url,
        author: row.author,
        published_at: row.published_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        seo_keywords: loc?.seo_keywords ?? [],
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

