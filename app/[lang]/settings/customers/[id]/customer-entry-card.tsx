import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EntryPoint } from "@/lib/analytics/journey/first-touch";
import type { CustomerEntryResult } from "@/lib/crm/customer-entry";
import { formatAdminDateMY } from "@/lib/format/admin-date";

/** "Instagram", with how it came beside it; a plain referral shows the site that linked. */
function entryName(e: EntryPoint): { name: string; via: string | null } {
    if (e.platform) return { name: e.platform, via: e.channelLabel };
    if (e.channel === "referral" && e.source) return { name: e.source, via: e.channelLabel };
    return { name: e.channelLabel, via: null };
}

function EntryRow({ label, entry }: { label: string; entry: EntryPoint }) {
    const { name, via } = entryName(entry);
    return (
        <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium">
                {name}
                {via ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{via}</span> : null}
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                <span>{formatAdminDateMY(entry.startedAt)}</span>
                {entry.campaign ? <span className="break-all">Campaign {entry.campaign}</span> : null}
                {entry.landingPath ? <span className="break-all">Landed on {entry.landingPath}</span> : null}
            </div>
        </div>
    );
}

/**
 * How they found us: the Entry source of the first Visit we can tie to this
 * Customer, the Visit their first Order came from when that is a later one,
 * and their own answer (the Discovery source). Recorded and said are shown
 * apart: they are different facts and often differ.
 */
export function CustomerEntryCard({ entry }: { entry?: CustomerEntryResult }) {
    if (!entry) return null;
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Compass className="size-4" />
                    How they found us
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {!entry.ok ? (
                    <p className="text-sm text-muted-foreground">Could not load how this customer found us.</p>
                ) : (
                    <>
                        {entry.view.first ? (
                            <>
                                <EntryRow label="First visit" entry={entry.view.first} />
                                {entry.view.firstPurchase ? (
                                    <EntryRow label="Visit that led to their first order" entry={entry.view.firstPurchase} />
                                ) : null}
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                No visit to this site is tied to this customer yet. A visit is tied once they enter their
                                email in the configurator or at checkout on their own device.
                            </p>
                        )}
                        {entry.view.told ? (
                            <div className="space-y-0.5 border-t pt-3">
                                <div className="text-xs text-muted-foreground">They told us</div>
                                <div className="text-sm font-medium">{entry.view.told}</div>
                            </div>
                        ) : null}
                        {entry.view.visits > 0 ? (
                            <p className="text-xs text-muted-foreground">
                                {entry.view.visits === 1 ? "1 visit" : `${entry.view.visits.toLocaleString("en-SG")} visits`}{" "}
                                recorded. The first visit is the earliest we can tie to them.
                            </p>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
