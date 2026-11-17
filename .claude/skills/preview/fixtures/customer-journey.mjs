// The Customer page's Journey (PRD-customer-page-journey): Mei (points.mjs)
// gets the story the journey map is for. A note after her fitting, a 1★ Google
// review Staff linked to her (still waiting for a reply, with a drafted one),
// a follow-up about it that is now overdue, a note after her re-adjustment and
// a follow-up due in four days:
// /settings/customers/00000000-0000-4000-8000-0000000000c7. Every name, word
// and date is made up.

import { POINTS_CUSTOMER } from "./points.mjs";

const SOPHIE = "00000000-0000-4000-8000-0000000000a5";
const REVIEW = "00000000-0000-4000-8000-0000000000f1";

export default function customerJourney({ now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const day = (days) => ago(days).slice(0, 10);
  const note = (n, days, body) => ({
    id: `00000000-0000-4000-8000-0000000001a${n}`,
    customer_id: POINTS_CUSTOMER,
    body,
    author_profile_id: SOPHIE,
    author_user_id: null,
    created_at: ago(days),
    deleted_at: null,
  });
  const followUp = (n, title, dueDays, createdDays, doneDays = null) => ({
    id: `00000000-0000-4000-8000-0000000001b${n}`,
    customer_id: POINTS_CUSTOMER,
    title,
    due_on: day(dueDays),
    assigned_to_profile_id: SOPHIE,
    created_by_profile_id: SOPHIE,
    created_at: ago(createdDays),
    done_at: doneDays === null ? null : ago(doneDays),
    done_by_profile_id: doneDays === null ? null : SOPHIE,
  });

  return {
    tables: {
      customer_notes: [
        note(1, 379, "Side sleeper, wakes with shoulder pain. Went with the M; prefers the neck a little lower."),
        note(2, 262, "Called about the review. She says the neck feels too high after the first weeks. Offered a re-adjustment."),
        note(3, 3, "Re-adjusted in store: took one layer out of the neck. She will try it for a week."),
      ],
      customer_followups: [
        followUp(1, "Follow up on her Google review", 7, 262),
        followUp(2, "Check how the new fill feels", -4, 3),
        followUp(3, "Send the care guide", 370, 379, 372),
      ],
      google_reviews: [
        {
          id: REVIEW,
          review_name: "places/preview/reviews/mei",
          source: "places",
          maps_uri: "https://www.google.com/maps/reviews/data=preview",
          star_rating: 1,
          comment:
            "Unfortunately the customised pillow doesn't work for me. I bought one because I always woke up with shoulder pain when sleeping on my side. The team is clearly passionate, but I was unable to get used to mine and ended up with a sore neck.",
          reviewer_name: "Mei T.",
          reviewer_is_anonymous: false,
          review_created_at: ago(265),
          review_updated_at: ago(265),
          google_reply: null,
          google_reply_updated_at: null,
          status: "pending",
          draft_reply:
            "Mei, I am sorry. You came to us to get rid of shoulder pain and ended up with a sore neck, and we should have reached you sooner. A pillow that still feels wrong after the first weeks needs its fit retuned. Please message us on WhatsApp at +65 8780 5311 so I can look at it with you personally. We want to get this right for you.",
          draft_source: "claude",
          draft_version: 1,
          draft_error: null,
          posted_reply: null,
          posted_at: null,
          acted_by_telegram_user_id: null,
          acted_by_name: null,
          telegram_chat_id: null,
          telegram_message_id: null,
          last_error: null,
          reopened_at: null,
          reopened_from_rating: null,
          created_at: ago(265),
          updated_at: ago(265),
        },
      ],
      customer_google_reviews: [
        { google_review_id: REVIEW, customer_id: POINTS_CUSTOMER, how: "manual", linked_by_profile_id: SOPHIE, linked_at: ago(262) },
      ],
    },
  };
}
