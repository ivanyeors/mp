export type Testimonial = {
  quote: string;
  name: string;
  title: string;
  avatarSrc?: string;
  avatarAlt?: string;
  rating?: number;
  publishedAt?: string;
};

export const FALLBACK_TESTIMONIALS: Testimonial[] = [
  {
    quote: "I didn’t realize how much my pillow affected my posture. After switching, my neck feels supported and I wake up less stiff.",
    name: "Sarah Johnson",
    title: "Product Manager",
    avatarSrc: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400&h=400",
    avatarAlt: "Sarah Johnson",
    rating: 5,
  },
  {
    quote: "The adjustable feel is the best part. I can tune it to my sleep position and it stays comfortable through the night.",
    name: "Michael Chen",
    title: "Software Engineer",
    avatarSrc: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400&h=400",
    avatarAlt: "Michael Chen",
    rating: 5,
  },
  {
    quote: "It feels thoughtfully designed. Small details make a big difference — especially if you’re picky about pillow height.",
    name: "Emily Rodriguez",
    title: "UX Designer",
    avatarSrc: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=400&h=400",
    avatarAlt: "Emily Rodriguez",
    rating: 5,
  },
  {
    quote: "I’ve tried countless options for neck discomfort. This is the first one that consistently supports me without feeling too firm.",
    name: "David Park",
    title: "Marketing Director",
    avatarSrc: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400&h=400",
    avatarAlt: "David Park",
    rating: 5,
  },
  {
    quote: "Worth it for the sleep quality alone. I wake up feeling more refreshed — and I love that it’s washable and easy to maintain.",
    name: "Lisa Thompson",
    title: "Freelance Developer",
    avatarSrc: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&q=80&w=400&h=400",
    avatarAlt: "Lisa Thompson",
    rating: 5,
  },
];

