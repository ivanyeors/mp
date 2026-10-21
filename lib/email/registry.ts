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

import { renderWelcomeVoucherEmail } from "./account";
import { renderCheckupEmail, renderReviewRequestEmail } from "./aftercare";
import { renderApplicationOutcomeEmail } from "./application";
import { renderAdminInviteEmail, renderBackupEmailOtpEmail } from "./auth";
import { renderContactEmail } from "./contact";
import {
  renderMigrationAnnouncementEmail,
  renderMigrationReminderEmail,
  renderMigrationServiceNoticeEmail,
} from "./migration";
import { renderHeldResultReminderEmail, renderPartnerListingUpdatedEmail } from "./ops";
import {
  renderMilestoneEmail,
  renderPayoutEmail,
  renderReacceptEmail,
  renderReferralEarnedEmail,
} from "./partner";
import {
  renderBalanceDueReminderEmail,
  renderHoldExpiredEmail,
  renderPairedMbolsterRemovedEmail,
  renderRestockEmail,
  renderResultAssignedEmail,
  renderResultDeclinedEmail,
  renderResultHeldEmail,
  renderResultUpdatedEmail,
} from "./results";
import { money } from "./format";
import { getSiteOrigin } from "@/lib/site-url";
import { renderReadjustmentRescheduleEmail } from "./readjustment";
import { RMA_EMAIL_TEMPLATES } from "./rma";
import { ORDER_EMAIL_TEMPLATES } from "./templates";
import {
  sampleApplication,
  HOSTILE,
  sampleContact,
  sampleHeldReminder,
  sampleHoldExpired,
  sampleHoldExpiredUnpaid,
  sampleMigrationAnnouncement,
  sampleMigrationAnnouncementFreeShipping,
  sampleMigrationReminder,
  sampleMigrationServiceNotice,
  sampleOrder,
  samplePairedMbolsterRemoved,
  samplePairedMbolsterRemovedReady,
  samplePartnerListing,
  sampleBalanceDue,
  sampleBalanceDueFinish,
  sampleCheckup,
  sampleReadjustmentReschedule,
  sampleRestock,
  sampleReviewRequest,
  sampleReviewRequestNoName,
  sampleResultAssigned,
  sampleResultAssignedBalance,
  sampleResultAssignedFinish,
  sampleResultDeclined,
  sampleResultDeclinedNoHold,
  sampleResultHeld,
  sampleResultHeldNoHold,
  sampleResultUpdated,
  sampleResultUpdatedBalance,
  sampleResultUpdatedWithinHold,
  sampleRma,
  sampleWelcomeVoucher,
  sampleWelcomeVoucherFreeShipping,
  type EmailFixture,
} from "./__fixtures__/samples";
import type { EmailTemplateName, RenderedEmail } from "./types";
import type { RmaEmailTemplateName } from "./rma";

export type { EmailFixture };

export type EmailGroup =
  | "order"
  | "account"
  | "migration"
  | "aftercare"
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
  /**
   * Campaign mail (migration slice 08 onwards): rendered with an unsubscribe
   * link and sent with `List-Unsubscribe`. Every other entry is transactional
   * and must carry neither (`__tests__/transactional-no-unsubscribe.test.ts`).
   */
  campaign?: true;
  /** Pure renderer bound to the shared fixtures. */
  render: (fixture: EmailFixture) => RenderedEmail;
}

