import { MIN_CHARGE, PAY_LINK_LIFETIME_DAYS } from "@/lib/staff-orders/shared";
import type { DocGuide, DocSection } from "./types";

export const STAFF_ORDERS_GUIDE: DocGuide = {
  slug: "staff-orders",
  title: "Selling from the Customer or Orders page",
  summary:
    "Make an order for a customer with pillows, bolsters, products and services, send them a link to pay on their own phone, and see it through to paid.",
  updated: "23 November 2026",
};

const CUSTOMERS = { label: "Customers", href: "/settings/customers" };
const ORDERS = { label: "Orders", href: "/settings/orders" };
const COSTINGS = { label: "Costings → Service fees", href: "/settings/costings" };
const DISCOUNTS = { label: "Discounts", href: "/settings/discounts" };
const CONFIGURE = { label: "Inventory → Configure", href: "/settings/inventory/configure" };

export function staffOrdersGuideSections(): DocSection[] {
  return [
    {
      id: "what",
      heading: "What it is for",
      blocks: [
        {
          kind: "p",
          text: "A customer at the counter or on the phone wants something: a second pillow, a bolster, a spare case, an ear pad, a re-adjustment, a measurement visit. You put the order together on their Customer page, or from Orders, and they pay for it on their own phone through a link we send them.",
        },
        {
          kind: "list",
          items: [
            "Products are charged at their shop price, services at their price in Costings. You choose what and how many, never the price.",
            "An Mpillow Basic, Mpillow Premium or Mbolster is built to order: you choose its fillings, and its cover and case, when you add it (see below). Its price comes from Costings and does not change with the fillings. A different cover or case changes it only where Costings prices that one differently. Each Ear Comfort Pad you place inside is charged on top, at its own price.",
            "A customer who still needs measuring is a customisation (a Result), not an order here. Start one with your Assist link, then use Request payment on the Result.",
            "Points and partner referral codes do not apply. A discount code made in Discounts does, on the products only.",
          ],
        },
        { kind: "links", items: [COSTINGS, DISCOUNTS] },
      ],
    },
    {
      id: "make",
      heading: "Make the order",
      blocks: [
        {
          kind: "p",
          text: "You need the Orders permission. Create order is at the top of a customer's page, and at the top of Orders.",
        },
        {
          kind: "steps",
          items: [
            "Open the customer under Customers and press Create order. Or press Create order on Orders, then search for the customer by name, email or mobile and pick them.",
            "Someone new? On Orders, choose New customer and type their name, email and mobile. An email is required, because the payment link goes there. If that email already belongs to a customer, the order goes under their record and nobody is created twice. Adding a customer needs the Customers: make changes permission.",
            "Search for products. Each row shows its price on the right; point at a row, or tap it, to add it. Add any service. Change quantities with − and +.",
            "For a pillow or bolster, the row opens Choose build instead (see the next section).",
            "Choose where it goes: At a studio (handed over or done there, no shipping charge, no courier label), or Deliver to an address, with one of their saved addresses or a new one and a delivery method.",
            "Type a discount code if they have one, and press Apply.",
            "Add a note for the customer if you like (it shows in the email and on the payment page), and an internal note for the team.",
            "Under Payment, leave Send a payment link, or choose Already paid if they have paid you (see below).",
            "Check the total, which is worked out by the server as you go, and press Create order.",
          ],
        },
        {
          kind: "note",
          text: `Stripe cannot take less than SGD ${MIN_CHARGE.toFixed(2)}, so a smaller order is refused. A service-only order is always at a studio.`,
        },
        { kind: "links", items: [CUSTOMERS, ORDERS] },
      ],
    },
    {
      id: "fillings",
      heading: "Add a pillow or bolster",
      blocks: [
        {
          kind: "p",
          text: "Pillows and bolsters are at the top of the product list, marked Built to order. Picking one opens its build (the fillings, and the cover and case) before it joins the order.",
        },
        {
          kind: "steps",
          items: [
            "Pick the size or length you are selling, for example Mpillow Premium · M.",
            "Choose a Filling Template. The list holds the templates made for that size; the size's default is chosen for you when it has one.",
            "Adjust it for this customer. On a pillow, click a section of the x-ray to add or swap pieces, and use the bin beside a filling under What goes in to take it out. On a bolster, add and remove pieces in the list. Once you change anything it reads Adjusted, and Back to the template undoes your changes.",
            "Choose the Cover and the Case for a pillow, or the Case for a bolster (a bolster has no cover). The ones the size comes with are chosen for you and marked standard. Each other one shows what it adds to or takes off the price, and how many are in stock.",
            "Press Add to order. The line shows the template, or Adjusted from it, how many pieces go in, and the cover and case. Change build opens it again until the order is made.",
            "Two pillows with the same fillings, cover and case: raise the quantity. Anything different: add the pillow again.",
          ],
        },
        {
          kind: "list",
          items: [
            "A neck support or ear pad inside the pillow is for Premium only, so a Basic pillow and a bolster are offered fillings alone.",
            "An ear pad placed inside adds its own price to the pillow; the editor and the order line show how much. A neck support inside does not.",
            "The cover and case you choose replace the ones the size comes with: they are what the workshop uses and what leaves stock. A spare case on top is added as its own product.",
            "A cover or case with no price in Costings, or out of stock, cannot be chosen.",
            "If there is not enough stock to build it, the order says which filling or part is short. Stock leaves when the order is paid.",
            "The order's page shows the build under Build snapshot, section by section, for whoever makes it.",
            "A template you adjust here is changed for this order only. Templates themselves are made under Inventory → Configure.",
          ],
        },
        { kind: "links", items: [CONFIGURE] },
      ],
    },
    {
      id: "send",
      heading: "Send the link",
      blocks: [
        {
          kind: "p",
          text: `Leave "Email the payment link" ticked and the customer gets an email with the order, the total and a Pay button. The link works for ${PAY_LINK_LIFETIME_DAYS} days.`,
        },
        {
          kind: "list",
          items: [
            "Copy the link to send it by WhatsApp instead.",
            "Standing with them? Show the QR code and they scan it to pay on their phone.",
            `On the order's page, the Payment link card shows when it was sent and to whom. Email the link again sends it once more and gives it another ${PAY_LINK_LIFETIME_DAYS} days.`,
          ],
        },
      ],
    },
    {
      id: "paid",
      heading: "If they have already paid",
      blocks: [
        {
          kind: "p",
          text: "A customer who paid at the counter needs no link. Choose Already paid when you make the order, or press Mark as paid on the order's page later, and say how it was paid.",
        },
        {
          kind: "table",
          head: ["How it was paid", "What to pick", "What it means"],
          rows: [
            [
              "On Stripe (the card reader in the Stripe app, a payment taken in the Stripe dashboard)",
              "The Stripe payment in the list. Only payments of exactly the order's total from the last 7 days that no order has claimed are shown.",
              "The order is tied to that payment and dated by it. Refunds go back through Stripe as usual.",
            ],
            [
              "Cash, PayNow or a bank transfer to our account, or another way",
              "The matching line under Outside Stripe. Another way needs a note.",
              "No Stripe payment is linked. To refund it, return the money the way it came, then press Record refund on the order.",
            ],
          ],
        },
        {
          kind: "list",
          items: [
            "Marking it paid confirms the order, takes its stock out and emails the customer their confirmation. It cannot be undone, so check the money has arrived first.",
            "The payment link stops working. If the customer still manages to pay through it, the order is flagged as paid twice: refund that second payment in Stripe.",
            "Who marked it, how, and which Stripe payment are kept in the Audit Log and on the order's timeline.",
          ],
        },
        { kind: "links", items: [ORDERS] },
      ],
    },
    {
      id: "pay",
      heading: "What the customer sees",
      blocks: [
        {
          kind: "steps",
          items: [
            "Our page with what is in the order, the total and where it goes.",
            "Pay takes them to Stripe's secure page, where they pay by card, Apple Pay, Google Pay or PayNow.",
            "They come back to our page, which says the payment is received, and the usual order confirmation and receipt arrive by email.",
          ],
        },
        {
          kind: "p",
          text: "If something in the order has sold out since you made it, or a pillow's fillings have, the page asks them to contact us instead of taking the money.",
        },
      ],
    },
    {
      id: "after",
      heading: "After they pay, or if they do not",
      blocks: [
        {
          kind: "table",
          head: ["What happens", "The order"],
          rows: [
            ["They pay", "Confirmed and paid; its stock comes out; a delivered order gets its courier label. Treat it like any other order."],
            ["They pay you another way", "Press Mark as paid on the order. It is confirmed the same way, and the link stops working."],
            ["They open the payment and leave", "Nothing changes. The link still works."],
            [`${PAY_LINK_LIFETIME_DAYS} days pass unpaid`, "The daily job cancels it. Email the link again before then to give it more time."],
            ["You cancel it", "Use Cancel on the order. The link stops working at once."],
          ],
        },
        {
          kind: "note",
          text: "To change an order that has not been paid, cancel it and make a new one. The link always charges the total the order was made with.",
        },
        { kind: "links", items: [ORDERS] },
      ],
    },
  ];
}
