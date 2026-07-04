import { getBlogPostBySlugFromDb, getBlogPostsFromDb } from "@/lib/blogs";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
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
    if (!post) return {};

    return {
        title: post.title,
        description: post.description,
        openGraph: {
            title: post.title,
            description: post.description,
            type: "article",
            publishedTime: post.published_at ?? undefined,
            modifiedTime: post.updated_at,
            authors: [post.author],
            images: post.image_url ? [{ url: post.image_url }] : [],
        },
    };
}

export default async function BlogPostPage({ params }: Props) {
    const { lang, slug } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const post = await getBlogPostBySlugFromDb(slug, locale);

    if (!post) notFound();

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: post.title,
        description: post.description,
        image: post.image_url ? [post.image_url] : [],
        datePublished: post.published_at,
        dateModified: post.updated_at,
        author: { "@type": "Person", name: post.author },
        publisher: {
            "@type": "Organization",
            name: "Mpillow",
            logo: { "@type": "ImageObject", url: "https://www.mpillow.com/logo.png" },
        },
    };

    const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://www.mpillow.com" },
            { "@type": "ListItem", position: 2, name: "Blogs", item: "https://www.mpillow.com/blog" },
            {
                "@type": "ListItem",
                position: 3,
                name: post.title,
                item: `https://www.mpillow.com/blog/${slug}`,
            },
        ],
    };

    return (
        <article className="max-w-4xl mx-auto py-8 lg:py-16 px-4 sm:px-6">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
            />

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
                {post.sub_header && (
                    <p className="text-xl text-muted-foreground mb-6">{post.sub_header}</p>
                )}

                <div className="flex items-center space-x-4 text-muted-foreground mb-8">
                    <div className="flex items-center space-x-2">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                            {post.author.charAt(0)}
                        </div>
                        <div>
                            <p className="font-semibold text-foreground">{post.author}</p>
                            {post.published_at && (
                                <time dateTime={post.published_at} className="text-sm">
                                    {new Date(post.published_at).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </time>
                            )}
                        </div>
                    </div>
                </div>

                {post.image_url && (
                    <div className="relative w-full aspect-video rounded-3xl overflow-hidden shadow-2xl mb-12">
                        <Image src={post.image_url} alt={post.title} fill className="object-cover" priority />
                    </div>
                )}
            </header>

            <div className="prose prose-lg dark:prose-invert prose-headings:font-bold prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-xl prose-img:shadow-lg max-w-none">
                <MDXRemote source={post.body} />
            </div>

            <footer className="mt-24 pt-12 border-t flex justify-between items-center">
                <div>
                    <h3 className="text-2xl font-bold mb-4">Enjoyed this article?</h3>
                    <p className="text-muted-foreground">Check out more insights on our main blog page.</p>
                </div>
                <Link
                    href={withLocale("/blog", locale)}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-all shadow-md hover:shadow-xl"
                >
                    Back to Blogs
                </Link>
            </footer>
        </article>
    );
}
