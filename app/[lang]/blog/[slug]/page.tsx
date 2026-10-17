import { getBlogPostBySlugFromDb, getBlogPostsFromDb } from "@/lib/blogs";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import {
    buildPageMetadata,
    buildArticleJsonLd,
    buildArticleBreadcrumbJsonLd,
    resolveAnswerLede,
    resolveMetaDescription,
} from "@/lib/seo";
import { pickRelatedPosts } from "@/lib/blog-related";
import { JsonLdScript } from "@/components/seo/json-ld-script";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Props = {
    params: Promise<{ lang: string; slug: string }>;
};

export async function generateStaticParams() {
    const posts = await getBlogPostsFromDb({ status: "published" });
    return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { lang, slug } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const post = await getBlogPostBySlugFromDb(slug, locale);
    if (!post || post.status !== "published") return {};

    // A locale with no translation shows the default-locale text, so it canonicalises there.
    return buildPageMetadata({
        title: post.title,
        description: resolveMetaDescription(post),
        path: `/blog/${slug}`,
        lang: post.content_locale,
        alternateLocales: post.locales,
        image: post.image_url,
        keywords: post.seo_keywords,
        type: "article",
    });
}

export default async function BlogPostPage({ params }: Props) {
    const { lang, slug } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const post = await getBlogPostBySlugFromDb(slug, locale);

    // Drafts and unpublished posts are not public, even by direct URL.
    if (!post || post.status !== "published") notFound();

    const related = pickRelatedPosts(post, await getBlogPostsFromDb({ locale, status: "published" }));
    const zh = locale.startsWith("zh");

    const answerLede = resolveAnswerLede({
        seo_answer: post.seo_answer,
        seo_description: post.description,
        description: post.description,
    });

    const articleJsonLd = buildArticleJsonLd({
        lang: post.content_locale,
        slug,
        title: post.title,
        description: resolveMetaDescription(post),
        imageUrl: post.image_url,
        publishedAt: post.published_at,
        contentUpdatedAt: post.content_updated_at,
        author: post.author,
    });

    const breadcrumbJsonLd = buildArticleBreadcrumbJsonLd({
        lang: post.content_locale,
        slug,
        title: post.title,
    });

    return (
        <article className="max-w-4xl mx-auto py-8 lg:py-16 px-4 sm:px-6">
            <JsonLdScript data={articleJsonLd} />
            <JsonLdScript data={breadcrumbJsonLd} />

            <Breadcrumb className="mb-8">
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link href={withLocale("/", locale)}>Home</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link href={withLocale("/blog", locale)}>Blogs</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                        <BreadcrumbPage className="truncate max-w-xs sm:max-w-sm" title={post.title}>
                            {post.title}
                        </BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <header className="mb-12">
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
                    {post.title}
                </h1>
                {answerLede ? (
                    <p className="text-lg leading-relaxed text-muted-foreground mb-4">{answerLede}</p>
                ) : null}
                {post.sub_header && (
                    <p className="text-xl text-muted-foreground mb-6">{post.sub_header}</p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{post.author}</span>
                    {post.published_at && (
                        <time dateTime={post.published_at}>
                            {new Date(post.published_at).toLocaleDateString(locale, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </time>
                    )}
                    {/* Editorial updates only, and only when they land on a later day (slice 17). */}
                    {post.content_updated_at &&
                        (!post.published_at ||
                            Date.parse(post.content_updated_at) - Date.parse(post.published_at) > 86_400_000) && (
                            <span>
                                {zh ? "更新于 " : "Updated "}
                                <time dateTime={post.content_updated_at}>
                                    {new Date(post.content_updated_at).toLocaleDateString(locale, {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </time>
                            </span>
                        )}
                </div>
            </header>

            {post.image_url && (
                <div className="relative aspect-[16/9] mb-12 rounded-2xl overflow-hidden">
                    <Image
                        src={post.image_url}
                        alt={post.title}
                        fill
                        className="object-cover"
                        priority
                        sizes="(min-width: 1024px) 896px, 100vw"
                    />
                </div>
            )}

            <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold">
                <MDXRemote source={post.body} />
            </div>

            <aside aria-labelledby="related-reading" className="mt-16 border-t pt-10">
                <h2 id="related-reading" className="text-2xl font-bold mb-6">
                    {zh ? "相关阅读" : "Related reading"}
                </h2>
                {related.length > 0 && (
                    <ul className="grid gap-4 sm:grid-cols-3 mb-8">
                        {related.map((p) => (
                            <li key={p.id}>
                                <Link
                                    href={withLocale(`/blog/${p.slug}`, locale)}
                                    className="block h-full rounded-xl border p-4 hover:border-primary transition-colors"
                                >
                                    <span className="font-semibold line-clamp-2">{p.title}</span>
                                    <span className="mt-2 block text-sm text-muted-foreground line-clamp-3">
                                        {resolveMetaDescription(p)}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                <Link
                    href={withLocale("/mp-config", locale)}
                    className="font-semibold text-primary hover:underline"
                >
                    {zh ? "定制一个按您身形测量的枕头 →" : "Build a pillow fitted to your measurements →"}
                </Link>
            </aside>
        </article>
    );
}
