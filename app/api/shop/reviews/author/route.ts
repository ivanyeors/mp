import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { shopReviewByline, type ReviewAuthorState } from "@/lib/reviews/shop-review-byline";

export const runtime = "nodejs";

/**
 * Who the shopper on a product page would review as, read by its review form
 * (app/[lang]/shop/[slug]/product-reviews.tsx) before it shows itself. The
 * product page is the same for everyone, so the session is read here rather
 * than there. Same checks, in the same order, as POST /api/shop/reviews, which
 * still enforces them: this only lets the form say so up front.
 *
 * Always 200: being signed out is an answer, not an error.
 */
export async function GET() {
  const answer = (state: ReviewAuthorState) =>
    NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });

  const user = await getAuthUser();
  if (!user) return answer({ signedIn: false });
  // A Customer is linked by email; an account without one has none to link.
  if (!user.email) return answer({ signedIn: true, canReview: false, reason: "no_email" });

  const customer = await linkCustomerToAuthUser(user).catch(() => null);
  if (!customer) return answer({ signedIn: true, canReview: false, reason: "unavailable" });
  return answer({
    signedIn: true,
    canReview: true,
    byline: shopReviewByline(customer),
    named: Boolean(customer.first_name?.trim()),
  });
}
