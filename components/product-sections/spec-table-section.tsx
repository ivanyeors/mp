import type { SpecTableContent, SpecTableRow } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type SpecTableSectionProps = {
  content: SpecTableContent;
  rows: SpecTableRow[];
  borderTop?: boolean;
};

export function SpecTableSection({ content, rows, borderTop }: SpecTableSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>
      <div className="overflow-hidden rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-3 py-2.5 font-semibold">{content.headers[0]}</th>
              <th className="px-3 py-2.5 font-semibold">{content.headers[1]}</th>
            </tr>
          </thead>
          <tbody className="[&>tr:not(:last-child)]:border-b">
            {rows.map(([size, price]) => (
              <tr key={size}>
                <td className="px-3 py-2.5 font-medium">{size}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {content.footnotes?.length ? (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {content.footnotes.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
    </ProductSlideSection>
  );
}