const ORDER_LABELS: Record<EmailTemplateName, string> = {
  order_confirmation: "Order confirmed",
  payment_receipt: "Payment receipt",
  shipping: "Order shipped",
  tracking_out_for_delivery: "Out for delivery",
  tracking_delivery_attempt: "Delivery attempt missed",
  tracking_delivered: "Order delivered",
  tracking_exception: "Delivery problem",
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
    // Same renderer, the unpaid voice: the build was finished and priced and
    // the hold died before anyone accepted it. The sentence about whose delay
    // it was is the one most likely to be wrong, so it gets its own preview.
    id: "results.hold_expired_unpaid",
    label: "Hold expired — build never paid for",
    group: "results",
    audience: "customer",
    render: (f) => renderHoldExpiredEmail(sampleHoldExpiredUnpaid(f)),
  },
  {
    id: "results.declined",
    label: "Order cancelled by customer",
    group: "results",
    audience: "customer",
    render: (f) => renderResultDeclinedEmail(sampleResultDeclined(f)),
  },
  {
    // Same renderer with no hold to release (Assisted / no-card): the money
    // sentence is the only thing that differs, and it is the sentence most
    // likely to be wrong, so it gets its own preview.
    id: "results.declined_no_hold",
    label: "Order cancelled — no card taken",
    group: "results",
    audience: "customer",
    render: (f) => renderResultDeclinedEmail(sampleResultDeclinedNoHold(f)),
  },
  {
    id: "results.assigned",
    label: "Final build ready",
    group: "results",
    audience: "customer",
    render: (f) => renderResultAssignedEmail(sampleResultAssigned(f)),
  },
  {
    // Same renderer, no Authorization hold (Assisted customisation): the whole
    // total is owed by Balance payment, so the ask is "pay", not "accept".
    // Registered for the dev preview and contract.test.ts — registry-coverage
    // only enumerates render*Email FUNCTIONS, so a parameter variant is invisible
    // to it.
    id: "results.assigned_balance",
    label: "Final build ready — payment due",
    group: "results",
    audience: "customer",
    render: (f) => renderResultAssignedEmail(sampleResultAssignedBalance(f)),
  },
  {
    // Assisted customisation sent from the questionnaire (ADR 0017): fillings
    // built, the customer still chooses cover, case and shipping.
    id: "results.assigned_finish",
    label: "Build ready — choose your finish",
    group: "results",
    audience: "customer",
    render: (f) => renderResultAssignedEmail(sampleResultAssignedFinish(f)),
  },
  {
    // Staff re-configured a build the customer already has, and the total grew
    // past their Authorization hold: the balance is paid at checkout.
    id: "results.updated",
    label: "Build updated — balance due",
    group: "results",
    audience: "customer",
    render: (f) => renderResultUpdatedEmail(sampleResultUpdated(f)),
  },
  {
    // Same renderer, hold still covers the new total — nothing extra to pay.
    // Registered for the preview and contract.test.ts: registry-coverage only
    // enumerates render*Email FUNCTIONS, so a parameter variant is invisible to it.
    id: "results.updated_within_hold",
    label: "Build updated — hold covers it",
    group: "results",
    audience: "customer",
    render: (f) => renderResultUpdatedEmail(sampleResultUpdatedWithinHold(f)),
  },
  {
    // Same renderer, no Authorization hold (Assisted customisation).
    id: "results.updated_balance",
    label: "Build updated — payment due",
    group: "results",
    audience: "customer",
    render: (f) => renderResultUpdatedEmail(sampleResultUpdatedBalance(f)),
  },
  {
    id: "results.balance_due",
    label: "Build ready — payment due",
    group: "results",
    audience: "customer",
    render: (f) => renderBalanceDueReminderEmail(sampleBalanceDue(f)),
  },
  {
    id: "results.balance_due_finish",
    label: "Build ready — finish reminder",
    group: "results",
    audience: "customer",
    render: (f) => renderBalanceDueReminderEmail(sampleBalanceDueFinish(f)),
  },
  {
    id: "results.hold_expired",
    label: "Hold expired",
    group: "results",
    audience: "customer",
    render: (f) => renderHoldExpiredEmail(sampleHoldExpired(f)),
  },
  {
    // A Paired build (ADR 0026) whose Mbolster ended on its own. Never a "hold
    // released" email: the Mpillow still needs the hold.
    id: "results.paired_mbolster_removed",
    label: "Paired build — Mbolster removed",
    group: "results",
    audience: "customer",
    render: (f) => renderPairedMbolsterRemovedEmail(samplePairedMbolsterRemoved(f)),
  },
  {
    // Same renderer once the Mpillow is assigned: it doubles as the Mpillow's
    // "ready" email, which was held back while the Mbolster was being built.
    id: "results.paired_mbolster_removed_ready",
    label: "Paired build — Mbolster removed, Mpillow ready",
    group: "results",
    audience: "customer",
    render: (f) => renderPairedMbolsterRemovedEmail(samplePairedMbolsterRemovedReady(f)),
  },
  {
    id: "results.restocked",
    label: "Pre-order restocked",
    group: "results",
    audience: "customer",
    render: (f) => renderRestockEmail(sampleRestock(f)),
  },
  {
    id: "readjustment.reschedule",
    label: "Re-adjustment paid — new time needed",
    group: "results",
    audience: "customer",
    render: (f) => renderReadjustmentRescheduleEmail(sampleReadjustmentReschedule(f)),
  },

  // --- Customer account ---
  {
    // Sent once, at the Claim (PRD-shopify-customer-migration slice 05). The
    // id is also its customer_emails.template (WELCOME_VOUCHER_EMAIL).
    id: "account.welcome_voucher",
    label: "Welcome-back voucher",
    group: "account",
    audience: "customer",
    render: (f) => renderWelcomeVoucherEmail(sampleWelcomeVoucher(f)),
  },
  {
    // Same renderer, free-shipping terms and no first name: the "worth" line
    // and the greeting are the two sentences that change.
    id: "account.welcome_voucher_free_shipping",
    label: "Welcome-back voucher — free shipping",
    group: "account",
    audience: "customer",
    render: (f) => renderWelcomeVoucherEmail(sampleWelcomeVoucherFreeShipping(f)),
  },

  // --- Campaign: the Shopify customer migration (slice 08) ---
  // Campaign mail: rendered with the unsubscribe link, sent with
  // List-Unsubscribe, through the campaign transport only. Each id is the
  // CAMPAIGN_EMAIL_IDS entry (lib/customer-migration/campaign.ts) of its
  // customer_campaign_sends.template.
  {
    id: "migration.announcement",
    label: "Shopify move: account ready",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationAnnouncementEmail(sampleMigrationAnnouncement(f)),
  },
  {
    // Same renderer, free-shipping terms, no minimum and no first name: the
    // offer line and the greeting are the sentences that change.
    id: "migration.announcement_free_shipping",
    label: "Shopify move: account ready — free shipping",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationAnnouncementEmail(sampleMigrationAnnouncementFreeShipping(f)),
  },
  {
    id: "migration.reminder",
    label: "Shopify move: voucher reminder",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationReminderEmail(sampleMigrationReminder(f)),
  },
  {
    // To customers who never agreed to marketing, once, and only if owner
    // decision 3 says so. No offer, voucher or promotion.
    id: "migration.service_notice",
    label: "Shopify move: service notice",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationServiceNoticeEmail(sampleMigrationServiceNotice(f)),
  },

  // --- Aftercare (PRD customer-crm slices 07, 08) ---
  {
    // Once per Customer, 14 days after delivery. The id is also its
    // customer_emails.template (REVIEW_REQUEST_TEMPLATE).
    id: "aftercare.review_request",
    label: "Review request",
    group: "aftercare",
    audience: "customer",
    render: (f) => renderReviewRequestEmail(sampleReviewRequest(f)),
  },
  {
    // Same renderer with no first name on file: the greeting is the one line
    // that changes.
    id: "aftercare.review_request_no_name",
    label: "Review request — no first name",
    group: "aftercare",
    audience: "customer",
    render: (f) => renderReviewRequestEmail(sampleReviewRequestNoName(f)),
  },
  {
    // Yearly, Premium Mpillow only, stating the fee from Costings; email needs
    // Marketing consent. Its customer_emails.template is the milestone,
    // `aftercare.checkup_<n>m` (checkupTemplate), with the Order as entity.
    id: "aftercare.checkup",
    label: "Check-up reminder",
    group: "aftercare",
    audience: "customer",
    render: (f) => renderCheckupEmail(sampleCheckup(f)),
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
  {
    id: "auth.admin_invite",
    label: "Admin Panel invite",
    group: "auth",
    audience: "staff",
    render: (f) =>
      renderAdminInviteEmail({
        inviterEmail: f === "hostile" ? HOSTILE : "sg@mpillow.com",
        invitedEmail: f === "hostile" ? HOSTILE : "jess@example.com",
        roleName: f === "hostile" ? HOSTILE : "Fulfilment",
        signInUrl: `${getSiteOrigin()}/en-US/account/login?next=%2Fen-US%2Fsettings`,
      }),
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
  account: "Customer account",
  migration: "Shopify move (campaign)",
  aftercare: "Aftercare",
  rma: "Returns",
  results: "Customisation",
  partner: "Partner programme",
  application: "Partner applications",
  auth: "Identity",
  support: "Support",
  ops: "Internal / ops",
};
