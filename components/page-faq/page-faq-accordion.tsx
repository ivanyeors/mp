"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FaqAnswer } from "@/components/marketing/faq-content";
import type { Locale } from "@/lib/i18n/locales";

export type PageFaqAccordionItem = {
  id: string;
  slug: string;
  question: string;
  answer: string;
};

export function PageFaqAccordion({
  items,
  locale,
}: {
  items: PageFaqAccordionItem[];
  locale: Locale;
}) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.slug} id={item.slug}>
          <AccordionTrigger className="text-base font-medium hover:no-underline">
            {item.question}
          </AccordionTrigger>
          <AccordionContent forceMount>
            <FaqAnswer answer={item.answer} locale={locale} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
