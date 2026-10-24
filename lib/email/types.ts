// ============================================================
// Transactional email — core types
// ============================================================
//
// The email module is provider-agnostic: templates render to a neutral
// {subject, html, text} shape, and a swappable `EmailTransport` is responsible
// for actually delivering the message. This keeps the lifecycle wiring (Stripe
// webhook, fulfillment action) decoupled from any specific provider.

export type EmailTemplateName =
  | "order_confirmation"
  | "payment_receipt"
  | "shipping"
  | "tracking_out_for_delivery"
  | "tracking_delivery_attempt"
  | "tracking_delivered"
  | "tracking_exception"
  | "refund";

/** A rendered template, before it is addressed to a recipient. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** A fully-addressed message handed to a transport for delivery. */
export interface OutgoingEmail extends RenderedEmail {
  to: string;
  from: string;
  /** Optional Reply-To header: one address, or several that a reply goes to together. */
  replyTo?: string | string[];
  /** Optional Cc recipients (e.g. the customer and a second staff inbox on a Contact Us message). */
  cc?: string[];
  /**
   * Extra message headers, such as `List-Unsubscribe` on a campaign email
   * (migration slice 07). Transactional mail sets none. A name the transport
   * owns (From, To, Subject, ...) or a value with a line break is refused.
   */
  headers?: Record<string, string>;
}

export interface TransportResult {
  /** Provider message id, when the transport returns one. */
  id?: string;
}

/**
 * The single seam every email provider implements. Swap the provider by
 * providing a different `EmailTransport`; nothing else needs to change.
 */
export interface EmailTransport {
  readonly name: string;
  send(email: OutgoingEmail): Promise<TransportResult>;
}

/** Line item shown in order emails. */
export interface OrderEmailItem {
  title: string;
  variantTitle?: string | null;
  quantity: number;
  totalPrice: number;
}

export interface OrderEmailAddress {
  recipient: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode: string;
  country: string;
  /** Self-collect: the studio the customer collects from; the address is that studio's. */
  collectAt?: string | null;
}

/**
 * Provider-neutral payload that drives every order template. Templates use the
 * subset of fields relevant to them (e.g. tracking fields for shipping).
 */
export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  currency: string;
  items: OrderEmailItem[];
  subtotal: number;
  shippingAmount: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  shippingAddress?: OrderEmailAddress | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  /** Courier transit days, for "Estimated delivery". */
  minDays?: number | null;
  maxDays?: number | null;
  /** The courier's latest checkpoint, e.g. "Held at customs — Singapore". */
  trackingCheckpoint?: string | null;
  refundAmount?: number | null;
  /** Points spent at checkout; their dollars are inside `discountAmount` (PRD-loyalty-points slice 04). */
  pointsSpent?: number | null;
  /** What the Order will earn, for the order confirmation (slice 03); null when nothing. */
  pointsEarn?: { points: number; guest: boolean } | null;
}

export interface SendOutcome {
  /** True when the message was handed to the transport. */
  sent: boolean;
  /** True when delivery was skipped because it was already sent (idempotency). */
  skipped?: boolean;
  transport?: string;
  id?: string;
  error?: string;
}
