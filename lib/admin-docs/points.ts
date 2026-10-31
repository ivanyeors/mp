/**
 * Documentation → Mpillow Points: how the programme works, for the owner and
 * Staff, in plain words. Pure, and built from the live settings, so every
 * number here is the one the ledger, checkout and the daily job use. The
 * rules are ADR 0030 and the PRD (`.claude/PRD-loyalty-points/`); this says
 * them for people running the shop.
 */
import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import { pointsForOrder } from "@/lib/points/earn";
import { milestoneCostRows } from "@/lib/points/milestones";
import { profilePointsView, type PointsSettings } from "@/lib/points/settings";
import { POINTS_PER_DOLLAR, formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import type { DocGuide, DocSection } from "./types";

export const POINTS_GUIDE: DocGuide = {
  slug: "points",
  title: "Mpillow Points",
  summary:
    "How customers earn and use points, the Claim bonus, bonus milestones, refunds, what customers and Staff see, what it costs, and how to launch.",
  updated: "31 October 2026",
};

const DISCOUNTS = { label: "Discounts → Points", href: "/settings/discounts" };

const worth = (points: number) => `${formatPointsCount(points)} (${formatDollarsShort(pointsToDollars(points))})`;
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;
const percent = (share: number) => `${(Math.round(share * 10000) / 100).toLocaleString("en-SG")}%`;
const sgDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });

/** Pure — where the programme stands now, in one sentence. */
export function pointsStatusLine(s: PointsSettings, now: Date = new Date()): string {
  const view = profilePointsView(s, now);
  if (view === "live") return `Points are on, since ${sgDateTime(s.launchAt!)}. Customers earn and use them.`;
  if (view === "off") {
    return "Points were switched off after their launch. Nothing earns or can be used, and customers' Profiles show no points card. Balances are kept.";
  }
  if (s.launchAt) {
    return `Points launch on ${sgDateTime(s.launchAt)}${s.enabled ? "" : ", once they are turned on"}. Until then, customers see "Coming soon" on their Profile and nothing earns.`;
  }
  return 'Points are off, with no launch date. Customers see "Coming soon" on their Profile and nothing earns.';
}

