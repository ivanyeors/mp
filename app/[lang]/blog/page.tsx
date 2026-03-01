import { getBlogPostsFromDb } from "@/lib/blogs";
import Link from "next/link";
import Image from "next/image";
import { Metadata } from "next";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

export const metadata: Metadata = {
    title: "Mpillow Blogs | Better Sleep Guidance from the Experts",
    description:
        "Read our latest articles on improving sleep posture, neck pain relief, and choosing the perfect pillow in Singapore.",
    openGraph: {
        title: "Mpillow Blogs",
        description: "Expert advice on sleep and ergonomics.",
        type: "website",
    },
};

type Props = { params: Promise<{ lang: string }> };

export default async function BlogHubPage({ params }: Props) {
    const { lang } = await params;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const posts = await getBlogPostsFromDb({ locale, status: "published" });

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Mpillow Blogs",
        description: metadata.description,
        url: "https://www.mpillow.com/blog",
        hasPart: posts.slice(0, 10).map((post) => ({
            "@type": "Article",
            headline: post.title,
            url: `https://www.mpillow.com/blog/${post.slug}`,
        })),
    };

    return (
        <div className="space-y-12">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />

            <section className="text-center max-w-3xl mx-auto mb-16">
                <h1 className="text-5xl font-extrabold tracking-tight mb-6">
                    Explore <span className="text-primary">Mpillow</span> Blogs
                </h1>
                <p className="text-xl text-muted-foreground">
                    Expert advice, sleep science, and guides on finding the perfect customizable pillow for your needs.
                </p>
            </section>

            {posts.length === 0 ? (
                <p className="text-center text-muted-foreground text-lg py-20">No blog posts yet. Check back soon!</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {posts.map((post) => (
                        <Link
                            href={withLocale(`/blog/${post.slug}`, locale)}
                            key={post.slug}
                            className="group block h-full"
                        >
                            <article className="h-full flex flex-col bg-card rounded-2xl border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
                                <div className="relative w-full h-56 bg-muted overflow-hidden">
                                    {post.image_url ? (
                                        <Image
                                            src={post.image_url}
                                            alt={post.title}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/50">
                                            No Image
                                        </div>
                                    )}
                                </div>
                                <div className="p-6 flex flex-col flex-1">
                                    {post.published_at && (
                                        <time className="text-sm text-muted-foreground mb-3 font-medium">
                                            {new Date(post.published_at).toLocaleDateString("en-US", {
                                                year: "numeric",
                                                month: "long",
                                                day: "numeric",
                                            })}
                                        </time>
                                    )}
                                    <h2 className="text-2xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                                        {post.title}
                                    </h2>
                                    <p className="text-muted-foreground line-clamp-3 mb-6 flex-1">
                                        {post.description || post.body.substring(0, 150) + "..."}
                                    </p>
                                    <div className="mt-auto flex items-center text-sm font-semibold text-primary">
                                        Read Article{" "}
                                        <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                                    </div>
                                </div>
                            </article>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
