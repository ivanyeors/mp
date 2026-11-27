"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IndexingReport } from "@/lib/seo-metrics/inspect-urls";

const day = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
const int = new Intl.NumberFormat("en-SG");

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : day.format(date);
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

export function issuesAsText(report: IndexingReport): string {
  return report.groups
    .flatMap((group) => group.pages.map((page) => `${group.issue}\t${page.url}`))
    .join("\n");
}

export function PageIndexingPanel({ report }: { report: IndexingReport }) {
  const [copied, setCopied] = useState(false);
  const withIssues = report.groups.reduce((n, group) => n + group.pages.length, 0);

  if (report.checked === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground max-md:p-4">
        No pages checked yet. Once the Search Console service account can read the property, the daily job asks Google
        about every page in the sitemap and lists the ones with a problem here. Setup steps:{" "}
        <code className="rounded bg-muted px-1">.claude/PRD-search-visibility/GOOGLE-ACCESS-SETUP.md</code>.
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issuesAsText(report));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Pages checked</div>
            <div className="text-xl font-semibold tabular-nums">{int.format(report.checked)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Indexed</div>
            <div className="text-xl font-semibold tabular-nums">{int.format(report.indexed)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">With an issue</div>
            <div className="text-xl font-semibold tabular-nums">{int.format(withIssues)}</div>
          </div>
        </div>
        {withIssues > 0 ? (
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy all issues"}
          </Button>
        ) : null}
      </div>

      {withIssues === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Google reports no indexing issue on any page checked.
        </div>
      ) : (
        report.groups.map((group) => (
          <div key={group.issue} className="min-w-0">
            <div className="mb-1 flex items-baseline gap-2 text-sm font-medium">
              <span className="min-w-0 break-words">{group.issue}</span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {int.format(group.pages.length)} {group.pages.length === 1 ? "page" : "pages"}
              </span>
            </div>
            <ul className="divide-y rounded-md border text-xs">
              {group.pages.map((page) => {
                const since = formatDay(page.issue_since);
                const crawled = formatDay(page.last_crawl_time);
                return (
                  <li key={page.url} className="flex items-center gap-3 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="[overflow-wrap:anywhere]" title={page.url}>
                        {pathOf(page.url)}
                      </div>
                      <div className="text-muted-foreground">
                        {[
                          since ? `Since ${since}` : null,
                          crawled ? `Google last read it ${crawled}` : "Google has not read it",
                          page.in_sitemap ? null : "Not in the sitemap",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    {page.inspection_link ? (
                      <a
                        href={page.inspection_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-7"
                        aria-label={`Open ${pathOf(page.url)} in Search Console`}
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      <div className="text-xs text-muted-foreground">
        {formatDay(report.lastChecked) ? `Last checked ${formatDay(report.lastChecked)}. ` : null}
        Checked daily: every page in the sitemap, and every other page Google showed in search in the last 90 days. A
        page outside the sitemap that redirects or is marked noindex is left out as intended. After a fix ships, the
        issue clears here once Google reads the page again.
      </div>
    </div>
  );
}
