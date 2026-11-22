import { CLAIM_BONUS_EMAIL_COPY, renderClaimBonusEmail } from "./account";
import { CHECKUP_EMAIL_COPY, REVIEW_REQUEST_EMAIL_COPY, renderCheckupEmail, renderReviewRequestEmail } from "./aftercare";
import { DRAFT_REMINDER_EMAIL_COPY, renderDraftReminderEmail } from "./draft-reminder";
import { APPLICATION_EMAIL_COPY, renderApplicationOutcomeEmail } from "./application";
import { AUTH_EMAIL_COPY, renderAdminInviteEmail, renderBackupEmailOtpEmail } from "./auth";
import { renderCampaignBlocksEmail } from "./campaign-blocks";
import { renderComposedCampaignEmail } from "./campaigns";
import { renderChatCodeEmail, renderChatTranscriptEmail } from "./support-chat";
import {
  renderMigrationAnnouncementEmail,
  renderMigrationReminderEmail,
  renderMigrationServiceNoticeEmail,
} from "./migration";
import { renderHeldResultReminderEmail, renderPartnerListingUpdatedEmail } from "./ops";
import {
  PARTNER_EMAIL_COPY,
  renderMilestoneEmail,
  renderPayoutEmail,
  renderReacceptEmail,
  renderReferralEarnedEmail,
} from "./partner";
import {
  RESULT_EMAIL_COPY,
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
import {
  READJUSTMENT_CANCELLED_EMAIL_COPY,
  READJUSTMENT_RESCHEDULE_EMAIL_COPY,
  renderReadjustmentCancelledEmail,
  renderReadjustmentRescheduleEmail,
  type CancelledFee,
} from "./readjustment";
import { PAYMENT_REQUEST_EMAIL_COPY, renderPaymentRequestEmail } from "./payment-request";
import { RMA_EMAIL_COPY, RMA_EMAIL_TEMPLATES, renderRmaEmail } from "./rma";
import { ORDER_EMAIL_COPY, ORDER_EMAIL_TEMPLATES, renderOrderEmail } from "./templates";
import {
  sampleApplication,
  HOSTILE,
  sampleChatTranscript,
  sampleHeldReminder,
  sampleHoldExpired,
  sampleHoldExpiredUnpaid,
  sampleMigrationAnnouncement,
  sampleMigrationAnnouncementNoName,
  sampleMigrationReminder,
  sampleMigrationServiceNotice,
  sampleOrder,
  sampleOrderWithPoints,
  samplePaymentRequest,
  samplePaymentRequestCollect,
  samplePairedMbolsterRemoved,
  samplePairedMbolsterRemovedReady,
  samplePartnerListing,
  sampleBalanceDue,
  sampleBalanceDueFinish,
  sampleCheckup,
  sampleDraftReminder,
  sampleClaimBonus,
  sampleCampaignBlocks,
  sampleComposedCampaign,
  sampleReadjustmentCancelled,
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
  type EmailFixture,
} from "./__fixtures__/samples";
import type { EmailCopy, EmailCopySpec } from "./copy";
import type { EmailTemplateName, RenderedEmail } from "./types";
import type { RmaEmailTemplateName } from "./rma";

export type { EmailFixture };

export type EmailGroup =
  | "order"
  | "account"
  | "migration"
  | "campaign"
  | "aftercare"
  | "rma"
  | "partner"
  | "application"
  | "support"
  | "results"
  | "ops"
  | "auth";

export interface EmailCase {
  id: string;
  label: string;
  group: EmailGroup;
  audience: "customer" | "partner" | "staff";
  campaign?: true;
  copy?: EmailCopySpec;
  render: (fixture: EmailFixture, copy?: EmailCopy) => RenderedEmail;
}

const copyFor = <S extends EmailCopySpec>(_spec: S, copy?: EmailCopy) =>
  copy as EmailCopy<keyof S["fields"] & string> | undefined;

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

const SHIPMENT_EMAILS = new Set<EmailTemplateName>([
  "shipping",
  "tracking_out_for_delivery",
  "tracking_delivery_attempt",
  "tracking_delivered",
  "tracking_exception",
]);

const POINTS_EMAILS = new Set<EmailTemplateName>(["order_confirmation", "payment_receipt"]);

const orderCases: EmailCase[] = (
  Object.keys(ORDER_EMAIL_TEMPLATES) as EmailTemplateName[]
).flatMap((key): EmailCase[] => {
  const base: EmailCase = {
    id: `order.${key}`,
    label: ORDER_LABELS[key],
    group: "order",
    audience: "customer",
    copy: ORDER_EMAIL_COPY[key],
    render: (f, copy) => renderOrderEmail(key, sampleOrder(f), copy),
  };
  if (POINTS_EMAILS.has(key)) {
    return [
      base,
      {
        ...base,
        id: `order.${key}_points`,
        label: `${ORDER_LABELS[key]} — with points`,
        render: (f, copy) => renderOrderEmail(key, sampleOrderWithPoints(f), copy),
      },
    ];
  }
  if (!SHIPMENT_EMAILS.has(key)) return [base];
  return [
    base,
    {
      ...base,
      id: `order.${key}_no_tracking`,
      label: `${ORDER_LABELS[key]} — no tracking link`,
      render: (f, copy) => renderOrderEmail(key, { ...sampleOrder(f), trackingUrl: null }, copy),
    },
  ];
});

const rmaCases: EmailCase[] = (
  Object.keys(RMA_EMAIL_TEMPLATES) as RmaEmailTemplateName[]
).map((key) => ({
  id: `rma.${key}`,
  label: RMA_LABELS[key],
  group: "rma",
  audience: "customer",
  copy: RMA_EMAIL_COPY[key],
  render: (f, copy) => renderRmaEmail(key, sampleRma(f), copy),
}));

export const EMAIL_REGISTRY: readonly EmailCase[] = [
  ...orderCases,

  {
    id: "order.payment_request",
    label: "Payment request",
    group: "order",
    audience: "customer",
    copy: PAYMENT_REQUEST_EMAIL_COPY,
    render: (f, copy) => renderPaymentRequestEmail(samplePaymentRequest(f), copyFor(PAYMENT_REQUEST_EMAIL_COPY, copy)),
  },
  {
    id: "order.payment_request_collect",
    label: "Payment request — collect from a studio",
    group: "order",
    audience: "customer",
    copy: PAYMENT_REQUEST_EMAIL_COPY,
    render: (f, copy) =>
      renderPaymentRequestEmail(samplePaymentRequestCollect(f), copyFor(PAYMENT_REQUEST_EMAIL_COPY, copy)),
  },
  ...rmaCases,

  {
    id: "results.held",
    label: "Customisation under review",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.held,
    render: (f, copy) => renderResultHeldEmail(sampleResultHeld(f), copyFor(RESULT_EMAIL_COPY.held, copy)),
  },
  {
    id: "results.held_no_hold",
    label: "Assisted submission received",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.held,
    render: (f, copy) => renderResultHeldEmail(sampleResultHeldNoHold(f), copyFor(RESULT_EMAIL_COPY.held, copy)),
  },
  {
    id: "results.hold_expired_unpaid",
    label: "Hold expired — build never paid for",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.hold_expired,
    render: (f, copy) => renderHoldExpiredEmail(sampleHoldExpiredUnpaid(f), copyFor(RESULT_EMAIL_COPY.hold_expired, copy)),
  },
  {
    id: "results.hold_expired_unpaid_no_link",
    label: "Hold expired — never paid for, no link back",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.hold_expired,
    render: (f, copy) => renderHoldExpiredEmail({ ...sampleHoldExpiredUnpaid(f), accessToken: null }, copyFor(RESULT_EMAIL_COPY.hold_expired, copy)),
  },
  {
    id: "results.declined",
    label: "Order cancelled by customer",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.declined,
    render: (f, copy) => renderResultDeclinedEmail(sampleResultDeclined(f), copyFor(RESULT_EMAIL_COPY.declined, copy)),
  },
  {
    id: "results.declined_restart",
    label: "Order cancelled — start again",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.declined,
    render: (f, copy) => renderResultDeclinedEmail({ ...sampleResultDeclined(f), accessToken: null }, copyFor(RESULT_EMAIL_COPY.declined, copy)),
  },
  {
    id: "results.declined_no_hold",
    label: "Order cancelled — no card taken",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.declined,
    render: (f, copy) => renderResultDeclinedEmail(sampleResultDeclinedNoHold(f), copyFor(RESULT_EMAIL_COPY.declined, copy)),
  },
  {
    id: "results.assigned",
    label: "Final build ready",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.assigned,
    render: (f, copy) => renderResultAssignedEmail(sampleResultAssigned(f), copyFor(RESULT_EMAIL_COPY.assigned, copy)),
  },
  {
    id: "results.assigned_balance",
    label: "Final build ready — payment due",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.assigned,
    render: (f, copy) => renderResultAssignedEmail(sampleResultAssignedBalance(f), copyFor(RESULT_EMAIL_COPY.assigned, copy)),
  },
  {
    id: "results.assigned_finish",
    label: "Build ready — choose your finish",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.assigned,
    render: (f, copy) => renderResultAssignedEmail(sampleResultAssignedFinish(f), copyFor(RESULT_EMAIL_COPY.assigned, copy)),
  },
  {
    id: "results.updated",
    label: "Build updated — balance due",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.updated,
    render: (f, copy) => renderResultUpdatedEmail(sampleResultUpdated(f), copyFor(RESULT_EMAIL_COPY.updated, copy)),
  },
  {
    id: "results.updated_same_total",
    label: "Build updated — same total",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.updated,
    render: (f, copy) => renderResultUpdatedEmail({ ...sampleResultUpdated(f), previousTotal: null }, copyFor(RESULT_EMAIL_COPY.updated, copy)),
  },
  {
    id: "results.updated_within_hold",
    label: "Build updated — hold covers it",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.updated,
    render: (f, copy) => renderResultUpdatedEmail(sampleResultUpdatedWithinHold(f), copyFor(RESULT_EMAIL_COPY.updated, copy)),
  },
  {
    id: "results.updated_balance",
    label: "Build updated — payment due",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.updated,
    render: (f, copy) => renderResultUpdatedEmail(sampleResultUpdatedBalance(f), copyFor(RESULT_EMAIL_COPY.updated, copy)),
  },
  {
    id: "results.balance_due",
    label: "Build ready — payment due",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.balance_due,
    render: (f, copy) => renderBalanceDueReminderEmail(sampleBalanceDue(f), copyFor(RESULT_EMAIL_COPY.balance_due, copy)),
  },
  {
    id: "results.balance_due_finish",
    label: "Build ready — finish reminder",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.balance_due,
    render: (f, copy) => renderBalanceDueReminderEmail(sampleBalanceDueFinish(f), copyFor(RESULT_EMAIL_COPY.balance_due, copy)),
  },
  {
    id: "results.draft_reminder_1d",
    label: "Finish your pillow — 1 day",
    group: "results",
    audience: "customer",
    campaign: true,
    copy: DRAFT_REMINDER_EMAIL_COPY,
    render: (f, copy) => renderDraftReminderEmail(sampleDraftReminder(f, "1d"), copyFor(DRAFT_REMINDER_EMAIL_COPY, copy)),
  },
  {
    id: "results.draft_reminder_1w",
    label: "Finish your pillow — 1 week",
    group: "results",
    audience: "customer",
    campaign: true,
    copy: DRAFT_REMINDER_EMAIL_COPY,
    render: (f, copy) => renderDraftReminderEmail(sampleDraftReminder(f, "1w"), copyFor(DRAFT_REMINDER_EMAIL_COPY, copy)),
  },
  {
    id: "results.draft_reminder_1m",
    label: "Finish your pillow — 1 month",
    group: "results",
    audience: "customer",
    campaign: true,
    copy: DRAFT_REMINDER_EMAIL_COPY,
    render: (f, copy) => renderDraftReminderEmail(sampleDraftReminder(f, "1m"), copyFor(DRAFT_REMINDER_EMAIL_COPY, copy)),
  },
  {
    id: "results.draft_reminder_no_name",
    label: "Finish your pillow — no name",
    group: "results",
    audience: "customer",
    campaign: true,
    copy: DRAFT_REMINDER_EMAIL_COPY,
    render: (f, copy) =>
      renderDraftReminderEmail({ ...sampleDraftReminder(f, "1d"), name: null }, copyFor(DRAFT_REMINDER_EMAIL_COPY, copy)),
  },
  {
    id: "results.hold_expired",
    label: "Hold expired",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.hold_expired,
    render: (f, copy) => renderHoldExpiredEmail(sampleHoldExpired(f), copyFor(RESULT_EMAIL_COPY.hold_expired, copy)),
  },
  {
    id: "results.paired_mbolster_removed",
    label: "Paired build — Mbolster removed",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.paired_mbolster_removed,
    render: (f, copy) => renderPairedMbolsterRemovedEmail(samplePairedMbolsterRemoved(f), copyFor(RESULT_EMAIL_COPY.paired_mbolster_removed, copy)),
  },
  {
    id: "results.paired_mbolster_removed_ready",
    label: "Paired build — Mbolster removed, Mpillow ready",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.paired_mbolster_removed,
    render: (f, copy) => renderPairedMbolsterRemovedEmail(samplePairedMbolsterRemovedReady(f), copyFor(RESULT_EMAIL_COPY.paired_mbolster_removed, copy)),
  },
  {
    id: "results.restocked",
    label: "Pre-order restocked",
    group: "results",
    audience: "customer",
    copy: RESULT_EMAIL_COPY.restocked,
    render: (f, copy) => renderRestockEmail(sampleRestock(f), copyFor(RESULT_EMAIL_COPY.restocked, copy)),
  },
  {
    id: "readjustment.reschedule",
    label: "Re-adjustment paid — new time needed",
    group: "results",
    audience: "customer",
    copy: READJUSTMENT_RESCHEDULE_EMAIL_COPY,
    render: (f, copy) => renderReadjustmentRescheduleEmail(sampleReadjustmentReschedule(f), copy),
  },
  {
    id: "readjustment.cancelled_refunded",
    label: "Paid re-adjustment cancelled — refunded",
    group: "results",
    audience: "customer",
    copy: READJUSTMENT_CANCELLED_EMAIL_COPY,
    render: (f, copy) =>
      renderReadjustmentCancelledEmail(sampleReadjustmentCancelled(f, "refunded" satisfies CancelledFee), copy),
  },
  {
    id: "readjustment.cancelled_visit_day",
    label: "Paid re-adjustment cancelled — on the visit day",
    group: "results",
    audience: "customer",
    copy: READJUSTMENT_CANCELLED_EMAIL_COPY,
    render: (f, copy) =>
      renderReadjustmentCancelledEmail(sampleReadjustmentCancelled(f, "visit_day" satisfies CancelledFee), copy),
  },
  {
    id: "readjustment.cancelled_paynow",
    label: "Paid re-adjustment cancelled — paid by PayNow",
    group: "results",
    audience: "customer",
    copy: READJUSTMENT_CANCELLED_EMAIL_COPY,
    render: (f, copy) =>
      renderReadjustmentCancelledEmail(sampleReadjustmentCancelled(f, "paynow" satisfies CancelledFee), copy),
  },
  {
    id: "readjustment.cancelled_refund_failed",
    label: "Paid re-adjustment cancelled — refund failed",
    group: "results",
    audience: "customer",
    copy: READJUSTMENT_CANCELLED_EMAIL_COPY,
    render: (f, copy) =>
      renderReadjustmentCancelledEmail(sampleReadjustmentCancelled(f, "refund_failed" satisfies CancelledFee), copy),
  },

  {
    id: "account.claim_bonus",
    label: "Points for signing in",
    group: "account",
    audience: "customer",
    copy: CLAIM_BONUS_EMAIL_COPY,
    render: (f, copy) => renderClaimBonusEmail(sampleClaimBonus(f), copyFor(CLAIM_BONUS_EMAIL_COPY, copy)),
  },
  {
    id: "account.claim_bonus_no_name",
    label: "Points for signing in — no first name",
    group: "account",
    audience: "customer",
    copy: CLAIM_BONUS_EMAIL_COPY,
    render: (f, copy) =>
      renderClaimBonusEmail(
        { ...sampleClaimBonus(f), firstName: null, ...(f === "hostile" ? { shopUrl: "javascript:alert(1)", termsUrl: "javascript:alert(2)" } : {}) },
        copyFor(CLAIM_BONUS_EMAIL_COPY, copy),
      ),
  },

  {
    id: "migration.announcement",
    label: "New website: account ready",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationAnnouncementEmail(sampleMigrationAnnouncement(f)),
  },
  {
    id: "migration.announcement_no_name",
    label: "New website: account ready — no first name",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationAnnouncementEmail(sampleMigrationAnnouncementNoName(f)),
  },
  {
    id: "migration.reminder",
    label: "New website: points reminder",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationReminderEmail(sampleMigrationReminder(f)),
  },
  {
    id: "migration.service_notice",
    label: "New website: service notice",
    group: "migration",
    audience: "customer",
    campaign: true,
    render: (f) => renderMigrationServiceNoticeEmail(sampleMigrationServiceNotice(f)),
  },

  {
    id: "campaign.composed",
    label: "Email campaign (written in the Admin Panel)",
    group: "campaign",
    audience: "customer",
    campaign: true,
    render: (f) => renderComposedCampaignEmail(sampleComposedCampaign(f)),
  },
  {
    id: "campaign.blocks",
    label: "Email campaign built from blocks",
    group: "campaign",
    audience: "customer",
    campaign: true,
    render: (f) => renderCampaignBlocksEmail(sampleCampaignBlocks(f)),
  },

  {
    id: "aftercare.review_request",
    label: "Review request",
    group: "aftercare",
    audience: "customer",
    copy: REVIEW_REQUEST_EMAIL_COPY,
    render: (f, copy) => renderReviewRequestEmail(sampleReviewRequest(f), copy),
  },
  {
    id: "aftercare.review_request_no_name",
    label: "Review request — no first name",
    group: "aftercare",
    audience: "customer",
    copy: REVIEW_REQUEST_EMAIL_COPY,
    render: (f, copy) => renderReviewRequestEmail(sampleReviewRequestNoName(f), copy),
  },
  {
    id: "aftercare.checkup",
    label: "Check-up reminder",
    group: "aftercare",
    audience: "customer",
    copy: CHECKUP_EMAIL_COPY,
    render: (f, copy) => renderCheckupEmail(sampleCheckup(f), copy),
  },
  {
    id: "aftercare.checkup_no_name",
    label: "Check-up reminder — no first name",
    group: "aftercare",
    audience: "customer",
    copy: CHECKUP_EMAIL_COPY,
    render: (f, copy) => renderCheckupEmail({ ...sampleCheckup(f), firstName: null }, copy),
  },

  {
    id: "partner.referral_earned",
    label: "Commission earned",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.referral_earned,
    render: (f, copy) =>
      renderReferralEarnedEmail(
        {
          money: f === "hostile" ? HOSTILE : money(48, "SGD"),
          releaseAtIso: "2026-09-04T02:00:00.000Z",
        },
        copyFor(PARTNER_EMAIL_COPY.referral_earned, copy),
      ),
  },
  {
    id: "partner.referral_earned_undated",
    label: "Commission earned — order not yet delivered",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.referral_earned,
    render: (f, copy) =>
      renderReferralEarnedEmail({ money: f === "hostile" ? HOSTILE : money(48, "SGD"), releaseAtIso: null }, copyFor(PARTNER_EMAIL_COPY.referral_earned, copy)),
  },
  {
    id: "partner.milestone_reached",
    label: "Milestone reached",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.milestone_reached,
    render: (f, copy) =>
      renderMilestoneEmail(
        {
          tier: 2,
          bonus: money(75, "SGD"),
          perk: f === "hostile" ? `<img src=x onerror=alert(1)>` : "Priority support",
        },
        copyFor(PARTNER_EMAIL_COPY.milestone_reached, copy),
      ),
  },
  {
    id: "partner.payout_made",
    label: "Payout sent",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.payout_made,
    render: (f, copy) =>
      renderPayoutEmail(
        {
          money: f === "hostile" ? HOSTILE : money(240, "SGD"),
          paidOn: f === "hostile" ? HOSTILE : "1 August 2026",
          proofUrl:
            f === "hostile"
              ? "javascript:alert(1)"
              : "https://storage.mpillow.com/proofs/payout-9912.png?sig=abc",
        },
        copyFor(PARTNER_EMAIL_COPY.payout_made, copy),
      ),
  },
  {
    id: "partner.payout_made_no_proof",
    label: "Payout sent — no proof attached",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.payout_made,
    render: (f, copy) =>
      renderPayoutEmail(
        { money: f === "hostile" ? HOSTILE : money(240, "SGD"), paidOn: f === "hostile" ? HOSTILE : "1 August 2026", proofUrl: null },
        copyFor(PARTNER_EMAIL_COPY.payout_made, copy),
      ),
  },
  {
    id: "partner.reaccept_terms",
    label: "Agreement re-accepted",
    group: "partner",
    audience: "partner",
    copy: PARTNER_EMAIL_COPY.reaccept_terms,
    render: (f, copy) =>
      renderReacceptEmail(
        {
          agreementVersion: f === "hostile" ? `<script>alert(1)</script>` : "2026-07-28",
        },
        copyFor(PARTNER_EMAIL_COPY.reaccept_terms, copy),
      ),
  },

  {
    id: "application.approved",
    label: "Application approved",
    group: "application",
    audience: "partner",
    copy: APPLICATION_EMAIL_COPY.approved,
    render: (f, copy) => renderApplicationOutcomeEmail("approved", sampleApplication(f), copy),
  },
  {
    id: "application.rejected",
    label: "Application rejected",
    group: "application",
    audience: "partner",
    copy: APPLICATION_EMAIL_COPY.rejected,
    render: (f, copy) => renderApplicationOutcomeEmail("rejected", sampleApplication(f), copy),
  },

  {
    id: "auth.backup_email_otp",
    label: "Backup email verification code",
    group: "auth",
    audience: "partner",
    copy: AUTH_EMAIL_COPY.backup_email_otp,
    render: (f, copy) => renderBackupEmailOtpEmail({ code: f === "hostile" ? HOSTILE : "418320" }, copyFor(AUTH_EMAIL_COPY.backup_email_otp, copy)),
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

  {
    id: "support.chat_transcript",
    label: "Website chat transcript (support inbox and sg@ on Cc)",
    group: "support",
    audience: "customer",
    render: (f) => renderChatTranscriptEmail(sampleChatTranscript(f)),
  },
  {
    id: "support.chat_code",
    label: "Website chat code (checks the email before the first message)",
    group: "support",
    audience: "customer",
    render: (f) => renderChatCodeEmail({ code: f === "hostile" ? HOSTILE : "482913" }),
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
  migration: "New website (campaign)",
  campaign: "Email campaigns",
  aftercare: "Aftercare",
  rma: "Returns",
  results: "Customisation",
  partner: "Partner programme",
  application: "Partner applications",
  auth: "Identity",
  support: "Support",
  ops: "Internal / ops",
};
