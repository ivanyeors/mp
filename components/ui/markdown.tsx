import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "@/components/ui/mermaid";
import { cn } from "@/lib/utils";

type MdNode = { type: string; value?: string; children?: MdNode[] };
type HastNode = { type: string; tagName?: string; value?: string; properties?: { className?: unknown }; children?: HastNode[] };

function showHtmlAsText() {
  const visit = (node: MdNode) => {
    if (node.type === "html") node.type = "text";
    node.children?.forEach(visit);
  };
  return visit;
}

function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function isMermaid(node: HastNode | undefined): boolean {
  const code = node?.children?.[0];
  const classes = code?.properties?.className;
  return code?.tagName === "code" && Array.isArray(classes) && classes.includes("language-mermaid");
}

const isExternal = (href: string | undefined) => Boolean(href && /^https?:\/\//.test(href));

const COMPONENTS: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-6 text-xl font-semibold tracking-tight first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-6 border-b pb-1.5 text-base font-semibold tracking-tight first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-5 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1.5 mt-4 text-sm font-medium first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-6">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  li: ({ children }) => <li className="leading-6 [&>ul]:my-1 [&>ol]:my-1">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary break-words"
      {...(isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-primary/30 pl-3 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-5 border-border" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => <th className="whitespace-nowrap border-b px-2.5 py-2 font-medium text-muted-foreground">{children}</th>,
  td: ({ children }) => <td className="border-b px-2.5 py-2 align-top [tr:last-child_&]:border-b-0">{children}</td>,
  code: ({ className, children }) => (
    <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]", className)}>{children}</code>
  ),
  pre: ({ node, children }) => {
    const hast = node as HastNode | undefined;
    if (isMermaid(hast)) return <Mermaid chart={textOf(hast?.children?.[0]).trim()} />;
    return <pre className="my-3 overflow-x-auto rounded-lg border bg-muted/50 p-3 text-xs leading-5 [&>code]:bg-transparent [&>code]:p-0">{children}</pre>;
  },
  input: ({ checked }) => <input type="checkbox" checked={Boolean(checked)} readOnly disabled className="mr-1.5 align-middle" />,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("min-w-0 text-sm text-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, showHtmlAsText]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
