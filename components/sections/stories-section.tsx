import { StoriesSectionClient } from "@/components/sections/stories-section-client";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";
import { FALLBACK_TESTIMONIALS, type Testimonial } from "@/lib/google/fallback-testimonials";

const DEFAULT_WRITE_REVIEW_URL = "https://share.google/92zAQnQWGM1SBCFh9";

export async function StoriesSection({ title, subtitle }: { title: string; subtitle: string }) {
  let testimonials: Testimonial[] = [];
  try {
    testimonials = await getGooglePlaceTestimonials({ limit: 20 });
  } catch {
    testimonials = [];
  }

  return (
    <StoriesSectionClient
      title={title}
      subtitle={subtitle}
      testimonials={testimonials.length ? testimonials : FALLBACK_TESTIMONIALS}
      writeReviewUrl={DEFAULT_WRITE_REVIEW_URL}
    />
  );
}
