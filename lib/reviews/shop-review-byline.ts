export const NAMELESS_REVIEW_BYLINE = "mpillow customer";

export function shopReviewByline(customer: { first_name: string | null; last_name: string | null }): string {
  const first = customer.first_name?.trim();
  if (!first) return NAMELESS_REVIEW_BYLINE;
  const initial = customer.last_name?.trim()[0];
  return (initial ? `${first} ${initial}.` : first).slice(0, 200);
}

export type ReviewAuthorState =
  | { signedIn: false }
  | { signedIn: true; canReview: false; reason: "no_email" | "unavailable" }
  | { signedIn: true; canReview: true; byline: string; named: boolean };
