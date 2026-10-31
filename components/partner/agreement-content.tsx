import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AGREEMENT_VERSION } from "@/lib/partner-application";

/** react-markdown hands every element its AST `node`; keep it off the DOM. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/**
 * Element styles for the agreement. The site does not load the Tailwind typography
 * plugin, so `prose` classes do nothing here; each element is styled directly.
 * Tables (the commission Schedule) are GFM, hence remark-gfm.
 */
const components: Components = {
  h1: (props) => <h1 {...dom(props)} className="mt-8 mb-3 text-xl font-normal first:mt-0" />,
  h2: (props) => <h2 {...dom(props)} className="mt-8 mb-3 text-lg font-normal first:mt-0" />,
  h3: (props) => <h3 {...dom(props)} className="mt-6 mb-2 text-base font-medium first:mt-0" />,
  h4: (props) => <h4 {...dom(props)} className="mt-5 mb-2 text-sm font-medium first:mt-0" />,
  p: (props) => <p {...dom(props)} className="my-3 leading-relaxed first:mt-0" />,
  ul: (props) => <ul {...dom(props)} className="my-3 list-disc space-y-1.5 pl-5 first:mt-0" />,
  ol: (props) => <ol {...dom(props)} className="my-3 list-decimal space-y-1.5 pl-5 first:mt-0" />,
  li: (props) => <li {...dom(props)} className="pl-1 leading-relaxed marker:text-muted-foreground" />,
  strong: (props) => <strong {...dom(props)} className="font-semibold" />,
  a: (props) => <a {...dom(props)} className="underline underline-offset-2" />,
  hr: () => <hr className="my-6 border-border" />,
  blockquote: (props) => (
    <blockquote {...dom(props)} className="my-4 border-l-2 pl-4 text-muted-foreground" />
  ),
  code: (props) => <code {...dom(props)} className="rounded bg-muted px-1 py-0.5 text-[0.9em]" />,
  table: (props) => (
    <div className="my-4 overflow-x-auto rounded-md border">
      <table {...dom(props)} className="w-full border-collapse text-left" />
    </div>
  ),
  thead: (props) => <thead {...dom(props)} className="bg-muted/60" />,
  tr: (props) => <tr {...dom(props)} className="border-b last:border-b-0" />,
  th: (props) => <th {...dom(props)} className="px-3 py-2 align-top font-medium" />,
  td: (props) => (
    <td {...dom(props)} className="px-3 py-2 align-top leading-relaxed first:font-medium md:first:w-1/3" />
  ),
};

/**
 * Renders the Partner Agreement copy (markdown) shown by the apply flow and the
 * re-accept screen. The copy is owner-editable (Admin → Partners → Agreement,
 * stored in partners_page.agreement_md); callers fetch it via getAgreementMarkdown
 * and pass it in, so this stays a pure presentational component (server/client safe).
 *
 * The VERSION is a separate code constant (AGREEMENT_VERSION) — editing copy does
 * NOT bump it. Bump AGREEMENT_VERSION deliberately when a change must be re-consented
 * (money terms or the MANDATORY AHPC §5.7/§5.7.1 patient-disclosure clause) — ADR 0015.
 *
 * `data-typography-scope="app"` opts out of the marketing overrides in globals.css,
 * which would otherwise force every paragraph to 18px and every h2 to 28px.
 */
export function AgreementContent({ content }: { content: string }) {
  return (
    <article data-typography-scope="app" className="text-sm text-foreground">
      <p className="mb-4 text-xs text-muted-foreground">
        Partner Agreement — version {AGREEMENT_VERSION}
      </p>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
