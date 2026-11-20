import Link from "next/link";
import { cn } from "@/lib/utils";

export function EmailsNav({
    current,
    campaignsHref,
    funnelHref,
    templatesHref,
}: {
    current: "campaigns" | "funnel" | "templates";
    campaignsHref: string | null;
    funnelHref: string | null;
    templatesHref: string | null;
}) {
    const tabs = [
        { key: "campaigns", label: "Campaigns", href: campaignsHref },
        { key: "funnel", label: "Funnel", href: funnelHref },
        { key: "templates", label: "Templates", href: templatesHref },
    ].filter((t): t is { key: string; label: string; href: string } => Boolean(t.href));
    if (tabs.length < 2) return null;
    return (
        <nav aria-label="Email" className="inline-flex rounded-lg border bg-muted/40 p-1 text-sm">
            {tabs.map((t) => (
                <Link
                    key={t.key}
                    href={t.href}
                    aria-current={t.key === current ? "page" : undefined}
                    className={cn(
                        "inline-flex items-center rounded-md px-3 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground active:bg-background/60 max-md:min-h-11",
                        t.key === current && "bg-background text-foreground shadow-sm",
                    )}
                >
                    {t.label}
                </Link>
            ))}
        </nav>
    );
}
