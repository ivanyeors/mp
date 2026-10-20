"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { KeyRound, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { formatAdminDateMY, formatAdminDateTimeMY } from "@/lib/format/admin-date";
import type { Customer } from "@/lib/types/ecommerce";
import type { MigratedCustomerFacts, MigratedCustomerResult } from "@/lib/customer-migration/overview";

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(amount);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm">{children}</dd>
        </div>
    );
}

/**
 * The Account status of any Customer (migration slice 12): signed up since a
 * date, or no account yet, and the last signed-in visit. Read from the
 * `customers` row itself; CRM slice 11 grows this into its Contact and
 * sign-in card.
 */
export function AccountCard({
    customer,
}: {
    customer: Pick<Customer, "email" | "auth_user_id" | "account_linked_at" | "account_last_seen_at">;
}) {
    const signedUp = customer.auth_user_id != null;
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <KeyRound className="h-4 w-4" />
                    Account
                </CardTitle>
            </CardHeader>
            <CardContent>
                <dl className="space-y-3">
                    <Row label="Account status">
                        {signedUp ? (
                            <span className="inline-flex items-center gap-1">
                                Signed up on {formatAdminDateMY(customer.account_linked_at)}
                                <InfoTip label="About the sign-up date">
                                    <p>The day this Customer&apos;s login was bound to their record.</p>
                                    <p>
                                        For an account made before 20 Oct 2026 it is the day the login was
                                        created, the closest record there is.
                                    </p>
                                </InfoTip>
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                No account yet: they become a signed-up customer the first time they sign in
                                with <span className="break-all text-foreground">{customer.email}</span>.
                            </span>
                        )}
                    </Row>
                    {signedUp && (
                        <Row label="Last signed-in visit">
                            <span className="inline-flex items-center gap-1">
                                {customer.account_last_seen_at
                                    ? formatAdminDateTimeMY(customer.account_last_seen_at)
                                    : <span className="text-muted-foreground">None recorded yet</span>}
                                <InfoTip label="About the last signed-in visit">
                                    <p>
                                        The last time they opened one of their account pages while signed in,
                                        to the hour. Browsing the shop without opening their account does not
                                        count, so it is not their last visit to the site.
                                    </p>
                                    <p>Recorded from 20 Oct 2026.</p>
                                </InfoTip>
                            </span>
                        </Row>
                    )}
                </dl>
            </CardContent>
        </Card>
    );
}

/**
 * The From Shopify card (migration slice 12), only for a Migrated customer:
 * the Shopify-era facts kept beside the Customer in `migrated_customers`
 * (ADR 0028 (d)). Shopify orders stay unlinked, so their count and spend are
 * shown apart from the platform's.
 */
export function FromShopifyCard({
    migration,
    importHistoryHref,
}: {
    migration: MigratedCustomerResult | undefined;
    /** The import history, for a viewer who holds `customer-import`; null otherwise. */
    importHistoryHref: string | null;
}) {
    if (!migration) return null;
    if (!migration.ok) {
        return (
            <Card>
                <CardContent className="py-4 text-sm text-muted-foreground">
                    Could not load what the Shopify import holds for this Customer.
                </CardContent>
            </Card>
        );
    }
    if (!migration.facts) return null;
    return <FromShopifyFacts facts={migration.facts} importHistoryHref={importHistoryHref} />;
}

function FromShopifyFacts({
    facts,
    importHistoryHref,
}: {
    facts: MigratedCustomerFacts;
    importHistoryHref: string | null;
}) {
    const batch = facts.batch;
    const batchLabel = batch?.fileName ? batch.fileName : "the import";
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    From Shopify
                </CardTitle>
            </CardHeader>
            <CardContent>
                <dl className="space-y-3">
                    <Row label="Imported">
                        {formatAdminDateMY(facts.importedAt)}, from{" "}
                        {importHistoryHref && batch ? (
                            <Link
                                href={`${importHistoryHref}#batch-${batch.id}`}
                                className="break-all text-primary hover:underline"
                            >
                                {batchLabel}
                            </Link>
                        ) : (
                            <span className="break-all">{batchLabel}</span>
                        )}
                        {batch?.rolledBackAt && (
                            <span className="block text-xs text-muted-foreground">
                                That import was undone on {formatAdminDateMY(batch.rolledBackAt)}. This
                                Customer was kept because they had signed up or bought since.
                            </span>
                        )}
                    </Row>
                    <Row label="Match">
                        {facts.createdByImport
                            ? "Created by the import"
                            : "Matched to an existing Customer"}
                    </Row>
                    <Row label="Orders and spend on Shopify">
                        {facts.shopifyOrdersCount} order{facts.shopifyOrdersCount === 1 ? "" : "s"} ·{" "}
                        {formatSGD(facts.shopifyAmountSpent)}
                        <span className="block text-xs text-muted-foreground">
                            On Shopify, not linked to this account
                        </span>
                    </Row>
                    <Row label="Shopify tags">
                        {facts.shopifyTags.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                                {facts.shopifyTags.map((tag) => (
                                    <Badge key={tag} variant="outline" className="text-xs font-normal">
                                        {tag}
                                    </Badge>
                                ))}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        )}
                    </Row>
                    <Row label="Shopify note">
                        {facts.shopifyNote ? (
                            <span className="whitespace-pre-wrap break-words">{facts.shopifyNote}</span>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        )}
                    </Row>
                    <Row label="Email marketing at export">
                        {facts.emailMarketingAtExport === "yes" ? "Accepted" : "Not accepted"}
                        <span className="block text-xs text-muted-foreground">
                            As the Shopify export of {formatAdminDateMY(facts.exportedAt)} recorded it
                        </span>
                    </Row>
                    {facts.claimedAt && (
                        <Row label="Claim">Claimed on {formatAdminDateMY(facts.claimedAt)}</Row>
                    )}
                </dl>
            </CardContent>
        </Card>
    );
}
