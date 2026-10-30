/**
 * Who a Shop review says wrote it, and what the storefront's review form is
 * told about the shopper looking at it. Pure, so the form can import the types.
 *
 * The byline always comes from the signed-in Customer's record ("Jane D."),
 * never from the request, so a review can't borrow someone else's name. A
 * Customer with no first name on record gets NAMELESS_REVIEW_BYLINE. The POST
 * that stores a review (app/api/shop/reviews) and the read the form makes first
 * (app/api/shop/reviews/author) both call shopReviewByline, so the form shows
 * exactly the byline that will be stored.
 */

export const NAMELESS_REVIEW_BYLINE = "mpillow customer";

export function shopReviewByline(customer: { first_name: string | null; last_name: string | null }): string {
  const first = customer.first_name?.trim();
  if (!first) return NAMELESS_REVIEW_BYLINE;
  const initial = customer.last_name?.trim()[0];
  return (initial ? `${first} ${initial}.` : first).slice(0, 200);
}

/**
 * What GET /api/shop/reviews/author answers:
 *  - signed out: show the sign-in prompt;
 *  - `no_email`: signed in to an account with no email, which links to no Customer;
 *  - `unavailable`: the Customer could not be linked just now;
 *  - otherwise the byline the review will carry, and whether it is their name.
 */
export type ReviewAuthorState =
  | { signedIn: false }
  | { signedIn: true; canReview: false; reason: "no_email" | "unavailable" }
  | { signedIn: true; canReview: true; byline: string; named: boolean };
