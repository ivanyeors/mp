import { getBlogPostsFromDb } from "@/lib/blogs";

export async function GET() {
    const posts = await getBlogPostsFromDb({ status: "published" });
    let content = `# Mpillow Blogs Content for LLMs and AI Assistants\n\n`;
    content += `This document provides full-text access to Mpillow's blog articles to assist Answer Engines, RAG pipelines, and AI bots.\n\n`;

    posts.forEach((post) => {
        content += `## ${post.title}\n`;
        if (post.published_at) content += `**Published:** ${new Date(post.published_at).toLocaleDateString()}\n`;
        content += `**Author:** ${post.author}\n`;
        content += `**URL:** https://www.mpillow.com/blog/${post.slug}\n\n`;
        if (post.description) content += `${post.description}\n\n`;
        content += `### Full Content\n${post.body}\n\n---\n\n`;
    });

    return new Response(content, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=43200",
        },
    });
}
