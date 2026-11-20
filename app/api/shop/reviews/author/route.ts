import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { linkCustomerToAuthUser } from "@/lib/auth/customer-identity";
import { shopReviewByline, type ReviewAuthorState } from "@/lib/reviews/shop-review-byline";

export const runtime = "nodejs";

export async function GET() {
  const answer = (state: ReviewAuthorState) =>
    NextResponse.json(state, { headers: { "Cache-Control": "private, no-store" } });

  const user = await getAuthUser();
  if (!user) return answer({ signedIn: false });
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
