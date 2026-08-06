import ReactMarkdown from "react-markdown";
import { AGREEMENT_VERSION } from "@/lib/partner-application";

/**
 * Renders the Partner Agreement copy (markdown) shown by the apply flow and the
 * re-accept screen. The copy is owner-editable (Admin → Partners → Agreement,
 * stored in partners_page.agreement_md); callers fetch it via getAgreementMarkdown
 * and pass it in, so this stays a pure presentational component (server/client safe).
 *
 * The VERSION is a separate code constant (AGREEMENT_VERSION) — editing copy does
 * NOT bump it. Bump AGREEMENT_VERSION deliberately when a change must be re-consented
 * (money terms or the MANDATORY AHPC §5.7/§5.7.1 patient-disclosure clause) — ADR 0015.
 */
export function AgreementContent({ content }: { content: string }) {
  return (
    <article className="prose prose-neutral prose-sm max-w-none text-foreground dark:prose-invert">
      <p className="text-sm text-muted-foreground">
        Partner Agreement — version {AGREEMENT_VERSION}
      </p>
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
