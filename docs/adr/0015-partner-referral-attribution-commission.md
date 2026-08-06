# Partner referrals: single-credit closer-wins attribution, delivery-aligned commission release, clinic-margin framing

The partner portal (Partner Hub) pays partners for pillow/bolster units on
attributed **Orders**. Four linked decisions define the money model:

1. **One Referral per Order, never split — whoever closed the sale gets it.**
   Attribution priority: partner-assisted customisation session > referral code
   explicitly typed by the customer > most recent `?ref` link within a **30-day**
   window (last-touch overwrites). Self-reported **Discovery source** is never
   attribution.
2. **Commission lifecycle `held → released → paid | void`, release aligned to
   delivery.** A commission is created `held` at capture (`paid_at`) and
   `released` exactly when the RMA **Return window** closes (30 days after
   `delivered_at`; in-store handover sets `delivered_at` at handover). An RMA
   **refund** resolution voids that item's commission; **exchange/replacement
   keep it** — a pillow was still sold. The Partner Hub countdown is therefore
   the return window itself, always dated.
3. **Clinic-margin framing (AHPC compliance).** The partner is the
   ACRA-registered business entity; commission is framed as retail/referral
   margin to the clinic, never a per-referral payment to an individual
   clinician. The AHPC Code of Professional Conduct binds registered allied
   health professionals (§5.7: recommendations must not be influenced by
   rewards; §5.7.1: financial interest must be disclosed before referral). The
   partner agreement mandates patient-facing disclosure; the co-branded
   partner-assisted flow doubles as that disclosure. Individual-clinician perks
   on the milestone ladder lean non-cash (certified-fitter listing,
   co-marketing, recognition).
4. **Scope: pillow/bolster units only.** Never add-ons, accessories, shipping,
   or tax. Partner self-purchases get a capped, admin-set discount instead of
   commission and never move the milestone track.

## Considered options

- **Split commission across conflicting signals** — rejected: the ledger,
  unit-based milestone counting, and the partner-facing story all get
  materially more complex for a rare case; "whoever closed the client gets the
  commission" is the business rule.
- **First-touch attribution** — rejected: a stale Instagram click would outrank
  the clinic that physically measured and closed the customer; partners doing
  assisted customisations would revolt.
- **Release clocked from `paid_at`** — rejected: shipping delays leave the
  return window open past release, forcing a clawback-after-release state and a
  countdown that can lie. Aligning release to the return window close makes
  "released" irrevocable by construction.
- **Void on every RMA resolution** — rejected: exchange and replacement mean
  the customer kept a pillow; only **refund** reverses the sale.
- **Per-referral commission to whoever signs up, individual or business** —
  rejected: registered physios recommending products for undisclosed payment
  risks their AHPC standing, and the brand's clinical-partner credibility sits
  on exactly those professionals. Two-track (cash for unregulated, non-cash for
  AHPs) was also rejected as two programs to build and police.
- **Automated disbursement** — deferred: payouts are manual (PayNow/bank) with
  a Staff-uploaded proof-of-payment image visible to the partner; no payment
  rail until volume forces it.

## Consequences

- Attribution requires stamping the referral code on the Visitor (existing
  first-party journey rail), carrying it to the **Result** at hold and the
  **Order** at capture; the commission ledger references the Order item.
- `delivered_at` must be set reliably, including at in-store handover —
  otherwise commissions never release.
- Voiding is item-level and follows the existing RMA machinery; no new return
  concepts.
- The partner agreement (static versioned legal page; `agreed_version`
  recorded) must carry the disclosure clause — changing the money terms means a
  new agreement version and re-acceptance.
- Milestone progress moves at capture (instant feedback) and decrements on
  void; money and gamification share events but never share state.
