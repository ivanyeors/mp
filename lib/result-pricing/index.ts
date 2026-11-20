export type PricedLine = {
  msrp: number;
  quantity: number;
};

export type PriceResultInput = {
  goods: number;
  services?: number;
  shipping?: number;
  tax?: number;
  discount?: number;
};

export type PriceResultOutput = {
  goods: number;
  services: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
};

export function priceResult(input: PriceResultInput): PriceResultOutput {
  const services = input.services ?? 0;
  const shipping = input.shipping ?? 0;
  const tax = input.tax ?? 0;
  const discount = Math.min(Math.max(0, input.discount ?? 0), Math.max(0, input.goods));
  const subtotal = input.goods + services;
  return {
    goods: input.goods,
    services,
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping + tax,
  };
}
