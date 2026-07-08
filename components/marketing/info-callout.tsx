import { cn } from "@/lib/utils";

type InfoCalloutProps = {
  id?: string;
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function InfoCallout({ id, title, children, className }: InfoCalloutProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 rounded-xl border bg-muted/30 px-5 py-6 md:px-6", className)}
    >
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
