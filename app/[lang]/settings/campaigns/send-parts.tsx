import { CheckCircle2, Info, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { SendAllowance } from "@/lib/customer-migration/campaign-ledger";
import type { PreflightCheck } from "@/lib/customer-migration/wave-sender";
import { allowanceMeters, allowanceSummary, CHECK_LABEL } from "@/lib/email-campaigns/send-flow";

/**
 * Pieces the Email campaigns pages share (PRD-campaign-send-flow): a tick or
 * a cross with words, the check list, and the send limit's meters. Status is
 * never colour alone: every icon has a label and every row has words.
 */

export function StatusIcon({ ok, advisory = false }: { ok: boolean; advisory?: boolean }) {
    if (ok) return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />;
    if (advisory) return <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Recommended" />;
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Not yet" />;
}

export function CheckList({ checks }: { checks: PreflightCheck[] }) {
    return (
        <ul className="space-y-2">
            {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                    <StatusIcon ok={c.ok} />
                    <span className="min-w-0">
                        <span className="font-medium">{CHECK_LABEL[c.key] ?? c.key}</span>
                        <span className="block break-words text-xs text-muted-foreground">{c.detail}</span>
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** Today and this month, as Resend counts them, with a line on what is left. */
export function AllowanceMeters({ allowance }: { allowance: SendAllowance }) {
    return (
        <div className="space-y-3">
            {allowanceMeters(allowance).map((m) => (
                <div key={m.label} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm">
                        <span className="shrink-0 font-medium">{m.label}</span>
                        <span className="tabular-nums text-muted-foreground">{m.text}</span>
                    </div>
                    <Progress value={m.percent} aria-label={`${m.label}: ${m.text}`} />
                </div>
            ))}
            <p className={allowance.remaining === 0 ? "text-sm text-destructive" : "text-xs text-muted-foreground"}>
                {allowanceSummary(allowance)}
            </p>
        </div>
    );
}
