import { StoriesSection } from "@/components/sections/stories-section";
import type { Messages } from "@/lib/i18n/messages/types";

export function StoriesSectionWrapper({ messages }: { messages: Messages }) {
  return (
    <section id="stories" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <StoriesSection title={messages.home.stories.title} subtitle={messages.home.stories.subtitle} />
      </div>
    </section>
  );
}
