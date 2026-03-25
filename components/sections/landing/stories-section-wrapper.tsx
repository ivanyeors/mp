import { StoriesSection } from "@/components/sections/stories-section";

export function StoriesSectionWrapper() {
  return (
    <section id="stories" className="relative">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
        <StoriesSection />
      </div>
    </section>
  );
}
