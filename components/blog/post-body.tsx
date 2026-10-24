import { Children, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { headingId } from "@/lib/blog-structure";

function textOf(node: ReactNode): string {
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
    return Children.toArray(node).map(textOf).join("");
}

/**
 * Post bodies are parsed as plain Markdown, not MDX, so a stray `<` or `{` in
 * staff copy renders as text instead of breaking the page. GFM adds tables.
 */
export const POST_MDX_OPTIONS = { mdxOptions: { format: "md" as const, remarkPlugins: [remarkGfm] } };

/** `##`/`###` get ids that match the table of contents; site links stay in the reader's locale. */
export function postComponents(locale: Locale) {
    return {
        h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => (
            <h2 id={headingId(textOf(children))} className="scroll-mt-24" {...props}>
                {children}
            </h2>
        ),
        h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => (
            <h3 id={headingId(textOf(children))} className="scroll-mt-24" {...props}>
                {children}
            </h3>
        ),
        a: ({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) =>
            href.startsWith("/") ? (
                <Link href={withLocale(href, locale)} {...props}>
                    {children}
                </Link>
            ) : (
                <a href={href} {...props}>
                    {children}
                </a>
            ),
        table: (props: ComponentPropsWithoutRef<"table">) => (
            <div className="overflow-x-auto">
                <table {...props} />
            </div>
        ),
    };
}

export function PostBody({ source, locale }: { source: string; locale: Locale }) {
    return <MDXRemote source={source} components={postComponents(locale)} options={POST_MDX_OPTIONS} />;
}
