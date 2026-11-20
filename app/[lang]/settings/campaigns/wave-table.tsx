import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";
import { waveName } from "@/lib/email-campaigns/keep-sending";
import { PAUSE_LINES_TEXT, waveRows, type WaveRow } from "@/lib/email-campaigns/send-flow";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-SG");

function StateBadge({ row }: { row: WaveRow }) {
    if (row.state === "ok") return <Badge variant="secondary">{row.stateText}</Badge>;
    const over = row.state === "over_bounce" || row.state === "over_spam";
    return (
        <Badge variant="outline" className={over ? "border-destructive text-destructive" : undefined}>
            {row.stateText}
        </Badge>
    );
}

export function WaveTable({ waves, className }: { waves: CampaignWaveStats[]; className?: string }) {
    const rows = waveRows(waves);
    if (rows.length === 0) return null;
    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium">Waves</h3>
                <InfoTip label="About the pause lines">
                    <p>{PAUSE_LINES_TEXT}</p>
                    <p>
                        Bounces and spam reports arrive from Resend over the next day or two, so look again before
                        the next wave.
                    </p>
                </InfoTip>
            </div>
            <ul className="divide-y border-y md:hidden">
                {rows.map((r) => (
                    <li key={r.wave} className="space-y-1 py-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{r.wave === waveName(r.wave) ? `Wave ${r.wave}` : waveName(r.wave)}</span>
                            <StateBadge row={r} />
                        </div>
                        <p className="text-xs text-muted-foreground">{r.lastSentAt ? formatAdminDateTime(r.lastSentAt) : "not sent yet"}</p>
                        <p className="tabular-nums">
                            Sent {n(r.sent)} · bounced {n(r.bounced)} ({r.bouncedPercent}) · spam {n(r.spam)} ({r.spamPercent})
                            {r.failed ? ` · failed ${n(r.failed)}` : ""}
                        </p>
                    </li>
                ))}
            </ul>
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Wave</TableHead>
                            <TableHead>Last sent</TableHead>
                            <TableHead className="text-right">Sent</TableHead>
                            <TableHead className="text-right">Bounced</TableHead>
                            <TableHead className="text-right">Spam</TableHead>
                            <TableHead className="text-right">Failed</TableHead>
                            <TableHead>State</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((r) => (
                            <TableRow key={r.wave}>
                                <TableCell className="font-medium">{waveName(r.wave)}</TableCell>
                                <TableCell className="text-sm">{r.lastSentAt ? formatAdminDateTime(r.lastSentAt) : "—"}</TableCell>
                                <TableCell className="text-right tabular-nums">{n(r.sent)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {n(r.bounced)} <span className="text-muted-foreground">({r.bouncedPercent})</span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {n(r.spam)} <span className="text-muted-foreground">({r.spamPercent})</span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{n(r.failed)}</TableCell>
                                <TableCell>
                                    <StateBadge row={r} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
