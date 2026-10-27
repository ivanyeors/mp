import { getBlogPostsFromDb, type BlogPost } from "@/lib/blogs";
import Link from "next/link";
import Image from "next/image";
import { Metadata } from "next";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { BlogFilters } from "@/components/blog/blog-filters";
import { buildPageMetadata, localeUrl, resolveMetaDescription } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld-script";

const BLOG_DESCRIPTION =
    "Read our latest articles on improving sleep posture, neck pain relief, and choosing the perfect pillow in Singapore.";

// ?label= and ?q= views share the one canonical /blog URL.
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
    const { lang } = await params;
    return buildPageMetadata({
        title: "Better sleep guidance from our blog",
        description: BLOG_DESCRIPTION,
        path: "/blog",
        lang: isSupportedLocale(lang) ? lang : DEFAULT_LOCALE,
    });
}

type Props = {
    params: Promise<{ lang: string }>;
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// Reusable Post Card Component
function PostCard({ post, locale }: { post: BlogPost; locale: Locale }) {
    return (
        <Link
            href={withLocale(`/blog/${post.slug}`, locale)}
            className="group block h-full"
        >
            <article className="h-full flex flex-col bg-card rounded-2xl border overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="relative w-full h-56 bg-muted overflow-hidden">
                    {post.image_url ? (
                        <Image
                            src={post.image_url}
                            alt={post.title}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/50">
                            No Image
                        </div>
                    )}
                    {post.labels && post.labels.length > 0 && (
                        <div className="absolute top-4 left-4 flex gap-2 flex-wrap max-w-[80%]">
                            {post.labels.slice(0, 2).map((label) => (
                                <span
                                    key={label}
                                    className="bg-background/90 text-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm"
                                >
                                    {label}
                                </span>
                            ))}
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
                        {resolveMetaDescription(post)}
                    </p>
                    <div className="mt-auto flex items-center text-sm font-semibold text-primary">
                        Read Article{" "}
                        <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                </div>
            </article>
        </Link>
    );
}

export default async function BlogHubPage(props: Props) {
    const params = await props.params;
    const searchParams = await props.searchParams;

    const lang = params.lang;
    const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
    const allPosts = await getBlogPostsFromDb({ locale, status: "published" });

    // Read queries
    const q = typeof searchParams?.q === "string" ? searchParams.q : "";
    const activeLabel = typeof searchParams?.label === "string" ? searchParams.label : "";

    // Filter posts
    let filteredPosts = allPosts;
    if (q) {
        const queryLower = q.toLowerCase();
        filteredPosts = filteredPosts.filter((p) =>
            p.title.toLowerCase().includes(queryLower) ||
            p.description.toLowerCase().includes(queryLower) ||
            p.body.toLowerCase().includes(queryLower)
        );
    }
    if (activeLabel) {
        filteredPosts = filteredPosts.filter((p) => p.labels?.includes(activeLabel));
    }

    const isActiveFilter = q !== "" || activeLabel !== "";

    // Standard Grid View for Filters
    const renderFilteredView = () => (
        <div className="space-y-8">
            <h2 className="text-2xl font-bold">
                {filteredPosts.length} Results{" "}
                {activeLabel && <span className="text-muted-foreground font-normal">for &quot;{activeLabel}&quot;</span>}
                {q && <span className="text-muted-foreground font-normal"> matching &quot;{q}&quot;</span>}
            </h2>
            {filteredPosts.length === 0 ? (
                <p className="text-muted-foreground text-lg py-12">No blog posts found matching your criteria.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredPosts.map((post) => (
                        <PostCard key={post.id} post={post} locale={locale} />
                    ))}
                </div>
            )}
        </div>
    );

    // Grouped Layout for Default View (No filters)
    const renderDefaultView = () => {
        const featuredCount = 3;
        const featuredPosts = allPosts.slice(0, featuredCount);
        const remainingPosts = allPosts.slice(featuredCount);

        const PREDEFINED_CATEGORIES = [
            "Sleep Health",
            "Mpillow Journey",
            "Ergonomics",
            "Neck Pain",
            "Pillow Guide"
        ];

        // Explicitly map posts to our predefined categories
        const sections: Record<string, BlogPost[]> = {};
        PREDEFINED_CATEGORIES.forEach(cat => { sections[cat] = []; });

        remainingPosts.forEach((post) => {
            if (!post.labels || post.labels.length === 0) {
                // Determine a fallback if no labels
                sections["Sleep Health"].push(post);
                return;
            }
            // For explicitly categorizing, we place the post in the first predefined category it matches
            const matchedCategory = post.labels.find(l => PREDEFINED_CATEGORIES.includes(l));
            if (matchedCategory) {
                sections[matchedCategory].push(post);
            } else {
                // Fallback to Sleep Health if an unknown label is present
                sections["Sleep Health"].push(post);
            }
        });

        return (
            <div className="space-y-20">
                {/* Latest / Featured Section */}
                <section>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-8">Latest Articles</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {featuredPosts.map((post) => (
                            <PostCard key={post.id} post={post} locale={locale} />
                        ))}
                    </div>
                </section>

                {/* Explicit Categorized Sections */}
                {PREDEFINED_CATEGORIES.map((labelTitle) => {
                    const categoryPosts = sections[labelTitle];
                    if (!categoryPosts || categoryPosts.length === 0) return null;

                    return (
                        <section key={labelTitle}>
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-2xl font-bold capitalize">{labelTitle}</h3>
                                <Link
                                    href={`?label=${encodeURIComponent(labelTitle)}`}
                                    className="text-primary font-medium hover:underline text-sm"
                                >
                                    View all →
                                </Link>
                            </div>
                            <div className="flex overflow-x-auto pb-8 -mx-4 px-4 snap-x snap-mandatory gap-6 no-scrollbar">
                                {categoryPosts.map((post) => (
                                    <div key={post.id} className="min-w-[320px] max-w-[320px] sm:min-w-[380px] sm:max-w-[380px] snap-start flex-shrink-0">
                                        <PostCard post={post} locale={locale} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        );
    };

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Mpillow Blogs",
        description: BLOG_DESCRIPTION,
        url: localeUrl(locale, "/blog"),
        hasPart: allPosts.slice(0, 10).map((post) => ({
            "@type": "Article",
            headline: post.title,
            url: localeUrl(locale, `/blog/${post.slug}`),
        })),
    };

    return (
        <div className="space-y-12">
            <JsonLdScript data={jsonLd} />

            <section className="text-center max-w-3xl mx-auto mb-12">
                <h1 className="text-5xl font-extrabold tracking-tight mb-6 mt-12">
                    Explore <span className="text-primary">Mpillow</span> Blogs
                </h1>
                <p className="text-xl text-muted-foreground">
                    Expert advice, sleep science, and guides on finding the perfect customizable pillow for your needs.
                </p>
            </section>

            <BlogFilters availableLabels={[
                "Sleep Health",
                "Mpillow Journey",
                "Ergonomics",
                "Neck Pain",
                "Pillow Guide"
            ]} />

            {allPosts.length === 0 ? (
                <p className="text-center text-muted-foreground text-lg py-20">No blog posts yet. Check back soon!</p>
            ) : isActiveFilter ? (
                renderFilteredView()
            ) : (
                renderDefaultView()
            )}
        </div>
    );
}
