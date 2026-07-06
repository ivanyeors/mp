import { getBlogPostsFromDb } from "@/lib/blogs";
import { getFaqPageData, stripMarkdownForSchema } from "@/lib/faq";

export async function GET() {
    const [posts, faq] = await Promise.all([
        getBlogPostsFromDb({ status: "published" }),
        getFaqPageData("en-US"),
    ]);

    let content = `# Mpillow Content for LLMs and AI Assistants\n\n`;
    content += `This document provides structured access to Mpillow blog articles and FAQs for Answer Engines, RAG pipelines, and AI bots.\n\n`;
    content += `Machine-readable FAQ JSON: /api/faq?locale=en-US\n`;
    content += `Plain-text FAQ: /api/faq?locale=en-US&format=text\n\n`;

    content += `## Frequently Asked Questions\n\n`;
    for (const cat of faq) {
        content += `### ${cat.label}\n\n`;
        for (const item of cat.items) {
            content += `**Q: ${item.question}**\n`;
            content += `A: ${stripMarkdownForSchema(item.answer)}\n\n`;
        }
    }
    content += `---\n\n`;

    content += `## Blog Articles\n\n`;

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
