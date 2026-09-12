// ============================================================
// Email registry — every outbound template, in one list
// ============================================================
//
// The registry is what makes the design system reviewable: the dev preview
// renders from it, and lib/email/__tests__/contract.test.ts asserts the shared
// invariants across every entry. A template that is not registered gets neither,
// so registry-coverage.test.ts fails the build when one is missing.
//
// Every `render` must be PURE — no network, no DB.

import { renderApplicationOutcomeEmail } from "./application";
import { renderBackupEmailOtpEmail } from "./auth";
import { renderContactEmail } from "./contact";
import { renderHeldResultReminderEmail, renderPartnerListingUpdatedEmail } from "./ops";
import {
  renderMilestoneEmail,
  renderPayoutEmail,
  renderReacceptEmail,
  renderReferralEarnedEmail,
} from "./partner";
import {
  renderHoldExpiredEmail,
  renderRestockEmail,
  renderResultAssignedEmail,
  renderResultHeldEmail,
} from "./results";
import { money } from "./format";
import { RMA_EMAIL_TEMPLATES } from "./rma";
import { ORDER_EMAIL_TEMPLATES } from "./templates";
import {
  sampleApplication,
  HOSTILE,
  sampleContact,
  sampleHeldReminder,
  sampleHoldExpired,
  sampleOrder,
  samplePartnerListing,
  sampleRestock,
  sampleResultAssigned,
  sampleResultHeld,
  sampleResultHeldNoHold,
  sampleRma,
  type EmailFixture,
} from "./__fixtures__/samples";
import type { EmailTemplateName, RenderedEmail } from "./types";
import type { RmaEmailTemplateName } from "./rma";

export type { EmailFixture };

export type EmailGroup =
  | "order"
  | "rma"
  | "partner"
  | "application"
  | "support"
  | "results"
  | "ops"
  | "auth";

export interface EmailCase {
  /** Stable slug — also the preview URL segment. */
  id: string;
  label: string;
  group: EmailGroup;
  audience: "customer" | "partner" | "staff";
  /** Pure renderer bound to the shared fixtures. */
  render: (fixture: EmailFixture) => RenderedEmail;
}

const ORDER_LABELS: Record<EmailTemplateName, string> = {
  order_confirmation: "Order confirmed",
  payment_receipt: "Payment receipt",
  shipping: "Order shipped",
  refund: "Refund issued",
};

const RMA_LABELS: Record<RmaEmailTemplateName, string> = {
  rma_requested: "Return requested",
  rma_approved: "Return approved",
  rma_rejected: "Return rejected",
  rma_instructions: "Return instructions",
  rma_completed: "Return complete",
  rma_refunded: "Return refunded",
};

const orderCases: EmailCase[] = (
  Object.keys(ORDER_EMAIL_TEMPLATES) as EmailTemplateName[]
).map((key) => ({
  id: `order.${key}`,
  label: ORDER_LABELS[key],
  group: "order",
  audience: "customer",
  render: (f) => ORDER_EMAIL_TEMPLATES[key](sampleOrder(f)),
}));

const rmaCases: EmailCase[] = (
  Object.keys(RMA_EMAIL_TEMPLATES) as RmaEmailTemplateName[]
).map((key) => ({
  id: `rma.${key}`,
  label: RMA_LABELS[key],
  group: "rma",
  audience: "customer",
  render: (f) => RMA_EMAIL_TEMPLATES[key](sampleRma(f)),
}));

