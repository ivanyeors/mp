import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabaseAdmin, type FakeDb } from "@/lib/supabase/__tests__/fake-admin";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: vi.fn(), intentPaymentMethodType: vi.fn() }));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: vi.fn() }));

const { visitDayFeeByEvent } = await import("@/lib/readjustment/lifecycle");

const EVENT = "gcal-evt-1";
const VISIT = "2026-11-25T02:00:00.000Z";
const VISIT_DAY_MORNING = new Date("2026-11-25T00:30:00Z");
const JUST_AFTER_SGT_MIDNIGHT = new Date("2026-11-24T16:05:00Z");
const DAY_BEFORE_LATE = new Date("2026-11-24T15:30:00Z");
const AFTER_START = new Date("2026-11-25T03:00:00Z");

let db: FakeDb;

const booking = (extra: Record<string, unknown> = {}) => ({
  id: "bk-1",
  calendar_event_id: EVENT,
  status: "booked",
  complimentary: false,
  fee_order_id: "ord-1",
  start_at: VISIT,
  ...extra,
});

const order = (extra: Record<string, unknown> = {}) => ({
  id: "ord-1",
  order_number: "1077",
  status: "confirmed",
  payment_reference: "pi_123",
  currency: "sgd",
  total: 32.7,
  amount_captured: 32.7,
  amount_refunded: 0,
  ...extra,
});

const feeAt = (now: Date, startsAt = VISIT) => visitDayFeeByEvent(EVENT, startsAt, now, fakeSupabaseAdmin(db) as never);

beforeEach(() => {
  db = { readjustment_bookings: [booking()], orders: [order()] };
});

describe("visitDayFeeByEvent: the fee a customer cancelling now would not get back automatically", () => {
  it("is the paid fee on the visit day, from Singapore midnight", async () => {
    const fee = { amount: 32.7, currency: "SGD", orderNumber: "1077" };
    expect(await feeAt(VISIT_DAY_MORNING)).toEqual(fee);
    expect(await feeAt(JUST_AFTER_SGT_MIDNIGHT)).toEqual(fee);
  });

  it("is nothing the day before, when the cancel is refunded automatically", async () => {
    expect(await feeAt(DAY_BEFORE_LATE)).toBeNull();
  });

  it("judges the visit's live time, not the stored one", async () => {
    expect(await feeAt(VISIT_DAY_MORNING, "2026-11-26T02:00:00.000Z")).toBeNull();
  });

  it("is nothing once the visit has started", async () => {
    expect(await feeAt(AFTER_START)).toBeNull();
  });

  it("is nothing for a free visit, an unpaid one, or a booking already cancelled", async () => {
    db.readjustment_bookings = [booking({ complimentary: true })];
    expect(await feeAt(VISIT_DAY_MORNING)).toBeNull();
    db.readjustment_bookings = [booking({ fee_order_id: null })];
    expect(await feeAt(VISIT_DAY_MORNING)).toBeNull();
    db.readjustment_bookings = [booking({ status: "cancelled" })];
    expect(await feeAt(VISIT_DAY_MORNING)).toBeNull();
  });

  it("is what is left of the fee, and nothing once it is refunded", async () => {
    db.orders = [order({ status: "partially_refunded", amount_refunded: 12.7 })];
    expect(await feeAt(VISIT_DAY_MORNING)).toMatchObject({ amount: 20 });
    db.orders = [order({ status: "refunded", amount_refunded: 32.7 })];
    expect(await feeAt(VISIT_DAY_MORNING)).toBeNull();
  });

  it("is nothing when no re-adjustment is behind the calendar event", async () => {
    db.readjustment_bookings = [];
    expect(await feeAt(VISIT_DAY_MORNING)).toBeNull();
  });

  it("throws when the booking can't be read, so the caller does not cancel blind", async () => {
    const broken = {
      from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: null, error: { message: "db down" } }) }) }) }),
    };
    await expect(visitDayFeeByEvent(EVENT, VISIT, VISIT_DAY_MORNING, broken as never)).rejects.toThrow("db down");
  });
});
