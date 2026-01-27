import { NextResponse } from "next/server";
import { getGooglePlaceTestimonials } from "@/lib/google/places-reviews";

export const revalidate = 60 * 60; // 1 hour

export async function GET() {
  const reviews = await getGooglePlaceTestimonials({ limit: 6, revalidateSeconds: revalidate });
  return NextResponse.json({ reviews });
}

