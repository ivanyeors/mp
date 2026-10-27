import { describe, it, expect } from "vitest";
import {
  SCHEDULE_COMMISSION_POOL,
  partnerTermsOf,
  sgtDate,
  payoutDateOf,
  nextPayoutDate,
  choiceChangeStartsOn,
  choiceInEffect,
  commissionInEffect,
  customerDiscountInEffect,
  pickCommission,
  isEligibleBuild,
  isEligibleOrderItem,
  type PartnerTerms,
  type PartnerTermsRow,
  type CommissionOrderItem,
} from "@/lib/partner-terms";

// Expected values come from the Referral Partner Agreement and the owner's
// decisions, not from the implementation. Calendar facts were checked against
// a calendar (e.g. 31 Oct 2026 is a Saturday, 31 May 2026 a Sunday).

const terms = (over: Partial<PartnerTerms> = {}): PartnerTerms => ({
  pool: 50,
  choice: null,
  nextChoice: null,
  nextChoiceFrom: null,
  customerDiscount: false,
  ...over,
});

/** Independent oracle: the last Monday–Friday of a 1-based month, as YYYY-MM-DD. */
function lastWeekdayOf(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this month
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function* daysBetween(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

describe("SCHEDULE_COMMISSION_POOL — the Schedule's default pool", () => {
  it("is S$50", () => {
    expect(SCHEDULE_COMMISSION_POOL).toBe(50);
  });
});

describe("payoutDateOf — last business day (Mon–Fri) of the month, weekends only", () => {
  it("October 2026 ends on Saturday 31 → Friday 2026-10-30", () => {
    expect(payoutDateOf(2026, 10)).toBe("2026-10-30");
  });
  it("May 2026 ends on Sunday 31 → Friday 2026-05-29", () => {
    expect(payoutDateOf(2026, 5)).toBe("2026-05-29");
  });
  it("January 2027 ends on Sunday 31 → Friday 2027-01-29", () => {
    expect(payoutDateOf(2027, 1)).toBe("2027-01-29");
  });
  it("a month ending on a weekday pays on its last day (Mon 31 Aug 2026, Tue 30 Jun 2026)", () => {
    expect(payoutDateOf(2026, 8)).toBe("2026-08-31");
    expect(payoutDateOf(2026, 6)).toBe("2026-06-30");
  });
  it("a month ending on Friday pays on that Friday (Fri 31 Jul 2026)", () => {
    expect(payoutDateOf(2026, 7)).toBe("2026-07-31");
  });
  it("February in a leap year: 2028 ends Tuesday 29 → 2028-02-29", () => {
    expect(payoutDateOf(2028, 2)).toBe("2028-02-29");
  });
  it("February in a common year ending on Sunday 28: 2027 → Friday 2027-02-26", () => {
    expect(payoutDateOf(2027, 2)).toBe("2027-02-26");
  });
  it("December ending on a weekday: Thursday 2026-12-31", () => {
    expect(payoutDateOf(2026, 12)).toBe("2026-12-31");
  });
  it("December ending on Sunday: 2028 → Friday 2028-12-29", () => {
    expect(payoutDateOf(2028, 12)).toBe("2028-12-29");
  });
  it("month is 1-based and zero-padded (January 2026 ends Saturday 31 → 2026-01-30)", () => {
    expect(payoutDateOf(2026, 1)).toBe("2026-01-30");
  });
  it("every month 2026–2035 is a Mon–Fri in that month, with no weekday after it", () => {
    for (let y = 2026; y <= 2035; y++) {
      for (let m = 1; m <= 12; m++) {
        const got = payoutDateOf(y, m);
        expect(got, `${y}-${m}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(got, `${y}-${m}`).toBe(lastWeekdayOf(y, m));
      }
    }
  });
});

describe("nextPayoutDate — the first Payout Date on or after today", () => {
  it("before the month's Payout Date → this month's", () => {
    expect(nextPayoutDate("2026-10-27")).toBe("2026-10-30");
    expect(nextPayoutDate("2026-10-01")).toBe("2026-10-30");
  });
  it("on the Payout Date itself → that same day", () => {
    expect(nextPayoutDate("2026-10-30")).toBe("2026-10-30");
    expect(nextPayoutDate("2026-12-31")).toBe("2026-12-31");
  });
  it("the day after the Payout Date → next month's", () => {
    expect(nextPayoutDate("2026-10-31")).toBe("2026-11-30");
    expect(nextPayoutDate("2026-11-01")).toBe("2026-11-30");
  });
  it("weekend days after a Friday Payout Date roll to next month (May 2026 pays Fri 29)", () => {
    expect(nextPayoutDate("2026-05-30")).toBe("2026-06-30");
    expect(nextPayoutDate("2026-05-31")).toBe("2026-06-30");
  });
  it("across a year end", () => {
    expect(nextPayoutDate("2027-01-01")).toBe("2027-01-29");
    expect(nextPayoutDate("2028-12-30")).toBe("2029-01-31");
    expect(nextPayoutDate("2028-12-31")).toBe("2029-01-31");
  });
  it("leap February: 28 Feb 2028 → 29 Feb; 1 Mar 2028 → 31 Mar", () => {
    expect(nextPayoutDate("2028-02-28")).toBe("2028-02-29");
    expect(nextPayoutDate("2028-02-29")).toBe("2028-02-29");
    expect(nextPayoutDate("2028-03-01")).toBe("2028-03-31");
  });
  it("every day of 2026–2028 maps to the first Payout Date on or after it", () => {
    for (const day of daysBetween("2026-01-01", "2028-12-31")) {
      const y = Number(day.slice(0, 4));
      const m = Number(day.slice(5, 7));
      const thisMonth = lastWeekdayOf(y, m);
      const expected =
        day <= thisMonth ? thisMonth : m === 12 ? lastWeekdayOf(y + 1, 1) : lastWeekdayOf(y, m + 1);
      expect(nextPayoutDate(day), day).toBe(expected);
    }
  });
});

describe("choiceChangeStartsOn — the day after the next Payout Date (clause 7.2)", () => {
  it("before the Payout Date: Fri 30 Oct + 1 = 2026-10-31", () => {
    expect(choiceChangeStartsOn("2026-10-27")).toBe("2026-10-31");
  });
  it("on the Payout Date: still that Payout Date + 1", () => {
    expect(choiceChangeStartsOn("2026-10-30")).toBe("2026-10-31");
  });
  it("the day after the Payout Date: next month's Payout Date + 1, crossing a month end", () => {
    // Next Payout Date is Mon 30 Nov 2026 → 1 Dec.
    expect(choiceChangeStartsOn("2026-10-31")).toBe("2026-12-01");
  });
  it("crosses a year end: Thu 31 Dec 2026 + 1 = 2027-01-01", () => {
    expect(choiceChangeStartsOn("2026-12-01")).toBe("2027-01-01");
    expect(choiceChangeStartsOn("2026-12-31")).toBe("2027-01-01");
  });
  it("leap February: 29 Feb 2028 + 1 = 2028-03-01", () => {
    expect(choiceChangeStartsOn("2028-02-10")).toBe("2028-03-01");
  });
  it("common February: Fri 26 Feb 2027 + 1 = 2027-02-27", () => {
    expect(choiceChangeStartsOn("2027-02-01")).toBe("2027-02-27");
  });
  it("every day of 2026–2028 is the next Payout Date + 1 calendar day", () => {
    for (const day of daysBetween("2026-01-01", "2028-12-31")) {
      const y = Number(day.slice(0, 4));
      const m = Number(day.slice(5, 7));
      const thisMonth = lastWeekdayOf(y, m);
      const next =
        day <= thisMonth ? thisMonth : m === 12 ? lastWeekdayOf(y + 1, 1) : lastWeekdayOf(y, m + 1);
      expect(choiceChangeStartsOn(day), day).toBe(addDays(next, 1));
    }
  });
});

describe("sgtDate — the Singapore calendar day (UTC+8)", () => {
  it("17:30Z on 27 Oct is already 28 Oct in Singapore", () => {
    expect(sgtDate(new Date("2026-10-27T17:30:00Z"))).toBe("2026-10-28");
  });
  it("15:59:59Z is 23:59:59 SGT — still the same day", () => {
    expect(sgtDate(new Date("2026-10-27T15:59:59Z"))).toBe("2026-10-27");
  });
  it("16:00:00Z is midnight SGT — the next day", () => {
    expect(sgtDate(new Date("2026-10-27T16:00:00Z"))).toBe("2026-10-28");
  });
  it("UTC midnight is 08:00 SGT the same day", () => {
    expect(sgtDate(new Date("2026-10-27T00:00:00Z"))).toBe("2026-10-27");
  });
  it("crosses a year end", () => {
    expect(sgtDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
  });
});

describe("partnerTermsOf — reads the partners row", () => {
  it("reads every column", () => {
    expect(
      partnerTermsOf({
        commission_pool: 60,
        commission_choice: 40,
        commission_choice_next: 30,
        commission_choice_next_from: "2026-10-31",
        customer_discount_enabled: true,
      }),
    ).toEqual({
      pool: 60,
      choice: 40,
      nextChoice: 30,
      nextChoiceFrom: "2026-10-31",
      customerDiscount: true,
    });
  });
  it("numeric columns may arrive as strings (Postgres numeric)", () => {
    const t = partnerTermsOf({
      commission_pool: "45.50",
      commission_choice: "20.00",
      commission_choice_next: "10",
      commission_choice_next_from: "2026-11-01",
      customer_discount_enabled: false,
    });
    expect(t.pool).toBe(45.5);
    expect(t.choice).toBe(20);
    expect(t.nextChoice).toBe(10);
    expect(t.nextChoiceFrom).toBe("2026-11-01");
  });
  it("null choice / next mean the whole pool and nothing waiting", () => {
    const t = partnerTermsOf({
      commission_pool: 50,
      commission_choice: null,
      commission_choice_next: null,
      commission_choice_next_from: null,
      customer_discount_enabled: false,
    });
    expect(t.choice).toBeNull();
    expect(t.nextChoice).toBeNull();
    expect(t.nextChoiceFrom).toBeNull();
  });
  it("an empty row: pool falls back to the Schedule's 50, everything else empty", () => {
    expect(partnerTermsOf({})).toEqual({
      pool: 50,
      choice: null,
      nextChoice: null,
      nextChoiceFrom: null,
      customerDiscount: false,
    });
  });
  it.each<[string, PartnerTermsRow["commission_pool"]]>([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["non-numeric string", "abc"],
    ["negative", -5],
    ["negative string", "-5"],
  ])("a missing/invalid pool (%s) falls back to the Schedule's 50", (_label, pool) => {
    expect(partnerTermsOf({ commission_pool: pool }).pool).toBe(50);
  });
  it("NaN pool falls back to the Schedule's 50", () => {
    expect(partnerTermsOf({ commission_pool: Number.NaN }).pool).toBe(50);
  });
  it("money is rounded to cents", () => {
    const t = partnerTermsOf({ commission_pool: "49.999", commission_choice: "12.3456" });
    expect(t.pool).toBe(50);
    expect(t.choice).toBe(12.35);
  });
  it.each<[string, unknown]>([
    ["false", false],
    ["null", null],
    ["undefined", undefined],
    ['the string "true"', "true"],
    ["1", 1],
  ])("customer_discount_enabled %s → off (only exactly true turns it on)", (_label, v) => {
    const row = { commission_pool: 50, customer_discount_enabled: v } as unknown as PartnerTermsRow;
    expect(partnerTermsOf(row).customerDiscount).toBe(false);
  });
  it("customer_discount_enabled true → on", () => {
    expect(partnerTermsOf({ customer_discount_enabled: true }).customerDiscount).toBe(true);
  });
  it("a stored pick above a lowered pool still pays only the pool", () => {
    const t = partnerTermsOf({ commission_pool: "25", commission_choice: "30" });
    expect(commissionInEffect(t, "2026-10-27")).toBe(25);
  });
});

describe("choiceInEffect — the waiting change applies on and after nextChoiceFrom", () => {
  const waiting = terms({ choice: 30, nextChoice: 20, nextChoiceFrom: "2026-10-31" });

  it("nothing waiting → the current choice", () => {
    expect(choiceInEffect(terms({ choice: 30 }), "2026-10-27")).toBe(30);
    expect(choiceInEffect(terms({ choice: null }), "2026-10-27")).toBeNull();
  });
  it("before nextChoiceFrom → the current choice", () => {
    expect(choiceInEffect(waiting, "2026-10-30")).toBe(30);
  });
  it("on nextChoiceFrom → the waiting choice", () => {
    expect(choiceInEffect(waiting, "2026-10-31")).toBe(20);
  });
  it("after nextChoiceFrom (even months later) → the waiting choice", () => {
    expect(choiceInEffect(waiting, "2026-11-15")).toBe(20);
    expect(choiceInEffect(waiting, "2027-03-01")).toBe(20);
  });
  it("a waiting change of null means the whole pool once its day comes", () => {
    const toWhole = terms({ choice: 30, nextChoice: null, nextChoiceFrom: "2026-10-31" });
    expect(choiceInEffect(toWhole, "2026-10-30")).toBe(30);
    expect(choiceInEffect(toWhole, "2026-10-31")).toBeNull();
  });
  it("a nextChoice without nextChoiceFrom is not waiting", () => {
    const stray = terms({ choice: 30, nextChoice: 10, nextChoiceFrom: null });
    expect(choiceInEffect(stray, "2026-10-27")).toBe(30);
  });
});

describe("commissionInEffect — the pool, or the partner's lower pick, never above the pool", () => {
  const today = "2026-10-27";

  it("no pick (null) → the whole pool", () => {
    expect(commissionInEffect(terms({ pool: 50, choice: null }), today)).toBe(50);
  });
  it("a lower pick → that pick", () => {
    expect(commissionInEffect(terms({ pool: 50, choice: 30 }), today)).toBe(30);
  });
  it("a pick of 0 → 0 (the partner leaves the whole pool)", () => {
    expect(commissionInEffect(terms({ pool: 50, choice: 0 }), today)).toBe(0);
  });
  it("a pick equal to the pool → the pool", () => {
    expect(commissionInEffect(terms({ pool: 50, choice: 50 }), today)).toBe(50);
  });
  it("Staff lower the pool below the pick → the partner gets the pool", () => {
    expect(commissionInEffect(terms({ pool: 25, choice: 30 }), today)).toBe(25);
  });
  it("a per-partner pool other than 50 is honoured", () => {
    expect(commissionInEffect(terms({ pool: 80, choice: null }), today)).toBe(80);
    expect(commissionInEffect(terms({ pool: 80, choice: 60 }), today)).toBe(60);
  });
  it("a waiting pick applies only on and after its day", () => {
    const t = terms({ pool: 50, choice: 30, nextChoice: 20, nextChoiceFrom: "2026-10-31" });
    expect(commissionInEffect(t, "2026-10-30")).toBe(30);
    expect(commissionInEffect(t, "2026-10-31")).toBe(20);
  });
  it("a waiting whole-pool (null) change pays the pool once its day comes", () => {
    const t = terms({ pool: 50, choice: 30, nextChoice: null, nextChoiceFrom: "2026-10-31" });
    expect(commissionInEffect(t, "2026-10-30")).toBe(30);
    expect(commissionInEffect(t, "2026-10-31")).toBe(50);
  });
  it("a waiting pick above a lowered pool → the pool", () => {
    const t = terms({ pool: 15, choice: 10, nextChoice: 20, nextChoiceFrom: "2026-10-31" });
    expect(commissionInEffect(t, "2026-11-01")).toBe(15);
  });
  it("is money, rounded to cents", () => {
    expect(commissionInEffect(terms({ pool: 50, choice: 12.3456 }), today)).toBe(12.35);
  });
});

describe("customerDiscountInEffect — what the partner leaves, only when Staff turn it on", () => {
  const today = "2026-10-27";

  it("on: pool − commission", () => {
    expect(customerDiscountInEffect(terms({ pool: 50, choice: 30, customerDiscount: true }), today)).toBe(20);
  });
  it("on, partner takes nothing → the whole pool comes off", () => {
    expect(customerDiscountInEffect(terms({ pool: 50, choice: 0, customerDiscount: true }), today)).toBe(50);
  });
  it("on, partner takes the whole pool → 0", () => {
    expect(customerDiscountInEffect(terms({ pool: 50, choice: null, customerDiscount: true }), today)).toBe(0);
  });
  it("off → 0 even when the partner leaves some of the pool", () => {
    expect(customerDiscountInEffect(terms({ pool: 50, choice: 30, customerDiscount: false }), today)).toBe(0);
    expect(customerDiscountInEffect(terms({ pool: 50, choice: 0, customerDiscount: false }), today)).toBe(0);
  });
  it("never negative: pool lowered below the pick → 0", () => {
    expect(customerDiscountInEffect(terms({ pool: 25, choice: 30, customerDiscount: true }), today)).toBe(0);
  });
  it("follows the waiting pick on and after its day", () => {
    const t = terms({ pool: 50, choice: 30, nextChoice: 10, nextChoiceFrom: "2026-10-31", customerDiscount: true });
    expect(customerDiscountInEffect(t, "2026-10-30")).toBe(20);
    expect(customerDiscountInEffect(t, "2026-10-31")).toBe(40);
  });
  it("a waiting whole-pool change leaves the customer nothing once its day comes", () => {
    const t = terms({ pool: 50, choice: 30, nextChoice: null, nextChoiceFrom: "2026-10-31", customerDiscount: true });
    expect(customerDiscountInEffect(t, "2026-10-30")).toBe(20);
    expect(customerDiscountInEffect(t, "2026-10-31")).toBe(0);
  });
  it("is money, rounded to cents (no float dust)", () => {
    expect(customerDiscountInEffect(terms({ pool: 50, choice: 33.33, customerDiscount: true }), today)).toBe(16.67);
    expect(customerDiscountInEffect(terms({ pool: 30.3, choice: 10.1, customerDiscount: true }), today)).toBe(20.2);
  });
});

describe("pickCommission — the columns to write when the partner picks", () => {
  // today 2026-10-27 → next Payout Date Fri 30 Oct → change starts Sat 31 Oct.
  const today = "2026-10-27";
  const starts = "2026-10-31";

  describe("whole pool: null or any amount ≥ the pool is stored as null", () => {
    it("on the whole pool, picking null → nothing changes, nothing waits", () => {
      expect(pickCommission(terms({ choice: null }), null, today)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("on the whole pool, picking exactly the pool → same as null", () => {
      expect(pickCommission(terms({ pool: 50, choice: null }), 50, today)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("on the whole pool, picking above the pool → same as null", () => {
      expect(pickCommission(terms({ pool: 50, choice: null }), 75, today)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("on a lower pick, picking null → waits as a whole-pool change", () => {
      expect(pickCommission(terms({ choice: 30 }), null, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: starts,
      });
    });
    it("on a lower pick, picking the pool → waits as a whole-pool change (null, not 50)", () => {
      expect(pickCommission(terms({ pool: 50, choice: 30 }), 50, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: starts,
      });
    });
    it("on a lower pick, picking above the pool → waits as a whole-pool change", () => {
      expect(pickCommission(terms({ pool: 50, choice: 30 }), 120, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: starts,
      });
    });
  });

  describe("a different pick waits until the day after the next Payout Date", () => {
    it("whole pool → lower pick", () => {
      expect(pickCommission(terms({ choice: null }), 30, today)).toEqual({
        commission_choice: null,
        commission_choice_next: 30,
        commission_choice_next_from: starts,
      });
    });
    it("lower pick → another lower pick", () => {
      expect(pickCommission(terms({ choice: 30 }), 20, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: 20,
        commission_choice_next_from: starts,
      });
    });
    it("picking 0 is a valid lower amount", () => {
      expect(pickCommission(terms({ choice: null }), 0, today)).toEqual({
        commission_choice: null,
        commission_choice_next: 0,
        commission_choice_next_from: starts,
      });
    });
    it("replaces an earlier waiting pick that has not started", () => {
      const t = terms({ choice: 30, nextChoice: 20, nextChoiceFrom: starts });
      expect(pickCommission(t, 10, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: 10,
        commission_choice_next_from: starts,
      });
    });
    it("re-picking the same waiting amount keeps it waiting", () => {
      const t = terms({ choice: 30, nextChoice: 20, nextChoiceFrom: starts });
      expect(pickCommission(t, 20, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: 20,
        commission_choice_next_from: starts,
      });
    });
    it("picked on the Payout Date itself → starts the next day", () => {
      expect(pickCommission(terms({ choice: null }), 30, "2026-10-30")).toEqual({
        commission_choice: null,
        commission_choice_next: 30,
        commission_choice_next_from: "2026-10-31",
      });
    });
    it("picked the day after a Payout Date → waits for the following one (+1 day)", () => {
      expect(pickCommission(terms({ choice: null }), 30, "2026-10-31")).toEqual({
        commission_choice: null,
        commission_choice_next: 30,
        commission_choice_next_from: "2026-12-01",
      });
    });
    it("across a year end: picked in December → starts 1 January", () => {
      expect(pickCommission(terms({ choice: null }), 30, "2026-12-10")).toEqual({
        commission_choice: null,
        commission_choice_next: 30,
        commission_choice_next_from: "2027-01-01",
      });
    });
    it("the pick is money, rounded to cents", () => {
      expect(pickCommission(terms({ choice: null }), 12.3456, today)).toEqual({
        commission_choice: null,
        commission_choice_next: 12.35,
        commission_choice_next_from: starts,
      });
    });
  });

  describe("picking what is in force today cancels any waiting change", () => {
    it("same lower pick, nothing waiting → unchanged", () => {
      expect(pickCommission(terms({ choice: 30 }), 30, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("same lower pick with a waiting change → the waiting change is cancelled", () => {
      const t = terms({ choice: 30, nextChoice: 20, nextChoiceFrom: starts });
      expect(pickCommission(t, 30, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("on the whole pool with a waiting lower pick, picking null cancels it", () => {
      const t = terms({ choice: null, nextChoice: 20, nextChoiceFrom: starts });
      expect(pickCommission(t, null, today)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("on a lower pick with a waiting whole-pool change, re-picking the lower amount cancels it", () => {
      const t = terms({ choice: 30, nextChoice: null, nextChoiceFrom: starts });
      expect(pickCommission(t, 30, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
  });

  describe("a waiting change whose day has come is folded in first", () => {
    // Waiting 20 from 31 Oct; today 2 Nov → 20 is in force. Next Payout Date
    // Mon 30 Nov → a new change starts 1 Dec.
    const t = terms({ choice: 30, nextChoice: 20, nextChoiceFrom: "2026-10-31" });
    const later = "2026-11-02";

    it("picking the folded-in amount → it becomes the choice, nothing waits", () => {
      expect(pickCommission(t, 20, later)).toEqual({
        commission_choice: 20,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("picking the old amount again → it waits; the folded-in amount stays in force", () => {
      expect(pickCommission(t, 30, later)).toEqual({
        commission_choice: 20,
        commission_choice_next: 30,
        commission_choice_next_from: "2026-12-01",
      });
    });
    it("picking the whole pool → waits; the folded-in amount stays in force", () => {
      expect(pickCommission(t, null, later)).toEqual({
        commission_choice: 20,
        commission_choice_next: null,
        commission_choice_next_from: "2026-12-01",
      });
    });
    it("folds in on exactly nextChoiceFrom", () => {
      expect(pickCommission(t, 20, "2026-10-31")).toEqual({
        commission_choice: 20,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
    it("a waiting whole-pool (null) change that has come is folded in as null", () => {
      const toWhole = terms({ choice: 30, nextChoice: null, nextChoiceFrom: "2026-10-31" });
      expect(pickCommission(toWhole, null, later)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
      expect(pickCommission(toWhole, 25, later)).toEqual({
        commission_choice: null,
        commission_choice_next: 25,
        commission_choice_next_from: "2026-12-01",
      });
    });
  });

  describe("owner decisions on the edge cases (pick rounded first; 'in force' = what would be paid)", () => {
    it("a pick that rounds to the pool (49.999 → 50.00) is the whole pool, stored as null", () => {
      expect(pickCommission(terms({ pool: 50, choice: null }), 49.999, today)).toEqual({
        commission_choice: null,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
      expect(pickCommission(terms({ pool: 50, choice: 30 }), 49.999, today)).toEqual({
        commission_choice: 30,
        commission_choice_next: null,
        commission_choice_next_from: starts,
      });
    });
    it("pool lowered to 25 under a stored pick of 30: picking 25 pays the same, so it cancels a waiting change", () => {
      const t = terms({ pool: 25, choice: 30, nextChoice: 10, nextChoiceFrom: starts });
      const got = pickCommission(t, 25, today);
      expect(got.commission_choice_next).toBeNull();
      expect(got.commission_choice_next_from).toBeNull();
    });
    it("pool lowered to 25 under a stored pick of 30, nothing waiting: picking 25 queues nothing", () => {
      const got = pickCommission(terms({ pool: 25, choice: 30 }), 25, today);
      expect(got.commission_choice_next).toBeNull();
      expect(got.commission_choice_next_from).toBeNull();
      // Whatever is stored, the partner is still paid the pool today.
      expect(
        commissionInEffect(
          terms({
            pool: 25,
            choice: got.commission_choice,
            nextChoice: got.commission_choice_next,
            nextChoiceFrom: got.commission_choice_next_from,
          }),
          today,
        ),
      ).toBe(25);
    });
  });

  describe("a negative pick is treated as 0", () => {
    it("waits as 0", () => {
      expect(pickCommission(terms({ choice: null }), -5, today)).toEqual({
        commission_choice: null,
        commission_choice_next: 0,
        commission_choice_next_from: starts,
      });
    });
    it("equals an in-force 0 → nothing waits", () => {
      expect(pickCommission(terms({ choice: 0 }), -5, today)).toEqual({
        commission_choice: 0,
        commission_choice_next: null,
        commission_choice_next_from: null,
      });
    });
  });
});

describe("isEligibleBuild — a customised premium pillow only", () => {
  it("premium pillow → eligible", () => {
    expect(isEligibleBuild({ productType: "pillow", tier: "premium" })).toBe(true);
  });
  it("basic pillow → not eligible", () => {
    expect(isEligibleBuild({ productType: "pillow", tier: "basic" })).toBe(false);
  });
  it("premium bolster → not eligible", () => {
    expect(isEligibleBuild({ productType: "bolster", tier: "premium" })).toBe(false);
  });
  it("pillow with no tier → not eligible", () => {
    expect(isEligibleBuild({ productType: "pillow", tier: null })).toBe(false);
    expect(isEligibleBuild({ productType: "pillow" })).toBe(false);
  });
});

describe("isEligibleOrderItem — a goods line from a customisation's premium pillow", () => {
  const snap = {
    result_id: "res_1",
    product_type: "pillow",
    assigned_tier: "premium",
  };
  const item = (over: Partial<CommissionOrderItem> = {}): CommissionOrderItem => ({
    kind: "goods",
    customization_snapshot: { ...snap },
    ...over,
  });

  it("goods line, customised premium pillow → eligible", () => {
    expect(isEligibleOrderItem(item())).toBe(true);
  });
  it("kind missing counts as goods", () => {
    expect(isEligibleOrderItem({ customization_snapshot: { ...snap } })).toBe(true);
  });
  it("kind null counts as missing (goods)", () => {
    expect(isEligibleOrderItem(item({ kind: null }))).toBe(true);
  });
  it("a service line is never eligible, even with a premium pillow snapshot", () => {
    expect(isEligibleOrderItem(item({ kind: "service" }))).toBe(false);
  });
  it("any kind other than goods is not eligible", () => {
    expect(isEligibleOrderItem(item({ kind: "fee" }))).toBe(false);
  });
  it("a legacy shop line without result_id is not eligible", () => {
    const legacy = { product_type: "pillow", assigned_tier: "premium" };
    expect(isEligibleOrderItem(item({ customization_snapshot: legacy }))).toBe(false);
    expect(isEligibleOrderItem(item({ customization_snapshot: { ...snap, result_id: null } }))).toBe(false);
  });
  it("a basic-tier pillow is not eligible", () => {
    expect(isEligibleOrderItem(item({ customization_snapshot: { ...snap, assigned_tier: "basic" } }))).toBe(false);
  });
  it("a bolster is not eligible", () => {
    expect(isEligibleOrderItem(item({ customization_snapshot: { ...snap, product_type: "bolster" } }))).toBe(false);
  });
  it("no tier on the snapshot → not eligible", () => {
    expect(isEligibleOrderItem(item({ customization_snapshot: { ...snap, assigned_tier: null } }))).toBe(false);
  });
  it("no snapshot → not eligible", () => {
    expect(isEligibleOrderItem(item({ customization_snapshot: null }))).toBe(false);
    expect(isEligibleOrderItem({ kind: "goods" })).toBe(false);
  });
});
