import type { BlogPost } from "@/lib/blogs";

// Words nearly every slug shares, so they say nothing about the topic.
const GENERIC = new Set(
  "the and for with your you how why what which that this from into can help helps better best sleep sleeping pillow pillows guide ultimate good night nights right singapore mpillow more than just one need really does are amp".split(
    " ",
  ),
);

function topicWords(slug: string): Set<string> {
  return new Set(slug.split("-").filter((word) => word.length >= 3 && !GENERIC.has(word)));
}

function overlap<T>(a: Iterable<T>, b: Set<T>): number {
  let n = 0;
  for (const item of a) if (b.has(item)) n++;
  return n;
}

/**
 * Up to `limit` other published posts to link from a post: shared labels count
 * most, then shared topic words in the slug; ties and any shortfall go to the
 * newest. None of the 91 imported posts links to another post.
 */
export function pickRelatedPosts(current: BlogPost, candidates: BlogPost[], limit = 3): BlogPost[] {
  const labels = new Set(current.labels);
  const words = topicWords(current.slug);
  const newest = (p: BlogPost) => (p.published_at ? Date.parse(p.published_at) : 0);

  return candidates
    .filter((p) => p.slug !== current.slug)
    .map((p) => ({ p, score: 3 * overlap(p.labels, labels) + overlap(topicWords(p.slug), words) }))
    .sort((a, b) => b.score - a.score || newest(b.p) - newest(a.p))
    .slice(0, limit)
    .map(({ p }) => p);
}