export const EMAIL_REGISTRY: readonly EmailCase[] = [
  ...orderCases,
  ...rmaCases,

  // --- Results / configurator (customer) ---
  {
    id: "results.held",
    label: "Customisation under review",
    group: "results",
    audience: "customer",
    render: (f) => renderResultHeldEmail(sampleResultHeld(f)),
  },
  {
    // Same renderer, no Authorization hold (Assisted customisation). Registered
    // so the parameter variant gets a dev preview and the contract tests —
    // registry-coverage only enumerates render*Email FUNCTIONS, so it would
    // otherwise pass unnoticed.
    id: "results.held_no_hold",
    label: "Assisted submission received",
    group: "results",
    audience: "customer",
    render: (f) => renderResultHeldEmail(sampleResultHeldNoHold(f)),
  },
  {
    id: "results.assigned",
    label: "Final build ready",
    group: "results",
    audience: "customer",
    render: (f) => renderResultAssignedEmail(sampleResultAssigned(f)),
  },
  {
    id: "results.hold_expired",
    label: "Hold expired",
    group: "results",
    audience: "customer",
    render: (f) => renderHoldExpiredEmail(sampleHoldExpired(f)),
  },
  {
    id: "results.restocked",
    label: "Pre-order restocked",
    group: "results",
    audience: "customer",
    render: (f) => renderRestockEmail(sampleRestock(f)),
  },

  // --- Partner programme ---
  {
    id: "partner.referral_earned",
    label: "Commission earned",
    group: "partner",
    audience: "partner",
    render: (f) =>
      renderReferralEarnedEmail({
        money: f === "hostile" ? HOSTILE : money(48, "SGD"),
        releaseAtIso: "2026-09-04T02:00:00.000Z",
      }),
  },
  {
    id: "partner.milestone_reached",
    label: "Milestone reached",
    group: "partner",
    audience: "partner",
    render: (f) =>
      renderMilestoneEmail({
        tier: 2,
        bonus: money(75, "SGD"),
        perk: f === "hostile" ? `<img src=x onerror=alert(1)>` : "Priority support",
      }),
  },
  {
    id: "partner.payout_made",
    label: "Payout sent",
    group: "partner",
    audience: "partner",
    render: (f) =>
      renderPayoutEmail({
        money: f === "hostile" ? HOSTILE : money(240, "SGD"),
        paidOn: f === "hostile" ? HOSTILE : "1 August 2026",
        // Externally-sourced signed URL landing in an href.
        proofUrl:
          f === "hostile"
            ? "javascript:alert(1)"
            : "https://storage.mpillow.com/proofs/payout-9912.png?sig=abc",
      }),
  },
  {
    id: "partner.reaccept_terms",
    label: "Agreement re-accepted",
    group: "partner",
    audience: "partner",
    render: (f) =>
      renderReacceptEmail({
        agreementVersion: f === "hostile" ? `<script>alert(1)</script>` : "2026-07-28",
      }),
  },

  // --- Partner application outcome ---
  {
    id: "application.approved",
    label: "Application approved",
    group: "application",
    audience: "partner",
    render: (f) => renderApplicationOutcomeEmail("approved", sampleApplication(f)),
  },
  {
    id: "application.rejected",
    label: "Application rejected",
    group: "application",
    audience: "partner",
    render: (f) => renderApplicationOutcomeEmail("rejected", sampleApplication(f)),
  },

  // --- Identity ---
  {
    id: "auth.backup_email_otp",
    label: "Backup email verification code",
    group: "auth",
    audience: "partner",
    render: (f) => renderBackupEmailOtpEmail({ code: f === "hostile" ? HOSTILE : "418320" }),
  },

  // --- Support / staff ---
  {
    id: "support.contact",
    label: "Support form message",
    group: "support",
    audience: "staff",
    render: (f) => renderContactEmail(sampleContact(f)),
  },
  {
    id: "ops.partner_listing_updated",
    label: "Partner listing updated",
    group: "ops",
    audience: "staff",
    render: (f) => renderPartnerListingUpdatedEmail(samplePartnerListing(f)),
  },
  {
    id: "ops.held_result_reminder",
    label: "Held Result needs review",
    group: "ops",
    audience: "staff",
    render: (f) => renderHeldResultReminderEmail(sampleHeldReminder(f)),
  },
];

export function getEmailCase(id: string): EmailCase | undefined {
  return EMAIL_REGISTRY.find((c) => c.id === id);
}

export const EMAIL_GROUP_LABELS: Record<EmailGroup, string> = {
  order: "Orders",
  rma: "Returns",
  results: "Customisation",
  partner: "Partner programme",
  application: "Partner applications",
  auth: "Identity",
  support: "Support",
  ops: "Internal / ops",
};
