import ReactMarkdown from "react-markdown";
import type { LandingSection, CustomRichTextContent } from "@/lib/types/landing-sections";

interface CustomRichTextSectionProps {
  section: LandingSection;
}

export function CustomRichTextSection({ section }: CustomRichTextSectionProps) {
  const c = section.content as CustomRichTextContent;
  const title = c.title ?? "";
  const body = c.body ?? "";

  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        {title && (
          <h2 className="mb-6 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
        )}
        {body && (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <ReactMarkdown>{body}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
