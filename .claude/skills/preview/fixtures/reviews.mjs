// Shop reviews on pdp.mjs's product page: /shop/ear-comfort-pad, Reviews tab.
// Two approved reviews (one with our reply under it), and a pending one that
// must not show. The signed-in preview user is a Customer here ("Jamie L."),
// so the review form shows who they post as; scenario `reviewer-no-name`
// takes the name off, for the stand-in byline. Every name and word is made up.

import { OWNER } from "./base.mjs";

export default function reviews({ scenario, now }) {
  const nameless = scenario === "reviewer-no-name";
  const ago = (days, hours = 0) => new Date(now.getTime() - (days * 24 + hours) * 3_600_000).toISOString();
  // The product in pdp.mjs. A uuid: GET /api/shop/reviews refuses any other product_id.
  const product = "00000000-0000-4000-8000-0000000000e1";
  const review = (id, fields) => ({
    id,
    product_id: product,
    customer_id: null,
    order_id: null,
    title: null,
    body: null,
    store_reply: null,
    store_reply_at: null,
    store_reply_by_name: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    ...fields,
    updated_at: fields.created_at,
  });

  return {
    tables: {
      product_reviews: [
        review("rev-approved-replied", {
          author_name: "Ada L.",
          rating: 4,
          title: "Comfy",
          body: "My ear doesn't ache in the morning any more. Took a couple of nights to get used to the height.",
          status: "approved",
          created_at: ago(6),
          store_reply:
            "Thank you, Ada! A couple of nights to settle in is completely normal. We're so glad the mornings feel better.",
          store_reply_at: ago(5, 20),
          store_reply_by_name: "Ivan",
        }),
        review("rev-approved", {
          author_name: "Ben T.",
          rating: 5,
          title: "Finally sleeping on my side",
          body: "Exactly what I needed with my custom pillow.",
          status: "approved",
          created_at: ago(12),
        }),
        review("rev-pending", {
          author_name: "Chen W.",
          rating: 2,
          title: "Pending — must not show",
          body: "This one is waiting for a moderator.",
          status: "pending",
          created_at: ago(1),
          store_reply: "A reply on a pending review stays hidden with it.",
          store_reply_at: ago(0, 20),
          store_reply_by_name: "Ivan",
        }),
      ],
      customers: [
        {
          id: "cust-preview-owner",
          auth_user_id: OWNER.id,
          email: OWNER.email,
          first_name: nameless ? null : "Jamie",
          last_name: nameless ? null : "Lim",
          created_at: ago(90),
          updated_at: ago(1),
        },
      ],
    },
  };
}
