import { StoriesSectionClient } from "@/components/sections/stories-section-client";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";
import { FALLBACK_TESTIMONIALS, type Testimonial } from "@/lib/google/fallback-testimonials";

const DEFAULT_WRITE_REVIEW_URL = "https://share.google/92zAQnQWGM1SBCFh9";

export async function StoriesSection({
  title,
  subtitle,
  preview = false,
}: {
  title: string;
  subtitle: string;
  /** Preview mode reloads on every edit; the Places call is paid and cached, so skip it. */
  preview?: boolean;
}) {
  let testimonials: Testimonial[] = [];
  if (!preview) {
    try {
      testimonials = await getGooglePlaceTestimonials({ limit: 20 });
    } catch {
      testimonials = [];
    }
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
