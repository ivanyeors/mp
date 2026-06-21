import type {
  EmailTemplateName,
  OrderEmailAddress,
  OrderEmailData,
  RenderedEmail,
} from "./types";

// ============================================================
// Template rendering
// ============================================================
//
// Pure functions: (OrderEmailData) -> RenderedEmail. No I/O, no provider
// concerns — trivially unit-testable.

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatAddressLines(address: OrderEmailAddress): string[] {
  return [
    address.recipient,
    address.line1,
    address.line2 || null,
    [address.city, address.state, address.postalCode].filter(Boolean).join(", "),
    address.country,
  ].filter((line): line is string => Boolean(line));
}

function itemsText(data: OrderEmailData): string {
  return data.items
    .map((item) => {
      const variant = item.variantTitle ? ` (${item.variantTitle})` : "";
      return `- ${item.title}${variant} x${item.quantity} — ${formatMoney(
        item.totalPrice,
        data.currency
      )}`;
    })
    .join("\n");
}

function itemsHtml(data: OrderEmailData): string {
  return data.items
    .map((item) => {
      const variant = item.variantTitle
        ? `<span style="color:#666"> (${escapeHtml(item.variantTitle)})</span>`
        : "";
      return `<tr>
  <td style="padding:6px 0;">${escapeHtml(item.title)}${variant} &times;${item.quantity}</td>
  <td style="padding:6px 0;text-align:right;">${formatMoney(item.totalPrice, data.currency)}</td>
</tr>`;
    })
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function totalsText(data: OrderEmailData): string {
  const lines = [`Subtotal: ${formatMoney(data.subtotal, data.currency)}`];
  if (data.shippingAmount > 0)
    lines.push(`Shipping: ${formatMoney(data.shippingAmount, data.currency)}`);
  if (data.discountAmount > 0)
    lines.push(`Discount: -${formatMoney(data.discountAmount, data.currency)}`);
  if (data.taxAmount > 0)
    lines.push(`Tax: ${formatMoney(data.taxAmount, data.currency)}`);
  lines.push(`Total: ${formatMoney(data.total, data.currency)}`);
  return lines.join("\n");
}

function totalsHtml(data: OrderEmailData): string {
  const rows: string[] = [
    row("Subtotal", formatMoney(data.subtotal, data.currency)),
  ];
  if (data.shippingAmount > 0)
    rows.push(row("Shipping", formatMoney(data.shippingAmount, data.currency)));
  if (data.discountAmount > 0)
    rows.push(row("Discount", `-${formatMoney(data.discountAmount, data.currency)}`));
  if (data.taxAmount > 0)
    rows.push(row("Tax", formatMoney(data.taxAmount, data.currency)));
  rows.push(
    `<tr><td style="padding:8px 0;border-top:1px solid #eee;font-weight:600;">Total</td>` +
      `<td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-weight:600;">${formatMoney(
        data.total,
        data.currency
      )}</td></tr>`
  );
  return rows.join("\n");

  function row(label: string, value: string): string {
    return `<tr><td style="padding:2px 0;color:#666;">${label}</td><td style="padding:2px 0;text-align:right;">${value}</td></tr>`;
  }
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:28px;">
      <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#999;font-size:12px;text-align:center;margin-top:16px;">mpillow</p>
  </div>
</body>
</html>`;
}

function addressBlockHtml(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  const lines = formatAddressLines(data.shippingAddress).map(escapeHtml).join("<br/>");
  return `<div style="margin-top:16px;">
  <p style="font-weight:600;margin:0 0 4px;">Shipping to</p>
  <p style="margin:0;color:#444;line-height:1.5;">${lines}</p>
</div>`;
}

function addressBlockText(data: OrderEmailData): string {
  if (!data.shippingAddress) return "";
  return `\nShipping to:\n${formatAddressLines(data.shippingAddress).join("\n")}`;
}

function orderConfirmation(data: OrderEmailData): RenderedEmail {
  const subject = `Order ${data.orderNumber} confirmed`;
  const text = `Hi ${data.customerName},

Thanks for your order! We've received order ${data.orderNumber} and it's now confirmed.

Items:
${itemsText(data)}

${totalsText(data)}
${addressBlockText(data)}

We'll email you again when it ships.`;

  const html = shell(
    "Thanks for your order!",
    `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, we've received order
      <strong>${escapeHtml(data.orderNumber)}</strong> and it's now confirmed.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${itemsHtml(data)}</table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">${totalsHtml(data)}</table>
    ${addressBlockHtml(data)}
    <p style="color:#444;margin-top:16px;">We'll email you again when it ships.</p>`
  );

  return { subject, html, text };
}

function paymentReceipt(data: OrderEmailData): RenderedEmail {
  const subject = `Receipt for order ${data.orderNumber}`;
  const text = `Hi ${data.customerName},

This is your payment receipt for order ${data.orderNumber}.

${totalsText(data)}

Total charged: ${formatMoney(data.total, data.currency)}`;

  const html = shell(
    "Payment receipt",
    `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, this is your payment receipt for order
      <strong>${escapeHtml(data.orderNumber)}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${totalsHtml(data)}</table>
    <p style="color:#444;margin-top:16px;">Total charged: <strong>${formatMoney(
      data.total,
      data.currency
    )}</strong></p>`
  );

  return { subject, html, text };
}

function shipping(data: OrderEmailData): RenderedEmail {
  const subject = `Order ${data.orderNumber} has shipped`;
  const trackingText = data.trackingNumber
    ? `\nTracking number: ${data.trackingNumber}${
        data.trackingUrl ? `\nTrack it: ${data.trackingUrl}` : ""
      }`
    : "";
  const text = `Hi ${data.customerName},

Good news — order ${data.orderNumber} is on its way!${trackingText}`;

  const trackingHtml = data.trackingNumber
    ? `<p style="margin-top:12px;">Tracking number: <strong>${escapeHtml(
        data.trackingNumber
      )}</strong></p>${
        data.trackingUrl
          ? `<p><a href="${escapeHtml(
              data.trackingUrl
            )}" style="color:#2563eb;">Track your package</a></p>`
          : ""
      }`
    : "";

  const html = shell(
    "Your order is on its way",
    `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, good news — order
      <strong>${escapeHtml(data.orderNumber)}</strong> has shipped!</p>${trackingHtml}`
  );

  return { subject, html, text };
}

function refund(data: OrderEmailData): RenderedEmail {
  const refundAmount = data.refundAmount ?? data.total;
  const subject = `Refund issued for order ${data.orderNumber}`;
  const text = `Hi ${data.customerName},

We've issued a refund of ${formatMoney(refundAmount, data.currency)} for order ${
    data.orderNumber
  }. It may take a few business days to appear on your statement.`;

  const html = shell(
    "Refund issued",
    `<p style="color:#444;">Hi ${escapeHtml(data.customerName)}, we've issued a refund of
      <strong>${formatMoney(refundAmount, data.currency)}</strong> for order
      <strong>${escapeHtml(data.orderNumber)}</strong>.</p>
    <p style="color:#444;">It may take a few business days to appear on your statement.</p>`
  );

  return { subject, html, text };
}

export const ORDER_EMAIL_TEMPLATES: Record<
  EmailTemplateName,
  (data: OrderEmailData) => RenderedEmail
> = {
  order_confirmation: orderConfirmation,
  payment_receipt: paymentReceipt,
  shipping,
  refund,
};

export function renderOrderEmail(
  template: EmailTemplateName,
  data: OrderEmailData
): RenderedEmail {
  return ORDER_EMAIL_TEMPLATES[template](data);
}
