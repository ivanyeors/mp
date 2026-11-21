export type EmailTemplateName =
  | "order_confirmation"
  | "payment_receipt"
  | "shipping"
  | "tracking_out_for_delivery"
  | "tracking_delivery_attempt"
  | "tracking_delivered"
  | "tracking_exception"
  | "refund";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  from: string;
  replyTo?: string | string[];
  cc?: string[];
  headers?: Record<string, string>;
}

export interface TransportResult {
  id?: string;
}

export interface EmailTransport {
  readonly name: string;
  send(email: OutgoingEmail): Promise<TransportResult>;
}

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
  collectAt?: string | null;
}

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
  minDays?: number | null;
  maxDays?: number | null;
  trackingCheckpoint?: string | null;
  refundAmount?: number | null;
  pointsSpent?: number | null;
  pointsEarn?: { points: number; guest: boolean } | null;
}

export interface SendOutcome {
  sent: boolean;
  skipped?: boolean;
  transport?: string;
  id?: string;
  error?: string;
}
