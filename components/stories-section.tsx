import { StoriesSectionClient } from "@/components/stories-section-client";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";
import { FALLBACK_TESTIMONIALS, type Testimonial } from "@/lib/google/fallback-testimonials";

const DEFAULT_WRITE_REVIEW_URL = "https://share.google/92zAQnQWGM1SBCFh9";

export async function StoriesSection() {
  let testimonials: Testimonial[] = [];
  try {
    testimonials = await getGooglePlaceTestimonials({ limit: 20 });
  } catch {
    testimonials = [];
  }

  return (
    <StoriesSectionClient
      title="Hear from our customers"
      subtitle="Latest reviews from Google."
      testimonials={testimonials.length ? testimonials : FALLBACK_TESTIMONIALS}
      writeReviewUrl={DEFAULT_WRITE_REVIEW_URL}
    />
  );
}

