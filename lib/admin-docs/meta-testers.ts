import type { DocGuide, DocSection } from "./types";

export const META_TESTERS_GUIDE: DocGuide = {
  slug: "meta-testers",
  title: "Adding teammates to the Meta app",
  summary:
    "Give a teammate a role on the Meta app so their Facebook and Instagram messages reach Telegram before App Review, test it, and remove them later.",
  updated: "26 October 2026",
};

const TELEGRAM_TAB = { label: "Users & permissions → Telegram", href: "/settings/users?tab=telegram" };

export function metaTestersGuideSections(): DocSection[] {
  return [
    {
      id: "why",
      heading: "Why teammates need a role",
      blocks: [
        {
          kind: "p",
          text: "Facebook and Instagram messages reach the measurements Telegram group through our Meta app, mpillow-sg. Until Meta approves the app in App Review, it only passes on messages from people with a role on the app. Everyone else's messages stay in the Page's and Instagram's own inbox.",
        },
        {
          kind: "note",
          text: `A role only lets a teammate's own messages through for testing. Who can reply to customers is set on ${TELEGRAM_TAB.label}, not in Meta. Once App Review is approved, every customer's messages come through.`,
        },
      ],
    },
    {
      id: "add",
      heading: "Add a teammate",
      blocks: [
        { kind: "p", text: "An admin of the Meta app does this." },
        {
          kind: "steps",
          items: [
            "Go to developers.facebook.com/apps and open mpillow-sg (App ID 1147981697278563).",
            "In the left menu, open App roles → Roles.",
            "Press Add People (or Add Testers), choose Tester, type the teammate's Facebook name or profile ID, and press Add.",
            "They show as Pending until they accept.",
          ],
        },
        {
          kind: "note",
          text: "Choose Tester. Administrator and Developer can change the app's settings, so keep those for whoever runs the setup.",
        },
      ],
    },
    {
      id: "accept",
      heading: "What the teammate does",
      blocks: [
        {
          kind: "steps",
          items: [
            "On a computer, log in to Facebook with the account that was added and open developers.facebook.com/requests.",
            "Accept the mpillow-sg invite. If Meta asks them to register as a developer first, they follow its steps. It's free and takes a minute.",
            "For Instagram, the Instagram account they write from must be linked to that same Facebook account in Accounts Center (Instagram → Settings → Accounts Center).",
          ],
        },
      ],
    },
    {
      id: "test",
      heading: "Test it",
      blocks: [
        {
          kind: "steps",
          items: [
            "From their own Facebook or Messenger, the teammate messages the Mpillow Page.",
            "From their own Instagram, they send a DM to @thempillow.",
            "Each message appears as a card in the measurements Telegram group within a few seconds.",
            "Someone allowed to Answer customer messages replies to the card. The reply reaches the teammate from Mpillow.",
          ],
        },
        {
          kind: "note",
          text: `Nothing in Telegram? Check the teammate no longer shows as Pending on App roles → Roles, and that Customer messages on ${TELEGRAM_TAB.label} shows everything Connected.`,
        },
        { kind: "links", items: [TELEGRAM_TAB] },
      ],
    },
    {
      id: "remove",
      heading: "Remove someone",
      blocks: [
        {
          kind: "p",
          text: "When someone leaves the team, open App roles → Roles in mpillow-sg and remove them from the menu next to their name. Take away their Telegram link on the same day.",
        },
      ],
    },
  ];
}
