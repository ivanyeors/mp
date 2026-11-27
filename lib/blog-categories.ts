export const BLOG_CATEGORIES = [
    "Sleep Health",
    "Mpillow Journey",
    "Ergonomics",
    "Neck Pain",
    "Pillow Guide",
];

export const FALLBACK_BLOG_CATEGORY = "Sleep Health";

type Labelled = { labels?: string[] | null };

export function blogCategory(post: Labelled): string {
    return post.labels?.find((l) => BLOG_CATEGORIES.includes(l)) ?? FALLBACK_BLOG_CATEGORY;
}

export function matchesBlogLabel(post: Labelled, label: string): boolean {
    if (post.labels?.includes(label)) return true;
    return label === FALLBACK_BLOG_CATEGORY && !post.labels?.some((l) => BLOG_CATEGORIES.includes(l));
}

export function blogLabelsInUse(posts: Labelled[]): string[] {
    return BLOG_CATEGORIES.filter((label) => posts.some((p) => matchesBlogLabel(p, label)));
}
