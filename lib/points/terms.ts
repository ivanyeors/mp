/**
 * The points terms (PRD-loyalty-points slice 08; ADR 0030), as the page at
 * /[lang]/points states them. Pure, and built from the live settings, so the
 * numbers on the page are the ones the ledger, checkout and the daily job use.
 * English, like every template today. Counsel reviews this copy before launch.
 */
import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import type { PointsSettings } from "./settings";
import { POINTS_PER_DOLLAR, formatDollarsShort, formatPointsCount, pointsToDollars } from "./value";

export interface PointsTermsSection {
  heading: string;
  paragraphs: string[];
}

/** When the terms last changed. Changes come with 30 days' notice (the last section). */
export const POINTS_TERMS_UPDATED = "8 November 2026";

const share = (s: number) => (s === 0.5 ? "half" : `${Math.round(s * 100)}%`);
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;

/** Pure — every rule, in plain words, with the numbers from `s`. */
export function pointsTermsSections(s: PointsSettings): PointsTermsSection[] {
  const min = formatDollarsShort(pointsToDollars(s.minRedeem));
  const bonus = s.claimBonus > 0 ? `${formatPointsCount(s.claimBonus)} (${formatDollarsShort(pointsToDollars(s.claimBonus))})` : null;
  const worth = (points: number) => `${formatPointsCount(points)} (${formatDollarsShort(pointsToDollars(points))})`;
  return [
    {
      heading: "What a point is worth",
      paragraphs: [
        `${POINTS_PER_DOLLAR} points are worth S$1, always. Points are a discount on a future shop order, not money: they can't be cashed out, transferred to anyone else, or bought.`,
      ],
    },
    {
      heading: "Earning points",
      paragraphs: [
        `You earn ${s.earnPerDollar} points for every S$1 you pay for products, before GST. Shipping doesn't earn points, and neither does the part of an order paid with points or a discount code.`,
        `Points from an order are pending at first. They become yours to use ${DEFAULT_RETURN_WINDOW_DAYS} days after the order is delivered, once its return window has closed. Your account shows them, and the day they can be used.`,
        "If you return something after its points became usable, we take back the points it earned, as far as your balance allows.",
      ],
    },
    {
      heading: "Using points",
      paragraphs: [
        `Use points at checkout on any shop order when you're signed in, in steps of S$1, from ${min}, up to ${share(s.maxShare)} of the products' price after any discount code.`,
        "Points can't be used on custom pillows.",
        "Points used are not refunded. A return refunds money only, up to the money you paid on that order.",
        "If you leave checkout without paying, the points you chose come back to your account.",
      ],
    },
    ...(s.milestones.length
      ? [
          {
            heading: "Bonus milestones",
            paragraphs: [
              `When the points you've earned from orders add up to a milestone, we add bonus points to your account, once for each milestone: ${s.milestones
                .map((m) => `at ${m.at.toLocaleString("en-SG")} points earned, ${worth(m.bonus)}`)
                .join("; ")}.`,
              "Only points earned on orders count towards a milestone, from the day they become usable. Bonus points, points for signing in, points for past purchases and points we add for any other reason don't count. Using points doesn't set you back. If you return something after its points became usable, the points we take back come off your total.",
              "A bonus you've received is yours to keep, even if a return later takes your total below its milestone. Each milestone gives its bonus once.",
            ],
          },
        ]
      : []),
    // ADR 0030, amendment of 2026-11-08: Past-purchase points.
    {
      heading: "Points for past purchases",
      paragraphs: [
        `If you bought from us before our new website, we add points to your account once for what you spent then: ${s.earnPerDollar} points for every S$1, as your account with us recorded it.`,
      ],
    },
    ...(bonus
      ? [
          {
            heading: "Points for signing in",
            paragraphs: [
              `If you had an Mpillow account before our new website, signing in to it within ${months(s.claimBonusMonths)} of the email we sent you about it adds ${bonus} to your account, once.`,
            ],
          },
        ]
      : []),
    {
      heading: "Points don't expire",
      paragraphs: ["Your points stay in your account for as long as you have it, however long it is between orders."],
    },
    {
      heading: "Partners",
      paragraphs: ["Partner accounts neither earn nor use points. Partners have their own rewards."],
    },
    {
      heading: "Changes to these terms",
      paragraphs: [
        "We tell you 30 days before we change these terms. A change never takes away points you already have.",
      ],
    },
  ];
}