/** Pure — every section of the guide, with the numbers from `s`. */
export function pointsGuideSections(s: PointsSettings, now: Date = new Date()): DocSection[] {
  const rate = s.earnPerDollar;
  const min = worth(s.minRedeem);
  const share = `${Math.round(s.maxShare * 100)}%`;
  const example = pointsForOrder({ subtotal: 89, discount: 0, refunded: 0 }, rate);
  const costs = milestoneCostRows(s.milestones, rate);
  const top = costs[costs.length - 1];

  return [
    {
      id: "overview",
      heading: "What points are",
      blocks: [
        {
          kind: "p",
          text: `Mpillow Points are money off a later shop order. Customers earn them on what they pay for, and from two kinds of bonus: the Claim bonus and bonus milestones. ${POINTS_PER_DOLLAR} points are always S$1. That is fixed in the code, so no setting can lower what a balance is worth.`,
        },
        { kind: "note", text: pointsStatusLine(s, now) },
        {
          kind: "list",
          items: [
            "Points are not money: they can't be cashed out, given to someone else, or bought.",
            "They can't be used on custom pillows, re-adjustment fees or orders Staff make, only on shop orders.",
            "Points used are never refunded. A refund is money only, up to the money paid.",
            "Points never expire. A balance stays however long it is between orders, and no reminder is sent about it.",
            "Partners neither earn nor use points. Their reward is the partner milestone tiers.",
          ],
        },
      ],
    },
    {
      id: "numbers",
      heading: "The numbers today",
      blocks: [
        {
          kind: "table",
          head: ["Setting", "Now", "What it means"],
          rows: [
            ["Launch", s.launchAt ? sgDateTime(s.launchAt) : "Not set", "Only orders paid from then earn."],
            ["Points are on", s.enabled ? "Yes" : "No", "Off: nothing earns and nothing can be used."],
            ["Earn rate", `${rate} points per S$1`, `${rate}% back on products, before GST. Shipping doesn't earn.`],
            ["Value", `${POINTS_PER_DOLLAR} points = S$1`, "Fixed in code."],
            ["Fewest used at once", min, "Points are used in S$1 steps from here."],
            ["Most of an order", share, "Of the products' price after any discount code. Never shipping."],
            [
              "Claim bonus",
              s.claimBonus > 0 ? worth(s.claimBonus) : "None",
              `Once, for an imported customer who claims their account within ${months(s.claimBonusMonths)} of our first email.`,
            ],
            [
              "Bonus milestones",
              s.milestones.length ? `${s.milestones.length}` : "None",
              "One-time bonuses as the points a customer earns from orders add up. See below.",
            ],
          ],
        },
        { kind: "links", items: [{ label: `Change these on ${DISCOUNTS.label}`, href: DISCOUNTS.href }] },
      ],
    },
    {
      id: "earning",
      heading: "How customers earn",
      blocks: [
        {
          kind: "steps",
          items: [
            "A customer pays for an order: a shop order, a custom pillow, or a paid re-adjustment.",
            "Its points are pending. The customer sees them on their Profile and on the order page, with the day they become usable.",
            `${DEFAULT_RETURN_WINDOW_DAYS} days after the order is delivered (after payment, for an order of services only), its return window has closed. The daily job adds the points to the balance on its next run, every morning at 10am Singapore time.`,
            "The same run adds any milestone bonus those points reach.",
          ],
        },
        {
          kind: "p",
          text: `An order earns ${rate} points for each S$1 paid for the products the customer kept: the products' price, less any discount (points used count as a discount), less anything refunded, rounded down. Shipping and GST don't count. A S$89 order with no discount earns ${worth(example)}.`,
        },
        { kind: "p", text: "These orders never earn:" },
        {
          kind: "list",
          items: [
            "orders paid before the launch;",
            "cancelled orders and failed payments;",
            "a partner's own purchases, and any order on a partner's account.",
          ],
        },
        {
          kind: "p",
          text: "A guest's points wait on their email: once they sign in with it, the points are theirs.",
        },
      ],
    },
    {
      id: "milestones",
      heading: "Bonus milestones",
      blocks: [
        {
          kind: "p",
          text: "Milestones reward customers who keep coming back. When the points a customer has earned from orders add up to a milestone, we add its bonus once. Customers see a bar on their Profile with every milestone, how far along they are, and how many more points reach the next one.",
        },
        ...(costs.length
          ? [
              {
                kind: "table" as const,
                head: ["Milestone", "Points earned from orders", "Bonus", "Reached after about", "Back by then"],
                rows: costs.map((c) => [
                  String(c.milestone),
                  c.at.toLocaleString("en-SG"),
                  worth(c.bonus),
                  c.spend !== null ? `${formatDollarsShort(c.spend)} spent` : "—",
                  c.backShare !== null ? percent(c.backShare) : "—",
                ]),
              },
              {
                kind: "p" as const,
                text: `"Back by then" is the points earned and every bonus so far, as a share of the spend: ${rate}% from the earn rate, plus the bonuses.`,
              },
            ]
          : [{ kind: "p" as const, text: `There are no milestones now. Add them on ${DISCOUNTS.label}.` }]),
        { kind: "p", text: "The rules:" },
        {
          kind: "list",
          items: [
            "Only points earned on orders count. The Claim bonus, Staff adjustments and milestone bonuses themselves don't.",
            "Using points never sets a customer back. Points taken back on a refund do come off their total.",
            "A bonus is never taken back, even if a refund later takes the customer below its milestone. Each milestone pays once.",
            "The daily job adds a bonus on the same run as the points that reach it. Pending points show on the bar, lighter, but count only once they're usable.",
            "Changing the ladder never pays a milestone twice: a customer holds one bonus for each milestone they have reached. A new or lower milestone is added on the next daily run for everyone already past it.",
            "Nothing is added while points are off or before the launch. The first run after they go live adds whatever is due.",
            "Partners never get one.",
          ],
        },
        {
          kind: "note",
          text: "Milestones aren't tiers or levels. A customer who reaches one earns and uses points exactly as before. The bonus is the whole reward.",
        },
        { kind: "links", items: [{ label: `Edit the milestones on ${DISCOUNTS.label}`, href: DISCOUNTS.href }] },
      ],
    },
    {
      id: "using",
      heading: "How customers use points",
      blocks: [
        {
          kind: "list",
          items: [
            "Signed in, checking out with their own account email, and not a partner.",
            `On shop orders only, in S$1 steps, from ${min}, up to ${share} of the products' price after any discount code. Never on shipping.`,
            "The points are held when checkout opens. If the customer leaves without paying, or the payment fails, they come back. The daily job catches any the payment service didn't report.",
            "Free shipping and a discount code's minimum are judged before points, so using points never loses either.",
          ],
        },
      ],
    },
    {
      id: "claim-bonus",
      heading: "The Claim bonus",
      blocks: [
        s.claimBonus > 0
          ? {
              kind: "p",
              text: `A customer we imported from the old website gets ${worth(s.claimBonus)} once, when they claim their account within ${months(s.claimBonusMonths)} of the first campaign email we sent them, or of the first wave if we never emailed them. Anyone who claimed before points went live gets it at their next sign-in, if their claim fell inside their window.`,
            }
          : { kind: "p", text: "The Claim bonus is 0, so nobody gets one." },
        {
          kind: "note",
          text: "A campaign that mentions points can't be sent until points are on, launched, and give a Claim bonus.",
        },
      ],
    },
    {
      id: "refunds",
      heading: "Refunds",
      blocks: [
        {
          kind: "p",
          text: "A refund pays back money only, up to the money paid on the order. Points used stay used. A partial return refunds money first, so the points count as spent on what the customer kept.",
        },
        {
          kind: "p",
          text: `If a refund lands after an order's points were added, ${rate} points per S$1 refunded are taken back, no more than the order earned and no more than the customer holds. Anything short is noted on the entry, not chased.`,
        },
      ],
    },
    {
      id: "customers-see",
      heading: "What customers see",
      blocks: [
        {
          kind: "table",
          head: ["Where", "What"],
          rows: [
            ["Profile, before the launch", '"Mpillow Points: Coming soon", the earn rate, the milestones as an empty bar, and a link to the terms.'],
            ["Profile, once live", "The balance in points and dollars, that they don't expire, points on their way with the day each becomes usable, and the milestone bar."],
            ["Profile, switched off after the launch", "Nothing: customers may hold points then, so it doesn't say coming soon."],
            ["Checkout", "A Points section to use them, with the two exclusions beside it (no custom pillows, no refund of points used)."],
            ["Order page", '"Earns N points, usable from <date>" while pending, then "Earned N points".'],
            ["Order confirmation email", '"This order will earn N points once it has been delivered and kept for 30 days."'],
            ["The terms page", "Every rule, with today's numbers. Linked from the footer, checkout, the Profile and every points email."],
            ["Partners", "None of this."],
          ],
        },
        { kind: "links", items: [{ label: "Open the terms page", href: "/points" }] },
      ],
    },
    {
      id: "staff",
      heading: "What Staff can do",
      blocks: [
        {
          kind: "list",
          items: [
            "Customers → a customer → Points: the balance, what is pending, the points earned from orders and the milestones reached, and the latest 20 entries. Needs Customers.",
            "Add or remove points there, with a written reason, for example to give points back when we cancel an order. Needs Customers: make changes. It is refused for a partner, or below zero, and every adjustment is in the Audit log.",
            `Change the settings, and see what points cost, on ${DISCOUNTS.label}. Needs Discounts.`,
          ],
        },
        {
          kind: "note",
          text: "Entries are never edited or deleted. A correction is a new adjustment with its reason, so every balance can be explained from its history.",
        },
      ],
    },
    {
      id: "cost",
      heading: "What points cost",
      blocks: [
        {
          kind: "p",
          text: `Every point a customer holds is S$0.01 off a future order. ${DISCOUNTS.label} shows what customers hold, what is pending, and what has been used and taken back, this month and in total, with the Claim bonuses and milestone bonuses given.`,
        },
        {
          kind: "p",
          text:
            top && top.spend !== null && top.backShare !== null
              ? `At ${rate} points per S$1, customers get ${rate}% back. With the milestones, a customer who reaches the last one (${top.at.toLocaleString("en-SG")} points, about ${formatDollarsShort(top.spend)} spent) has ${percent(top.backShare)} back.`
              : `At ${rate} points per S$1, customers get ${rate}% back.`,
        },
        { kind: "note", text: "Points customers hold are a liability. The accountant decides how it is booked and from which figure." },
      ],
    },
    {
      id: "launch",
      heading: "Launch checklist",
      blocks: [
        {
          kind: "steps",
          items: [
            `Check every number on ${DISCOUNTS.label}, the milestones included.`,
            "Set the launch date and time. Only orders paid from then earn.",
            "Turn points on and save.",
            "Run the live test with a real card: buy, add points by hand, use them on a second order, leave a third checkout and see them come back, return an item and see the refund is money only, then check every entry on the customer's Points card. Refund the test orders afterwards.",
            "Check a partner's account shows no points at checkout.",
          ],
        },
        {
          kind: "note",
          text: "Nothing on this page turns points on or sends anything. Turning points off later keeps every balance; customers simply can't earn or use them until they're back on.",
        },
      ],
    },
  ];
}
