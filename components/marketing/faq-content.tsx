"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Search } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import type { FaqCategoryWithItems } from "@/lib/faq";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";

type FaqContentProps = {
  categories: FaqCategoryWithItems[];
  locale: Locale;
  initialSlug?: string;
};

export function FaqAnswer({ answer, locale }: { answer: string; locale: Locale }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          const isInternal = href?.startsWith("/");
          if (isInternal && href) {
            return (
              <Link href={withLocale(href, locale)} className="underline underline-offset-4">
                {children}
              </Link>
            );
          }
          return (
            <a
              href={href}
              className="underline underline-offset-4"
              rel="noopener noreferrer"
              target="_blank"
            >
              {children}
            </a>
          );
        },
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-muted-foreground">{children}</p>,
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-muted-foreground">{children}</ol>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-muted-foreground">{children}</ul>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      }}
    >
      {answer}
    </ReactMarkdown>
  );
}

export function FaqContent({ categories, locale, initialSlug }: FaqContentProps) {
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | undefined>(initialSlug);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;

    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, query]);

  useEffect(() => {
    if (!initialSlug) return;
    setOpenSlug(initialSlug);
    const el = document.getElementById(initialSlug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialSlug]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) setOpenSlug(hash);
  }, []);

  const searchPlaceholder =
    locale === "zh-CN" ? "搜索常见问题…" : "Search frequently asked questions…";
  const noResults = locale === "zh-CN" ? "没有匹配的问题。" : "No matching questions found.";

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
          aria-label={searchPlaceholder}
        />
      </div>

      <nav aria-label="FAQ categories" className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <a
            key={cat.key}
            href={`#${cat.key}`}
            className="shrink-0 rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {cat.label}
          </a>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground">{noResults}</p>
      ) : (
        filtered.map((cat) => (
          <section key={cat.id} id={cat.key} className="scroll-mt-24 space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">{cat.label}</h2>
            <Accordion
              type="single"
              collapsible
              value={openSlug}
              onValueChange={setOpenSlug}
              className="w-full"
            >
              {cat.items.map((item) => (
                <AccordionItem key={item.id} value={item.slug} id={item.slug}>
                  <AccordionTrigger className="text-base font-medium hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <FaqAnswer answer={item.answer} locale={locale} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))
      )}
    </div>
  );
}
