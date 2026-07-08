import type { ImageMediaConfig } from "./types";

export type FeatureCarouselItem = {
  title: string;
  description: string;
  image: ImageMediaConfig;
};

export function buildFeatureCarouselItems(
  features: Array<{ title: string; description: string }>,
  images: ImageMediaConfig[],
): FeatureCarouselItem[] {
  if (features.length !== images.length) {
    throw new Error(
      `feature-carousel-items: expected ${features.length} images, got ${images.length}`,
    );
  }

  return features.map((feature, index) => ({
    title: feature.title,
    description: feature.description,
    image: images[index]!,
  }));
}
