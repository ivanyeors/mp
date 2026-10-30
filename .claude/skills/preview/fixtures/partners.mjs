// The Partner Agreement the apply flow and re-accept screen render
// (`partners_page.agreement_md`). The copy is made up; its shape follows the
// owner's: numbered sections, bold lead-in bullets, a rule, the commission
// Schedule as a GFM table and an italic footer, so the preview exercises every
// element the agreement renderer styles. Signed in as the Owner (not a partner),
// /partner/apply shows the form; the agreement opens once the form validates.

const AGREEMENT_MD = `## 1. The Programme

This sample agreement sets out how a Partner introduces customers to the store and earns Commission on their orders. It is preview copy, not the real terms.

## 2. Commission

Commission is earned once per Qualifying Sale and paid on the Payout Date shown in the Schedule. Refunded sales earn no Commission.

### 2.1 Your selection

You may choose any amount up to the Commission Pool in the Partner Portal. A change takes effect from the day after the next Payout Date.

## 3. General

- **Severability.** If any term is found unenforceable it is modified to the minimum extent needed, and the rest of this Agreement remains in force.
- **No waiver.** A failure or delay in exercising a right is not a waiver of it.
- **Force majeure.** Neither Party is liable for delay caused by events beyond its reasonable control, provided it notifies the other promptly.
- **Governing law.** This Agreement is governed by the laws of the Republic of Singapore.

---

## Schedule — Commission

| Item | Detail |
| :--- | :--- |
| Commission Pool | **S$40 flat per order** (exclusive of GST) |
| Your Commission | The Commission Pool, or any lower amount you select in the Partner Portal |
| When it is earned | Once per Qualifying Sale (order), however many Eligible Products it contains |
| Eligible Products | Sample premium products only (excludes accessories) |
| Refund Period before Commission is earned | 30 days from the date the Customer receives the Product |
| Refunded sales | No Commission. Refunds after payout are deducted from future Commission |
| Payout Date | Last business day of each month, for orders that became Qualifying Sales the previous month |
| Statement issued | Within 7 days after each Payout Date |

---

*Sample Company Pte Ltd · 1 Example Road, Singapore 000000 · partners@example.com*`;

export default function partners() {
  const at = "2026-01-05T02:00:00Z";
  return {
    tables: {
      partners_page: [
        { id: "00000000-0000-4000-8000-0000000000f1", content: {}, agreement_md: AGREEMENT_MD, updated_at: at },
      ],
    },
  };
}
