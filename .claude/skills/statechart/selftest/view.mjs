// The reader's words for the toy checkout in Checkout.tla.

export const title = "Toy checkout: paying the QR after the hold runs out";

export const state = (v) => {
  if (v.order === "cart") return "In cart";
  if (v.order === "paying") return v.money === "taken" ? "Paid, waiting for the bank's notice" : "Waiting for payment";
  if (v.order === "expired") return v.money === "taken" ? "Hold ran out, money taken" : "Hold ran out";
  if (v.order === "paid") return v.unit === "sold" ? "Paid, pillow set aside" : "Paid, no pillow set aside";
  return "Refunded";
};

const STEPS = {
  YouCheckOut: "you check out",
  YouPay: "you pay the QR",
  HoldRunsOut: "the hold on the pillow runs out",
  SomeoneElseBuys: "someone else buys the pillow",
  BankNotice: "the bank's notice arrives",
  Done: "nothing more happens",
};
export const step = (action) => STEPS[action];

export const group = (v) => (v.order === "cart" ? "shopping" : v.order === "paid" || v.order === "refunded" ? "settled" : "paying");

export const colors = { shopping: "blue", paying: "yellow", settled: "teal" };
