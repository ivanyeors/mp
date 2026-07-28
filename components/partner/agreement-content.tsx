import { AGREEMENT_VERSION } from "@/lib/partner-application";

/**
 * Static, versioned Partner Agreement copy. Rendered by both the apply flow and
 * the re-accept screen, so it lives in one place; the version shown is
 * {@link AGREEMENT_VERSION}. No hooks — safe in server and client trees.
 *
 * TODO(legal): the body below is PLACEHOLDER wording. The owner/lawyer must
 * supply the final Partner Agreement, and it MUST retain a patient-facing
 * disclosure clause satisfying AHPC Code of Professional Conduct §5.7 /
 * §5.7.1 (financial interest disclosed before referral) — see ADR 0015. When
 * the money terms or the disclosure clause change, bump AGREEMENT_VERSION so
 * approved partners re-accept.
 */
export function AgreementContent() {
  return (
    <article className="prose prose-neutral max-w-none text-foreground dark:prose-invert">
      <p className="text-sm text-muted-foreground">
        Partner Agreement — version {AGREEMENT_VERSION}
      </p>

      {/* TODO(legal): replace all sections below with final counsel-approved copy. */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold">1. The Partner Programme</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          [PLACEHOLDER] This agreement governs your participation in the Mpillow
          Partner programme operated by Mellow Life Pte Ltd, including referral
          attribution, commissions, and use of Mpillow materials.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">2. Commissions and Payment</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          [PLACEHOLDER] Commission rates, qualifying orders, void conditions, and
          manual payout terms to be confirmed by counsel.
        </p>
      </section>

      {/* MANDATORY — AHPC §5.7 / §5.7.1 patient-facing disclosure (ADR 0015). */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold">
          3. Patient-Facing Disclosure (AHPC §5.7 / §5.7.1)
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          [PLACEHOLDER — counsel to finalise, clause is MANDATORY] Where you are a
          registered allied health professional, you must disclose to each client,
          before any recommendation or referral, that you have a financial interest
          in Mpillow products. Your product recommendations must be based on the
          client&rsquo;s clinical needs and must not be influenced by any reward,
          commission, or incentive under this programme, consistent with the AHPC
          Code of Professional Conduct §5.7 and §5.7.1.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">4. Term and Changes</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          [PLACEHOLDER] We may update this agreement. When the terms change, the
          version above changes and you will be asked to accept the updated
          agreement before continuing to use the Partner Hub.
        </p>
      </section>
    </article>
  );
}
